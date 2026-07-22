# Implementation Progress

## Module states

- `pricing`: implemented
- `audit`: implemented
- `settlement`: implemented

## Run protocol

One `agent-run.mjs` invocation processes every pending module in order: pricing,
audit, settlement. For a fresh build set all three states to `pending`. For a repair,
set only the affected module to `pending` and record its exact failure below.

## Known bugs

### pricing

- **TS2339:** Before accessing `promotion.category` or `promotion.minSubtotal`, narrow
  the `Promotion` union with `promotion.type === 'threshold'`.# Implementation Progress

## Current module

`bugs -> pricing`

## Module states

- `pricing`: implemented
- `audit`: implemented
- `settlement`: implemented

## Run protocol

One `agent-run.mjs` invocation processes every pending module in the fixed order:
pricing, audit, settlement. `Current module` is informational only; the agent selects
work from module state. For a fresh single-shot build, set all three states to `pending`
and set `Current module` to `pricing` before running once. For a repair run, set only the
affected module to `pending` and add its exact failure under `Known bugs`. Settlement
depends on pricing.

## Known bugs

