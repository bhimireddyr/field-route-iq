import { getAccounts, getVisits } from "../data";

export interface AccountAudit {
  accountId: string;
  weightedScore: number | null;
  trend: "up" | "down" | "flat" | null;
  daysSinceVisit: number | null;
  overdue: boolean;
  status: "healthy" | "watch" | "critical" | "unvisited";
}

function round2HalfUp(n: number): number {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  // stabilize float artifacts by formatting to many decimals, then do half-up
  const normalized = Number(abs.toFixed(12));
  const shifted = Math.floor(normalized * 100 + 0.5);
  const result = (shifted / 100) * sign;
  // ensure exactly 2 decimal places in the returned number
  return Number(result.toFixed(2));
}

export function auditAccounts(asOf: string): AccountAudit[] {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asOf)) {
    throw new Error(`Invalid date: ${asOf}`);
  }

  const accounts = getAccounts();
  const visits = getVisits();

  // helper: sort counted visits by date desc, then id desc
  function sortVisitsDesc(a: typeof visits[0], b: typeof visits[0]) {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  }

  const msPerDay = 24 * 60 * 60 * 1000;

  const out: AccountAudit[] = accounts
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((acct) => {
      const counted = visits
        .filter((v) => v.accountId === acct.id && v.date <= asOf)
        .slice()
        .sort(sortVisitsDesc);

      let weightedScore: number | null = null;
      if (counted.length > 0) {
        const weights = [3, 2, 1];
        const use = counted.slice(0, 3);
        let num = 0;
        let den = 0;
        for (let i = 0; i < use.length; i++) {
          const w = weights[i];
          num += w * use[i].shelfScore;
          den += w;
        }
        const raw = num / den;
        weightedScore = round2HalfUp(raw);
      }

      let trend: AccountAudit["trend"] = null;
      if (counted.length >= 2) {
        const s1 = counted[0].shelfScore;
        const s2 = counted[1].shelfScore;
        if (s1 > s2) trend = "up";
        else if (s1 < s2) trend = "down";
        else trend = "flat";
      }

      let daysSinceVisit: number | null = null;
      if (counted.length > 0) {
        // date-only arithmetic using UTC to avoid timezone drift
        const dAsOf = new Date(asOf + "T00:00:00Z");
        const dLatest = new Date(counted[0].date + "T00:00:00Z");
        const diff = Math.floor((dAsOf.getTime() - dLatest.getTime()) / msPerDay);
        daysSinceVisit = diff;
      }

      const overdue = daysSinceVisit === null || (daysSinceVisit !== null && daysSinceVisit > 14);

      let status: AccountAudit["status"];
      if (weightedScore === null) status = "unvisited";
      else if (weightedScore < 2.5) status = "critical";
      else if (weightedScore < 3.5) status = "watch";
      else status = "healthy";

      return {
        accountId: acct.id,
        weightedScore,
        trend,
        daysSinceVisit,
        overdue,
        status,
      };
    });

  return out;
}
