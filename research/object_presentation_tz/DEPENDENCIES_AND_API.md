﻿﻿# Dependencies and API Keys

## Planned core libraries
- react-dropzone
- @dnd-kit/core
- @dnd-kit/sortable
- sharp
- playwright
- better-sqlite3
- zod
- react-hook-form
- @tanstack/react-virtual

## Lock policy
- Pin versions via lockfile.
- No dependency upgrades during MVP build.
- Upgrade only in separate maintenance pass with smoke tests.

## External modules policy (allowed)
- Allowed to use ready third-party modules from npm/GitHub if this accelerates delivery and does not reduce quality.
- Prefer mature, maintained, widely-used packages over custom rewrites.
- Before adding dependency: verify license compatibility, maintenance activity, and platform support.
- Always pin exact version in lockfile and log decision in `DecisionLog.md`.
- New dependency is accepted only if smoke tests still pass and behavior matches `MASTER_SPEC_v2.md`.

## API keys
Do NOT put API keys in chat.
Use local environment variables or local env file.

Required for AI smart reflow:
- `OPENAI_API_KEY`

Optional for Anthropic parallel setup:
- `ANTHROPIC_API_KEY`

## Setup guide
See: `research/object_presentation_tz/API_SETUP_POWERSHELL.md`

## Runtime behavior without key
- App must still work using rule-based engine.
- AI button can be disabled or show clear key-missing message.

## Model recommendation
- Default: `gpt-4.1-mini` (best price/quality for semantic paragraph slide splitting).
- Extra-cheap fallback: `gpt-4.1-nano` for non-critical batch retries.
