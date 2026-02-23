﻿﻿# Decision Log (Autopilot Run)

## 2026-02-22

1. Dependency installation path changed from `npm` to `pnpm` due repeated `npm install` hangs and OS lockups.
2. `pnpm` switched to `node-linker=hoisted` in `app/.npmrc` because symlink mode failed with `ERR_PNPM_EISDIR` on this filesystem path.
3. Active implementation moved into `app/` to avoid corrupted root `node_modules` with locked files.
4. Rule-based slide generation kept as primary guaranteed path; AI reflow implemented as optional and fallback-first.
5. PDF compression strategy implemented as iterative profiles with stronger compression on tile slots first (per TZ priority).

## 2026-02-23

1. Replaced corrupted `research/object_presentation_tz/MASTER_SPEC_v2.md` with the user-provided external `MASTER_SPEC_v2.md` source file (hash verified).
2. Set `MASTER_SPEC_v2.md` as primary specification in `00_README_START_HERE.md` and `TZ_v5_master_spec.md`.
3. Final baseline confirmed with user: slide format is A4 landscape (29.7 x 21.0 cm); specs updated accordingly.
