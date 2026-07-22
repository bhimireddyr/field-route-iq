# Pricing Brief

## Scope and types

- Allowed output: `src/pricing/engine.ts` only.
- Export `CartLine { productId: string; qty: number }`, `PriceOrderInput { lines:
  CartLine[]; accountId: string; date: string }`, `PricedLine { productId: string;
  qty: number; unitPrice: number; gross: number; appliedPromoId: string | null;
  discount: number; net: number }`, `PricedOrder { lines: PricedLine[]; orderLevel:
  { appliedPromoId: string | null; discount: number }; subtotal: number; total: number
  }`, and `priceOrder(input: PriceOrderInput): PricedOrder`.
- Import only `getProduct`, `getAccount`, and `getPromotions` from `../data`. Products
  have `id`, `category`, `unitPrice`; accounts have `id`, `segment`. Promotions all
  have `id`, `validFrom`, `validTo`, optional `eligibleSegments`; `percent_off` has
  `percent`, scope category/productIds; `bogo` has productId/buyQty/getQty;
  `threshold` has category/minSubtotal/amountOff.

## Required behavior

- Validate account first: `Error("Unknown account: <id>")`; validate each product:
  `Error("Unknown product: <id>")`; qty must be positive integer:
  `Error("Invalid qty for <productId>")`. Empty cart has zero totals and no promos.
- Active date bounds are inclusive; segment eligibility is required only when provided.
- Round every output money value half-up to 2 decimals. Avoid naive
  `Math.round(value * 100) / 100`; round gross/discount independently, then net,
  subtotal, and nonnegative total.
- Select one nonzero line promo per line: greatest discount, then earlier validFrom,
  then lexicographically smaller id. Percent applies by scope. BOGO free units are
  `floor(qty / (buyQty + getQty)) * getQty`; zero discount does not apply.
- After line nets, select one qualifying threshold by greatest amountOff then the same
  tie-breaks. A threshold qualifies when its category line-net sum is at least its
  minSubtotal. Line and threshold promos stack; total never becomes negative.