# Shelf Audit Brief

## Scope and types

- Allowed output: `src/audit/shelfAudit.ts` only.
- Export `AccountAudit { accountId: string; weightedScore: number | null; trend: 'up'
  | 'down' | 'flat' | null; daysSinceVisit: number | null; overdue: boolean; status:
  'healthy' | 'watch' | 'critical' | 'unvisited' }` and
  `auditAccounts(asOf: string): AccountAudit[]`.
- Import only `getAccounts` and `getVisits` from `../data`. Accounts have `id`; visits
  have `id`, `accountId`, `date`, `shelfScore`.

## Required behavior

- asOf must exactly be `YYYY-MM-DD`, else `Error("Invalid date: <asOf>")`.
- Return every account, ascending by account id. Count visits dated `<= asOf`; order
  date descending then id descending.
- Use up to three visits with weights 3,2,1, half-up rounded to 2 decimals. No visits
  yields null weightedScore. Trend compares latest vs previous, else null.
- Days since visit uses date-only calendar arithmetic. No visit yields null and overdue
  true; overdue is otherwise strictly more than 14 days.
- Based on rounded score: no visits unvisited; <2.5 critical; <3.5 watch; else healthy.