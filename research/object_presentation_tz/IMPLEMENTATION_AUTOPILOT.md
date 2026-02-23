﻿﻿# Implementation Autopilot

## Operating mode
Run autonomously without waiting for user approvals between stages.

## Hard stop conditions only
- critical environment blocker,
- unavoidable data corruption risk,
- impossible dependency install.

Otherwise continue by spec + best judgment and log decisions.

## 8 execution gates
A. Project scaffold + local run + storage baseline
B. Object card + required field validation
C. Media library (bulk upload, preview, replace, usage badges)
D. Rule-based text/slide engine + slide-2 logic
E. Editor (DnD, limits, undo/redo)
F. PDF export + size optimization
G. AI smart reflow + fallback handling
H. Smoke tests + stabilization

## Timeboxed run strategy
- 7-9 hour run target: complete through Gate F minimum.
- Continue to G/H if stable and no hard blockers.

## Mandatory output after run
- Gate status summary (Done/Partial)
- Tests executed
- Decisions made without user
- Known risks and next actions
