# Work item K6a: Convert field, top, chop, mat and comp operators to defineOperator; delete restated defaults

Depends on: K5
Parallel-safe with: K6b, K3

## Goal
Make declared ParamDefs the only source of defaults in these families. This removes camera-3d's wrong absolute fallbacks.

## Files
- packages/operators/src/field/*.ts
- packages/operators/src/top/*.ts
- packages/operators/src/chop/*.ts
- packages/operators/src/mat/*.ts
- packages/operators/src/comp/*.ts

## Steps
- Wrap each operator in packages/operators/src/{field,top,chop,mat,comp}/ with defineOperator.
- Delete every `params.x ?? literal` fallback, including camera-3d eyeX ?? 300, eyeY ?? 400, eyeZ ?? -300 and orthoSize ?? 500, and the casts on inputs.
- Commit one family per commit.

## Verification
Each of these must hold:
- `grep -rnE 'params\.[A-Za-z0-9]+ \?\?' packages/operators/src/{field,top,chop,mat,comp}` prints nothing.
- `./node_modules/.bin/turbo run typecheck test` exits 0, with snapshots unchanged.

## Risk
Low. The fallbacks are unreachable under CookEngine, which fills defaults first.

## Findings addressed
kernel/operator-type-erasure, td-fidelity/param-def-drift, mat-rop-chop/camera3d-scene-coupling
