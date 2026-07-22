# Route Settlement Brief

## Scope and types

- Allowed output: `src/settlement/settle.ts` only.
- Export `SettleRouteInput { routeId: string; date: string; orders: Array<{ accountId:
  string; lines: CartLine[] }> }`, `RouteSettlement { routeId: string; date: string;
  grossTotal: number; lineDiscountTotal: number; orderDiscountTotal: number;
  discountTotal: number; netTotal: number; perCategory: Record<string, number>;
  promoUsage: Record<string, number>; commission: number; stopsVisited: string[];
  stopsMissed: string[] }`, and `settleRoute(input: SettleRouteInput): RouteSettlement`.
- Import/call runtime `priceOrder` from `../pricing/engine`; import `CartLine`,
  `PriceOrderInput`, and `PricedOrder` with `import type`. Import only `getRoutes` and
  `getProduct` from `../data`. Routes have id and ordered stops/accountId; products
  have id/category. Price results have lines (productId/gross/discount/net/promo id),
  orderLevel (promo id/discount), and total.

## Required behavior

- Unknown route: `Error("Unknown route: <routeId>")`; order account absent from route:
  `Error("Account not on route: <accountId>")`. Price every order; pricing errors pass
  through unchanged. Empty orders are valid.
- Half-up round all aggregates: gross, line discount, order discount, combined discount,
  net total. Per-category sums line nets only, omits absent categories, keys ascending.
  Promo usage counts non-null line/order applications; keys ascending.
- Commission is marginal: first 200 at 2%, next 300 at 5%, remainder at 8%; round only
  the final amount.
- Stops visited/missed are unique route stop ids in first route-stop order, based on
  whether that account has at least one order.