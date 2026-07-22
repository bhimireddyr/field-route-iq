import { getAccounts, getVisits } from '../data';

export type AccountAudit = {
  accountId: string;
  weightedScore: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  daysSinceVisit: number | null;
  overdue: boolean;
  status: 'healthy' | 'watch' | 'critical' | 'unvisited';
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

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export function auditAccounts(asOf: string): AccountAudit[] {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asOf)) {
    throw new Error(`Invalid date: ${asOf}`);
  }
  const asOfDate = parseDateUTC(asOf);
  const accounts = getAccounts();
  const visits = getVisits();

  const visitsByAccount = new Map<string, any[]>();
  for (const v of visits) {
    if (!v || !v.accountId || !v.date) continue;
    // include only visits where visit.date <= asOf
    if (v.date > asOf) continue;
    if (!visitsByAccount.has(v.accountId)) visitsByAccount.set(v.accountId, []);
    visitsByAccount.get(v.accountId)!.push(v);
  }

  const results: AccountAudit[] = accounts.map((a: any) => {
    const acctVisits = (visitsByAccount.get(a.id) || []).slice();
    // sort by date desc, then id desc
    acctVisits.sort((x: any, y: any) => {
      if (x.date === y.date) {
        if (x.id < y.id) return 1;
        if (x.id > y.id) return -1;
        return 0;
      }
      if (x.date < y.date) return 1;
      if (x.date > y.date) return -1;
      return 0;
    });

    if (acctVisits.length === 0) {
      return {
        accountId: a.id,
        weightedScore: null,
        trend: null,
        daysSinceVisit: null,
        overdue: true,
        status: 'unvisited' as const,
      };
    }

    const latest = acctVisits[0];
    const prev = acctVisits.length >= 2 ? acctVisits[1] : null;

    // use at most three latest visits with weights 3,2,1
    const used = acctVisits.slice(0, 3);
    const weights = [3, 2, 1];
    let weightSum = 0;
    let weightedSum = 0;
    for (let i = 0; i < used.length; i++) {
      const v = used[i];
      const w = weights[i];
      weightSum += w;
      weightedSum += (v.shelfScore || 0) * w;
    }
    const rawScore = weightedSum / (weightSum || 1);
    const roundedScore = roundHalfUp(rawScore);

    // trend
    let trend: AccountAudit['trend'] = null;
    if (prev) {
      if (latest.shelfScore > prev.shelfScore) trend = 'up';
      else if (latest.shelfScore < prev.shelfScore) trend = 'down';
      else trend = 'flat';
    }

    // daysSinceVisit (whole calendar days from latest ISO date to asOf)
    const latestDate = parseDateUTC(latest.date);
    const diffMs = asOfDate.getTime() - latestDate.getTime();
    const daysSinceVisit = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    const overdue = daysSinceVisit === null ? true : daysSinceVisit > 14 || acctVisits.length === 0;

    // status mapping
    let status: AccountAudit['status'];
    if (acctVisits.length === 0) {
      status = 'unvisited';
    } else if (roundedScore < 2.5) {
      status = 'critical';
    } else if (roundedScore < 3.5) {
      status = 'watch';
    } else {
      status = 'healthy';
    }

    return {
      accountId: a.id,
      weightedScore: roundedScore,
      trend,
      daysSinceVisit,
      overdue,
      status,
    };
  });

  // sort by ascending accountId
  results.sort((x, y) => (x.accountId < y.accountId ? -1 : x.accountId > y.accountId ? 1 : 0));
  return results;
}
