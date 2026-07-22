import { getRoutes, getProduct } from '../data'
import { priceOrder } from '../pricing/engine'
import type { PriceOrderInput, PricedOrder } from '../pricing/engine'

export interface SettleRouteInput {
  routeId: string
  date: string
  orders: Array<{ accountId: string; lines: { productId: string; qty: number }[] }>
}

export interface RouteSettlement {
  routeId: string
  date: string
  grossTotal: number
  lineDiscountTotal: number
  orderDiscountTotal: number
  discountTotal: number
  netTotal: number
  perCategory: Record<string, number>
  promoUsage: Record<string, number>
  commission: number
  stopsVisited: string[]
  stopsMissed: string[]
}

function round2(num: number): number {
  return Number(Math.round(Number(num + 'e+2')) + 'e-2')
}

export function settleRoute(input: SettleRouteInput): RouteSettlement {
  const routes = getRoutes()
  const route = routes.find((r) => r.id === input.routeId)
  if (!route) {
    throw new Error(`Unknown route: ${input.routeId}`)
  }

  const stopAccountIds = route.stops.map((s) => s.accountId)
  const stopSet = new Set(stopAccountIds)

  // validate orders' accounts
  for (const order of input.orders) {
    if (!stopSet.has(order.accountId)) {
      throw new Error(`Account not on route: ${order.accountId}`)
    }
  }

  // Price each order
  type PricedOrderWithAccount = { accountId: string; priced: PricedOrder }
  const pricedOrders: PricedOrderWithAccount[] = []

  for (const order of input.orders) {
    const poInput: PriceOrderInput = { lines: order.lines, accountId: order.accountId, date: input.date }
    const priced = priceOrder(poInput)
    pricedOrders.push({ accountId: order.accountId, priced })
  }

  // Aggregations
  let grossSum = 0
  let lineDiscountSum = 0
  let orderDiscountSum = 0
  let netSum = 0

  const categoryMap = new Map<string, number>()
  const promoMap = new Map<string, number>()

  for (const po of pricedOrders) {
    const priced = po.priced
    for (const line of priced.lines) {
      grossSum += line.gross
      lineDiscountSum += line.discount

      // perCategory by product category, sum net
      const product = getProduct(line.productId)
      const category = product ? product.category : 'unknown'
      const prev = categoryMap.get(category) ?? 0
      categoryMap.set(category, prev + line.net)

      if (line.appliedPromoId) {
        promoMap.set(line.appliedPromoId, (promoMap.get(line.appliedPromoId) ?? 0) + 1)
      }
    }

    orderDiscountSum += priced.orderLevel.discount
    if (priced.orderLevel.appliedPromoId) {
      promoMap.set(priced.orderLevel.appliedPromoId, (promoMap.get(priced.orderLevel.appliedPromoId) ?? 0) + 1)
    }

    netSum += priced.total
  }

  const grossTotal = round2(grossSum)
  const lineDiscountTotal = round2(lineDiscountSum)
  const orderDiscountTotal = round2(orderDiscountSum)
  const discountTotal = round2(lineDiscountTotal + orderDiscountTotal)
  const netTotal = round2(netSum)

  // perCategory: round and omit zero-line categories; keys ascending
  const perCategoryEntries = Array.from(categoryMap.entries())
    .map(([k, v]) => [k, round2(v)] as [string, number])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  const perCategory: Record<string, number> = {}
  for (const [k, v] of perCategoryEntries) {
    perCategory[k] = v
  }

  // promoUsage: only present promos, keys ascending
  const promoEntries = Array.from(promoMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const promoUsage: Record<string, number> = {}
  for (const [k, v] of promoEntries) {
    if (v > 0) promoUsage[k] = v
  }

  // commission: marginal tiers on netTotal, rounded only at end
  const tier1 = Math.min(netTotal, 200)
  const tier2 = Math.min(Math.max(netTotal - 200, 0), 300)
  const tier3 = Math.max(netTotal - 500, 0)
  const commissionRaw = tier1 * 0.02 + tier2 * 0.05 + tier3 * 0.08
  const commission = round2(commissionRaw)

  // stopsVisited & stopsMissed
  const visitedSet = new Set<string>()
  for (const o of input.orders) {
    visitedSet.add(o.accountId)
  }

  const stopsVisited: string[] = []
  const stopsMissed: string[] = []
  const seen = new Set<string>()
  for (const s of route.stops) {
    const aid = s.accountId
    if (seen.has(aid)) continue // keep only first occurrence
    seen.add(aid)
    if (visitedSet.has(aid)) stopsVisited.push(aid)
    else stopsMissed.push(aid)
  }

  return {
    routeId: input.routeId,
    date: input.date,
    grossTotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    netTotal,
    perCategory,
    promoUsage,
    commission,
    stopsVisited,
    stopsMissed,
  }
}
