## Field Route IQ implementation workflow

This repository is a staged implementation challenge. The active module brief is a
complete implementation contract for the run. Do not read `SPEC.md` to expand scope.

1. **Gate:** Your first and only initial read is `.github/harness/PROGRESS.md`. Do
   not read briefs, source files, or directories in parallel or in preparation.
2. Identify `pending` modules in fixed order: pricing, audit, settlement. If none are
   pending, stop immediately with no further reads, searches, commands, or edits.
3. In this same session, process each pending module in order. Start each module only
   after the preceding module is marked implemented. Read exactly one matching brief
   at that point: `pricing` -> `pricing-brief.md`, `audit` -> `audit-brief.md`,
   `settlement` -> `settlement-brief.md`. Do not prefetch or parallelize brief reads.
   If its target source file already exists, read that file only to repair it.
4. Create or edit files only in the active module's allowed output directory. Do not edit
	`src/data`, `src/legacy`, UI code, or unrelated files.
5. Do not read `SPEC.md`, `src/data/index.ts`, JSON data, package files, legacy code,
	UI code, or other modules. Do not search or list directories to discover files.
6. Do not write or run tests, scratch scripts, compile commands, or formatting commands.
	The wrapper compiles after the agent exits. Do not implement the unscored UI work.
7. Preserve the exported interfaces and error strings in the module brief exactly.
8. After each module, remove only its fixed `Known bugs` entries and change only its
	state from `pending` to `implemented`. Continue immediately to the next pending
	module. Do not mark work `tested`.

## TypeScript import rule

`verbatimModuleSyntax` is enabled. Import every interface or type alias with
`import type`; value imports must contain only runtime values. For example:
`import { priceOrder } from '../pricing/engine'` and
`import type { PriceOrderInput, PricedOrder } from '../pricing/engine'`.

The wrapper performs the only allowed compile check after this session. Record
`implemented`, never `tested`.
