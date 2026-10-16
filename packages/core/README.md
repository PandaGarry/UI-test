# @frontline/core

Simulation core shared by the client (`client/`) and the game runner (`server/src/runner/`).

- Contents: `game/`, `map/` (map data and codec), `protocol/` (wire format), `util/` (pure helpers).
- Rule: files here import only from this package. Checked by `npm run arch:strict` (scripts/arch/check-boundaries.cjs).
- Consumers import it as `@frontline/core/<path>` (for example `@frontline/core/game/Game`), linked with `file:../packages/core`.
- No DOM, no UI, no platform services (language, cookies, settings) and no network adapters here.
