# Shelf Audit Brief

## Scope

- Allowed output: `src/audit/shelfAudit.ts` only.
- Create the parent directory if missing. Export
  `AccountAudit { accountId: string; weightedScore: number | null; trend: 'up' |
  'down' | 'flat' | null; daysSinceVisit: number | null; overdue: boolean; status:
  'healthy' | 'watch' | 'critical' | 'unvisited' }` and
  `auditAccounts(asOf: string): AccountAudit[]`.
- Import all data via `getAccounts` and `getVisits` from `../data`.
- Accounts have `id`. Visits have `id`, `accountId`, `date`, and `shelfScore`.

## Rules

- `asOf` must exactly match `YYYY-MM-DD`; otherwise throw
  `Error("Invalid date: <asOf>")`.
- Return one record per account, sorted by ascending `accountId`.
- Count visits only where `visit.date <= asOf`. Sort counted visits by date descending,
  then id descending. The first is the latest.
- Use at most three latest visits with weights 3, 2, 1. Weighted score is half-up
  rounded to 2 decimals: weighted score sum divided by used-weight sum. No visits
  means `weightedScore: null`.
- With at least two visits, trend compares latest against previous: `up`, `down`, or
  `flat`; otherwise null.
- `daysSinceVisit` is whole calendar days from the latest ISO date to `asOf`, using
  date-only arithmetic. With none it is null. `overdue` is true for no visits or more
  than 14 days, but false at exactly 14.
- Status: no visits `unvisited`; rounded score below 2.5 `critical`; below 3.5
  `watch`; otherwise `healthy`.
- Use the same robust decimal half-up 2-place rounding required by `SPEC.md`.