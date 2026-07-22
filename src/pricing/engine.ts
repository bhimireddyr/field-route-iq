import { getProduct, getAccount, getPromotions } from '../data'

export interface CartLine {
  productId: string
  qty: number
}

export interface PriceOrderInput {
  lines: CartLine[]
  accountId: string
  date: string
}

export interface PricedLine {
  productId: string
  qty: number
  unitPrice: number
  gross: number
  appliedPromoId: string | null
  discount: number
  net: number
}

export interface PricedOrder {
  lines: PricedLine[]
  orderLevel: {
    appliedPromoId: string | null
    discount: number
  }
  subtotal: number
  total: number
}

function round2(num: number): number {
  return Number(Math.round(Number(num + 'e+2')) + 'e-2')
}

export function priceOrder(input: PriceOrderInput): PricedOrder {
  const account = getAccount(input.accountId)
  if (!account) {
    throw new Error(`Unknown account: ${input.accountId}`)
  }

  for (const line of input.lines) {
    const product = getProduct(line.productId)
    if (!product) {
      throw new Error(`Unknown product: ${line.productId}`)
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error(`Invalid qty for ${line.productId}`)
    }
  }

  if (input.lines.length === 0) {
    return {
      lines: [],
      orderLevel: { appliedPromoId: null, discount: 0 },
      subtotal: 0,
      total: 0,
    }
  }

  const activePromos = getPromotions().filter((promo) => {
    const isDateValid = promo.validFrom <= input.date && input.date <= promo.validTo
    const isSegmentEligible =
      !promo.eligibleSegments || promo.eligibleSegments.includes(account.segment)
    return isDateValid && isSegmentEligible
  })

  const pricedLines: PricedLine[] = []

  for (const line of input.lines) {
    const product = getProduct(line.productId)!
    const gross = round2(product.unitPrice * line.qty)

    const candidates: { id: string; validFrom: string; discount: number }[] = []

    for (const promo of activePromos) {
      if (promo.type === 'percent_off') {
        const scope = promo.scope
        let matches = false
        if (scope.category && product.category === scope.category) {
          matches = true
        } else if (scope.productIds && scope.productIds.includes(product.id)) {
          matches = true
        }

        if (matches) {
          const discount = round2((gross * promo.percent) / 100)
          if (discount > 0) {
            candidates.push({
              id: promo.id,
              validFrom: promo.validFrom,
              discount,
            })
          }
        }
      } else if (promo.type === 'bogo') {
        if (promo.productId === product.id) {
          const groupSize = promo.buyQty + promo.getQty
          const freeUnits = Math.floor(line.qty / groupSize) * promo.getQty
          const discount = round2(freeUnits * product.unitPrice)
          if (discount > 0) {
            candidates.push({
              id: promo.id,
              validFrom: promo.validFrom,
              discount,
            })
          }
        }
      }
    }

    let appliedPromoId: string | null = null
    let discount = 0

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.discount !== b.discount) {
          return b.discount - a.discount
        }
        if (a.validFrom !== b.validFrom) {
          return a.validFrom < b.validFrom ? -1 : 1
        }
        if (a.id !== b.id) {
          return a.id < b.id ? -1 : 1
        }
        return 0
      })

      const best = candidates[0]
      appliedPromoId = best.id
      discount = best.discount
    }

    const net = Math.max(0, round2(gross - discount))

    pricedLines.push({
      productId: line.productId,
      qty: line.qty,
      unitPrice: product.unitPrice,
      gross,
      appliedPromoId,
      discount,
      net,
    })
  }

  const subtotal = round2(pricedLines.reduce((sum, l) => sum + l.net, 0))

  const thresholdCandidates: { id: string; validFrom: string; amountOff: number }[] = []

  for (const promo of activePromos) {
    if (promo.type === 'threshold') {
      const categoryNetSum = round2(
        pricedLines
          .filter((line) => getProduct(line.productId)!.category === promo.category)
          .reduce((sum, line) => sum + line.net, 0)
      )

      if (categoryNetSum >= promo.minSubtotal) {
        thresholdCandidates.push({
          id: promo.id,
          validFrom: promo.validFrom,
          amountOff: promo.amountOff,
        })
      }
    }
  }

  let orderAppliedPromoId: string | null = null
  let orderDiscount = 0

  if (thresholdCandidates.length > 0) {
    thresholdCandidates.sort((a, b) => {
      if (a.amountOff !== b.amountOff) {
        return b.amountOff - a.amountOff
      }
      if (a.validFrom !== b.validFrom) {
        return a.validFrom < b.validFrom ? -1 : 1
      }
      if (a.id !== b.id) {
        return a.id < b.id ? -1 : 1
      }
      return 0
    })

    const bestThreshold = thresholdCandidates[0]
    orderAppliedPromoId = bestThreshold.id
    orderDiscount = bestThreshold.amountOff
  }

  const total = Math.max(0, round2(subtotal - orderDiscount))

  return {
    lines: pricedLines,
    orderLevel: {
      appliedPromoId: orderAppliedPromoId,
      discount: orderDiscount,
    },
    subtotal,
    total,
  }
}
