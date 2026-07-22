# Route Settlement Brief

## Scope

- Allowed output: `src/settlement/settle.ts` only.
- Create the parent directory if missing. Export
  `SettleRouteInput { routeId: string; date: string; orders: Array<{ accountId:
  string; lines: CartLine[] }> }`, `RouteSettlement { routeId: string; date: string;
  grossTotal: number; lineDiscountTotal: number; orderDiscountTotal: number;
  discountTotal: number; netTotal: number; perCategory: Record<string, number>;
  promoUsage: Record<string, number>; commission: number; stopsVisited: string[];
  stopsMissed: string[] }`, and `settleRoute(input: SettleRouteInput): RouteSettlement`.
- Import and call `priceOrder` from `../pricing/engine` for every order. Import route
  and product data only with `getRoutes` and `getProduct` from `../data`.
- Import `CartLine`, `PriceOrderInput`, and `PricedOrder` with `import type` from
  `../pricing/engine`; no read of the pricing source is needed. `priceOrder` returns
  lines with productId, gross, discount, net, appliedPromoId, and orderLevel with
  appliedPromoId and discount, plus total. Routes have `id` and ordered stops with
  `accountId`; products have `id` and `category`.
- This project enables `verbatimModuleSyntax`: import `priceOrder` as a value, but
  import `PriceOrderInput`, `PricedOrder`, `CartLine`, and every other type/interface
  with `import type`. Do not mix type-only symbols into a runtime import.

## Validation and aggregation

- Unknown route: `Error("Unknown route: <routeId>")`.
- Every order account must occur among route stops; otherwise
  `Error("Account not on route: <accountId>")`. Empty orders are valid.
- Price every valid order with its account, lines, and input date. Propagate pricing
  errors unchanged.
- Half-up round all specified money totals to 2 decimals: sum line gross; sum line
  discounts; sum order discounts; their combined discount; and sum order totals.
- `perCategory` sums priced line nets by catalog category, does not allocate order
  discounts, omits zero-line categories, and uses ascending sorted keys.
- `promoUsage` counts each non-null applied line promo and each non-null order promo;
  omit unused promotions and use ascending sorted keys.

## Commission and stops

- Commission is marginal on net total: 2% of the first 200, 5% of the next 300, and
  8% of the remainder. Round only the final commission half-up to 2 decimals.
- `stopsVisited` lists unique route stop account ids having an order, in first route
  stop order. `stopsMissed` lists the other unique route stop ids in that same order.