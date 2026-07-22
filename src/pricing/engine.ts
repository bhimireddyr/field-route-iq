import { getProduct, getAccount, getPromotions } from '../data';

export type CartLine = { productId: string; qty: number };
export type PriceOrderInput = { lines: CartLine[]; accountId: string; date: string };
export type PricedLine = {
  productId: string;
  qty: number;
  unitPrice: number;
  gross: number;
  appliedPromoId: string | null;
  discount: number;
  net: number;
};
export type PricedOrder = {
  lines: PricedLine[];
  orderLevel: { appliedPromoId: string | null; discount: number };
  subtotal: number;
  total: number;
};

function parseDate(d: string): Date {
  // parse YYYY-MM-DD into UTC date at midnight
  const [y, m, day] = d.split('-').map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, day));
}

function cmpDateStr(a: string, b: string) {
  // earlier -> -1
  const da = parseDate(a).getTime();
  const db = parseDate(b).getTime();
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

function roundHalfUp(val: number): number {
  const sign = val < 0 ? -1 : 1;
  let v = Math.abs(val);
  // scale to thousandths to inspect the 3rd decimal
  const scaled = Math.floor(v * 1000 + 1e-8);
  const last = scaled % 10;
  const base = Math.floor(scaled / 10); // hundredths truncated
  let cents = base;
  if (last >= 5) cents += 1;
  return sign * (cents / 100);
}

export function priceOrder(input: PriceOrderInput): PricedOrder {
  const { lines: inLines, accountId, date } = input;
  // validate account
  const account = getAccount(accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);

  // empty cart
  if (!inLines || inLines.length === 0) {
    return {
      lines: [],
      orderLevel: { appliedPromoId: null, discount: 0 },
      subtotal: 0,
      total: 0,
    };
  }

  const promotions = (getPromotions && (getPromotions() as any[])) || [];
  const activePromos = promotions.filter((p: any) => {
    if (!p || !p.validFrom || !p.validTo) return false;
    if (cmpDateStr(p.validFrom, date) > 0) return false; // validFrom > date
    if (cmpDateStr(p.validTo, date) < 0) return false; // validTo < date
    if (p.eligibleSegments && Array.isArray(p.eligibleSegments)) {
      return p.eligibleSegments.includes(account.segment);
    }
    return true;
  });

  // validate lines and enrich product info
  const enriched = inLines.map((ln) => {
    const product = getProduct(ln.productId);
    if (!product) throw new Error(`Unknown product: ${ln.productId}`);
    if (!Number.isInteger(ln.qty) || ln.qty <= 0)
      throw new Error(`Invalid qty for ${ln.productId}`);
    return {
      productId: ln.productId,
      qty: ln.qty,
      unitPrice: product.unitPrice,
      category: product.category,
    };
  });

  // compute gross and candidate line promotions
  const linesWithGross = enriched.map((e) => {
    const grossRaw = e.unitPrice * e.qty;
    const gross = roundHalfUp(grossRaw);
    return { ...e, gross };
  });

  type LineCalc = {
    productId: string;
    qty: number;
    unitPrice: number;
    category: string;
    gross: number;
    appliedPromoId: string | null;
    discount: number;
    net: number;
  };

  const lineCalcs: LineCalc[] = linesWithGross.map((L) => ({
    productId: L.productId,
    qty: L.qty,
    unitPrice: L.unitPrice,
    category: L.category,
    gross: L.gross,
    appliedPromoId: null,
    discount: 0,
    net: 0,
  }));

  // helper to compute discount for a promo on a line
  function computeLineDiscountForPromo(line: LineCalc, promo: any): number {
    if (!promo || !promo.type) return 0;
    if (promo.type === 'percent_off') {
      // check scope
      const appliesCategory = promo.category && promo.category === line.category;
      const appliesProductIds = promo.productIds && Array.isArray(promo.productIds) && promo.productIds.includes(line.productId);
      if (!appliesCategory && !appliesProductIds) return 0;
      if (typeof promo.percent !== 'number' || promo.percent <= 0) return 0;
      const raw = (line.gross * promo.percent) / 100;
      return roundHalfUp(raw);
    }
    if (promo.type === 'bogo') {
      if (promo.productId !== line.productId) return 0;
      const buyQty = Number(promo.buyQty) || 0;
      const getQty = Number(promo.getQty) || 0;
      if (buyQty <= 0 || getQty <= 0) return 0;
      const group = buyQty + getQty;
      const freeUnits = Math.floor(line.qty / group) * getQty;
      if (freeUnits <= 0) return 0;
      const raw = freeUnits * line.unitPrice;
      return roundHalfUp(raw);
    }
    // thresholds handled at order level
    return 0;
  }

  // For each line, find best nonzero promo
  for (let i = 0; i < lineCalcs.length; i++) {
    const line = lineCalcs[i];
    const candidatePromos: any[] = [];
    for (const p of activePromos) {
      if (p.type === 'threshold') continue;
      const disc = computeLineDiscountForPromo(line, p);
      if (disc > 0) candidatePromos.push({ promo: p, discount: disc });
    }
    if (candidatePromos.length === 0) {
      line.appliedPromoId = null;
      line.discount = 0;
      line.net = roundHalfUp(line.gross - line.discount);
      if (line.net < 0) line.net = 0;
      continue;
    }
    // select largest discount, then earlier validFrom, then lexicographically smaller id
    candidatePromos.sort((a, b) => {
      if (a.discount !== b.discount) return b.discount - a.discount; // largest first
      const dcmp = cmpDateStr(a.promo.validFrom, b.promo.validFrom);
      if (dcmp !== 0) return dcmp; // earlier validFrom => negative => a before b
      // lexicographic id
      if (a.promo.id < b.promo.id) return -1;
      if (a.promo.id > b.promo.id) return 1;
      return 0;
    });
    const winner = candidatePromos[0];
    line.appliedPromoId = winner.promo.id;
    line.discount = roundHalfUp(winner.discount);
    line.net = roundHalfUp(line.gross - line.discount);
    if (line.net < 0) line.net = 0;
  }

  // subtotal is sum of line nets, rounded
  const subtotalRaw = lineCalcs.reduce((s, l) => s + l.net, 0);
  const subtotal = roundHalfUp(subtotalRaw);

  // threshold promotions: evaluate only after line nets are known
  const thresholdPromos = activePromos.filter((p: any) => p.type === 'threshold');
  // find qualifying thresholds: sum of post-line-discount nets in its category >= minSubtotal
  const qualifying: any[] = [];
  for (const p of thresholdPromos as any[]) {
    const cat = p.category;
    const minSubtotal = Number(p.minSubtotal) || 0;
    const sumForCat = lineCalcs.reduce((acc, l) => (l.category === cat ? acc + l.net : acc), 0);
    if (roundHalfUp(sumForCat) + 1e-12 >= minSubtotal) {
      qualifying.push(p);
    }
  }

  let orderAppliedPromoId: string | null = null;
  let orderDiscount = 0;
  if (qualifying.length > 0) {
    qualifying.sort((a: any, b: any) => {
      const aAmt = Number(a.amountOff) || 0;
      const bAmt = Number(b.amountOff) || 0;
      if (aAmt !== bAmt) return bAmt - aAmt; // largest amountOff first
      const dcmp = cmpDateStr(a.validFrom, b.validFrom);
      if (dcmp !== 0) return dcmp;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    const win = qualifying[0];
    orderAppliedPromoId = win.id;
    orderDiscount = roundHalfUp(Number(win.amountOff) || 0);
  }

  const totalRaw = subtotal - orderDiscount;
  let total = roundHalfUp(totalRaw);
  if (total < 0) total = 0;

  const pricedLines: PricedLine[] = lineCalcs.map((l) => ({
    productId: l.productId,
    qty: l.qty,
    unitPrice: l.unitPrice,
    gross: roundHalfUp(l.gross),
    appliedPromoId: l.appliedPromoId,
    discount: roundHalfUp(l.discount),
    net: roundHalfUp(l.net),
  }));

  return {
    lines: pricedLines,
    orderLevel: { appliedPromoId: orderAppliedPromoId, discount: orderDiscount },
    subtotal,
    total,
  };
}
