﻿﻿# ClaudeCode Handoff Prompt (Copy as first message)

Work in this folder only.
First run one-time UTF-8 baseline setup:
- `powershell -ExecutionPolicy Bypass -File tools/setup_utf8_windows.ps1`
Then reopen terminal.

First run encoding normalization:
- `powershell -ExecutionPolicy Bypass -File tools/normalize_docs_encoding.ps1 -Root .`
Read and follow in this exact order:
1) `research/object_presentation_tz/MASTER_SPEC_v2.md` (primary source; A4 baseline)
2) `research/object_presentation_tz/00_README_START_HERE.md`
3) `research/object_presentation_tz/TZ_v5_master_spec.md`
4) `research/object_presentation_tz/IMPLEMENTATION_AUTOPILOT.md`
5) `research/object_presentation_tz/SUBAGENTS_WORKFLOW.md`
6) `research/object_presentation_tz/UNICODE_POLICY.md`
7) `research/object_presentation_tz/DEPENDENCIES_AND_API.md`
8) `research/object_presentation_tz/API_SETUP_POWERSHELL.md`
9) `research/object_presentation_tz/BEST_PRACTICE_DECISIONS.md`
10) `research/object_presentation_tz/DecisionLog.md`

Execution policy:
- Run autonomously by gates A-H.
- Do not pause for approvals between gates.
- Log assumptions and continue if non-critical.
- Keep app functional without AI key using rule-based fallback.
- Prefer stable libraries from dependency policy.
- Slide format is mandatory: A4 landscape (29.7 x 21.0 cm).
- If a ready external module speeds up delivery, it is allowed if quality/regression checks pass.
- Build from scratch by spec; do not reuse legacy implementation as baseline.

Validation loop:
- After each gate: run focused tests + generate sample PDF.
- Compare output with `MASTER_SPEC_v2.md`.
- If mismatch found: fix and re-run until compliant.
