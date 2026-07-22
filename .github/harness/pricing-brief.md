# Pricing Brief

## Scope

- Allowed output: `src/pricing/engine.ts` only.
- Create the parent directory if missing. Export exactly:
  `CartLine { productId: string; qty: number }`,
  `PriceOrderInput { lines: CartLine[]; accountId: string; date: string }`,
  `PricedLine { productId: string; qty: number; unitPrice: number; gross: number;
  appliedPromoId: string | null; discount: number; net: number }`,
  `PricedOrder { lines: PricedLine[]; orderLevel: { appliedPromoId: string | null;
  discount: number }; subtotal: number; total: number }`, and
  `priceOrder(input: PriceOrderInput): PricedOrder`.
- Import catalog data only through `getProduct`, `getAccount`, and `getPromotions`
  from `../data`. Never import JSON directly or use legacy pricing.
- Loader data used here: products have `id`, `category`, `unitPrice`; accounts have
  `id`, `segment`; promotions all have `id`, `validFrom`, `validTo`, and optional
  `eligibleSegments`. `percent_off` has `percent` and scope category or productIds;
  `bogo` has productId, buyQty, getQty; `threshold` has category, minSubtotal,
  amountOff.

## Validation

- Validate account before processing lines. Unknown account: `Error("Unknown account: <id>")`.
- For each line, unknown product: `Error("Unknown product: <id>")`.
- Quantity must be an integer greater than zero: `Error("Invalid qty for <productId>")`.
- An empty cart is valid: empty lines; no order promo; all monetary totals 0.

## Money

- Every output monetary value uses decimal half-up rounding to 2 places, including
  values that are summed. Do not use bare `Math.round(value * 100) / 100`: binary
  float representations make values such as `2.175` round down incorrectly.
- Round line gross and line discount independently. `net` is rounded after subtracting
  them and clamped to zero. Round subtotal from summed line nets. Round total from
  subtotal minus the order discount, clamped to zero.

## Active promotions

- A promotion is active when `validFrom <= date <= validTo`, both inclusive, and is
  segment-eligible when `eligibleSegments` is absent or contains the account segment.
- Ignore all inactive or ineligible promotions.
- `percent_off` applies when its category or `productIds` scope matches; discount is
  line gross times percent divided by 100.
- `bogo` applies only to its product. Free units are
  `floor(qty / (buyQty + getQty)) * getQty`; discount is free units times unit price.
  A zero BOGO discount is not applicable.
- For each line select at most one nonzero line promotion: largest discount, then
  earlier `validFrom`, then lexicographically smaller `id`. The selected id is the
  line's `appliedPromoId`; otherwise null.

## Threshold promotions

- Evaluate only after line nets are known. Each threshold qualifies when the sum of
  post-line-discount nets in its category is at least `minSubtotal`.
- Select at most one qualifying threshold: largest `amountOff`, then the same earlier
  `validFrom`, then lexicographically smaller `id` tie-breaks.
- Threshold discounts stack with line discounts, are rounded to 2 decimals, and may
  reduce total to zero but never below it.