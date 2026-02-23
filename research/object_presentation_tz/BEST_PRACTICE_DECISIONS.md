﻿﻿# Best-Practice Decisions (Locked for MVP)

This file captures decisions already made so implementation does not stall.

## Process
1. Gate-driven execution A-H.
2. Autopilot mode allowed without intermediate approvals.
3. Stop only for hard blockers.
4. Decision log required for assumptions.

## Quality
1. Pre-export checklist blocks only on errors.
2. Rule-based fallback must always work when AI fails.
3. Smoke test after each gate.
4. Minimum micro-test set for core business logic.

## Performance
1. Prioritize functionality through Gate F in 7-9 hours.
2. Keep heavy tasks resilient and restart-safe.
3. Prefer proven libraries over custom rewrites.

## Data and safety
1. UTF-8 docs and Unicode policy enforced.
2. Internal storage keys ASCII-safe; user-facing labels can stay Russian.
3. Non-destructive operations by default.

## Delivery
1. One source of truth for spec: `research/object_presentation_tz/MASTER_SPEC_v2.md`.
2. Handoff-ready pack for Codex and ClaudeCode is mandatory.
