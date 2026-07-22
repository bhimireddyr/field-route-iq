import { getRoutes, getProduct } from '../data';
import { priceOrder } from '../pricing/engine';
import type { CartLine, PriceOrderInput, PricedOrder } from '../pricing/engine';

export type SettleRouteInput = {
  routeId: string;
  date: string;
  orders: Array<{ accountId: string; lines: CartLine[] }>;
};

export type RouteSettlement = {
  routeId: string;
  date: string;
  grossTotal: number;
  lineDiscountTotal: number;
  orderDiscountTotal: number;
  discountTotal: number;
  netTotal: number;
  perCategory: Record<string, number>;
  promoUsage: Record<string, number>;
  commission: number;
  stopsVisited: string[];
  stopsMissed: string[];
};

function roundHalfUp(val: number): number {
  const sign = val < 0 ? -1 : 1;
  let v = Math.abs(val);
  const scaled = Math.floor(v * 1000 + 1e-8);
  const last = scaled % 10;
  const base = Math.floor(scaled / 10);
  let cents = base;
  if (last >= 5) cents += 1;
  return sign * (cents / 100);
}

export function settleRoute(input: SettleRouteInput): RouteSettlement {
  const { routeId, date, orders } = input;
  const routes = getRoutes();
  const route = routes.find((r: any) => r.id === routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);

  const stops = (route.stops || []).map((s: any) => s.accountId);
  const stopSet = new Set(stops);

  // validate every order account is on route
  for (const o of orders) {
    if (!stopSet.has(o.accountId)) throw new Error(`Account not on route: ${o.accountId}`);
  }

  let grossTotalRaw = 0;
  let lineDiscountTotalRaw = 0;
  let orderDiscountTotalRaw = 0;
  let netTotalRaw = 0;

  const perCategoryMap = new Map<string, number>();
  const promoUsageMap = new Map<string, number>();

  // track which stops had orders
  const stopsWithOrderSet = new Set<string>();

  for (const ord of orders) {
    const priceInput: PriceOrderInput = { accountId: ord.accountId, lines: ord.lines, date };
    // priceOrder may throw; propagate
    const priced: PricedOrder = priceOrder(priceInput as any);

    // sum priced lines
    for (const l of priced.lines) {
      grossTotalRaw += l.gross;
      lineDiscountTotalRaw += l.discount;
      // perCategory needs product category
      const prod = getProduct(l.productId);
      const cat = prod ? prod.category : 'unknown';
      const prev = perCategoryMap.get(cat) || 0;
      perCategoryMap.set(cat, prev + l.net);
      // promo usage count for line promo
      if (l.appliedPromoId) {
        promoUsageMap.set(l.appliedPromoId, (promoUsageMap.get(l.appliedPromoId) || 0) + 1);
      }
    }

    // order-level discount
    if (priced.orderLevel && priced.orderLevel.appliedPromoId) {
      orderDiscountTotalRaw += priced.orderLevel.discount;
      promoUsageMap.set(priced.orderLevel.appliedPromoId, (promoUsageMap.get(priced.orderLevel.appliedPromoId) || 0) + 1);
    }

    netTotalRaw += priced.total;

    // mark stop visited
    stopsWithOrderSet.add(ord.accountId);
  }

  const grossTotal = roundHalfUp(grossTotalRaw);
  const lineDiscountTotal = roundHalfUp(lineDiscountTotalRaw);
  const orderDiscountTotal = roundHalfUp(orderDiscountTotalRaw);
  const discountTotal = roundHalfUp(lineDiscountTotal + orderDiscountTotal);
  const netTotal = roundHalfUp(netTotalRaw);

  // perCategory: omit zero-line categories, use ascending sorted keys, and round values
  const perCategoryObj: Record<string, number> = {};
  Array.from(perCategoryMap.entries())
    .filter(([, v]) => Math.abs(v) > 1e-9)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .forEach(([k, v]) => {
      perCategoryObj[k] = roundHalfUp(v);
    });

  // promoUsage: omit unused promos, ascending keys
  const promoUsageObj: Record<string, number> = {};
  Array.from(promoUsageMap.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .forEach(([k, v]) => {
      promoUsageObj[k] = v;
    });

  // commission: marginal on net total
  let remaining = netTotal;
  let commissionRaw = 0;
  if (remaining > 0) {
    const first = Math.min(remaining, 200);
    commissionRaw += first * 0.02;
    remaining -= first;
  }
  if (remaining > 0) {
    const second = Math.min(remaining, 300);
    commissionRaw += second * 0.05;
    remaining -= second;
  }
  if (remaining > 0) {
    commissionRaw += remaining * 0.08;
    remaining = 0;
  }
  const commission = roundHalfUp(commissionRaw);

  // stopsVisited in first route stop order unique, stopsMissed other unique
  const stopsVisited: string[] = [];
  const stopsMissed: string[] = [];
  for (const s of stops) {
    if (stopsWithOrderSet.has(s)) stopsVisited.push(s);
    else stopsMissed.push(s);
  }

  return {
    routeId,
    date,
    grossTotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    netTotal,
    perCategory: perCategoryObj,
    promoUsage: promoUsageObj,
    commission,
    stopsVisited,
    stopsMissed,
  };
}
