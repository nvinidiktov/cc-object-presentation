﻿﻿# Subagents Workflow (Universal: Codex + ClaudeCode)

## Topology
- Two parallel implementations in two project copies:
  - `Object Presentation_codex`
  - `Object Presentation_claude`
- Single Integrator decides merges and gate completion.

## Roles
1. Integrator (required)
2. Engine Agent
3. UI Agent
4. QA Agent
5. Design Agent (active on UX-heavy gates)

## Role contracts
- Engine Agent: text splitting, slide logic, fallback, validators.
- UI Agent: editor layout, media workflows, interactions.
- QA Agent: micro-tests, smoke checks, regression catches.
- Design Agent: typography, spacing, interaction clarity.

## Merge governance
Single Integrator Gate:
- no merge without gate report,
- no next gate without integrator decision.

## Required artifacts per gate
- `GateReport`: changes, tests, risks, decision notes.
- `DecisionLog`: unresolved assumptions resolved by default policy.
