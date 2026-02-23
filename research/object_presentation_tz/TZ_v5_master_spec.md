﻿﻿# TZ v5 - Master Spec

## Spec precedence
- Primary source: `research/object_presentation_tz/MASTER_SPEC_v2.md`.
- This file is a condensed execution scope and must not override the primary source.

## Product goal
Local web app (`localhost`) for real-estate agents:
- fill object card,
- upload and manage photos,
- auto-generate slides by strict template rules,
- edit content inside fixed slots,
- export final PDF.

## Slide format baseline
- Final mandatory slide format: **A4 landscape (29.7 x 21.0 cm)**.

## In scope (v1)
- Desktop-first web UI.
- Single local user in UI.
- One template style with fixed slots.
- Media library with bulk upload, previews, quick replace.
- Slide reorder (DnD), undo/redo, autosave.
- PDF export with target size <= 10 MB.
- AI smart reflow button + guaranteed rule-based fallback.

## Out of scope (v1)
- Admin panel.
- Mobile editor.
- Video formats.
- CRM integrations.
- Real-time collaborative editing.

## Core content rules
1. Slide 2 is always Advantages.
2. Advantages are extracted from description; if missing, export is blocked.
3. Main text is split by paragraphs only (no split inside paragraph).
4. If "intro paragraph + advantages" does not fit Slide 2:
   - keep advantages on Slide 2,
   - move intro paragraph to next text slide.
5. Text overflow in block is blocked at limit.

## Object fields
### Required
- Complex name (if empty -> "Object Presentation")
- Address
- Metro
- Price
- Object type
- Area
- Floor (and building floors if available)
- Finish

### Optional prefilled
- Rooms
- Ceiling height
- Views
- Bathrooms
- Parking
- Balcony

### Flexible
- Custom parameter key/value rows.
- First slide has fixed 10 rows; row labels can be renamed.

## UX requirements
- Editor layout: slides list, canvas, properties panel, media panel.
- Media items show type + usage count.
- Deleting media is blocked if used in slides.
- Pre-export checklist: errors block export, warnings do not.
- Save status badges: Saving / Saved / Error.

## Reliability rules
- Rule-based generation must always be available.
- If AI/API fails, switch to rule-based immediately with notice.

## PDF and image rules
- Auto-fit image to slot + manual pan/zoom in slot.
- Soft warning after 40 regular + 10 fullscreen photos.
- Target export size <= 10 MB.
- Compression priority: small tile images first, fullscreen images later.

## Delivery governance
- Implementation runs in gates A-H.
- No blocking waits between gates in autopilot mode.
- Decisions made without user are logged.
- Gate transition requires smoke check.

## Option ranking
Option A -> Option B -> Option C
- A: use proven libraries + custom domain logic (preferred)
- B: fully custom stack
- C: AI-first without robust fallback

## Open Questions
none
