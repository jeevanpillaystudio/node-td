# Work item K6b: Convert SOP operators to defineOperator; delete restated defaults

Depends on: K5
Parallel-safe with: K6a, K3

## Goal
Do the same as K6a for packages/operators/src/sop/**.

## Files
- packages/operators/src/sop/**/*.ts

## Steps
- Wrap each SOP, including heightfield/, camera/, subscapes/ and meridian/, in defineOperator.
- Delete the `??` fallbacks and input casts.
- Commit one subfolder per commit.

## Verification
Each of these must hold:
- `grep -rnE 'params\.[A-Za-z0-9]+[[:space:]]*\?\?' packages/operators/src/sop` prints nothing.
- `./node_modules/.bin/turbo run typecheck test` exits 0, with snapshots unchanged.

## Risk
Low.

## Findings addressed
kernel/operator-type-erasure, td-fidelity/param-def-drift
