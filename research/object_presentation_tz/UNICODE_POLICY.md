﻿﻿# Unicode and Filename Policy

## Why this exists
Planning files were previously corrupted due to shell transport encoding.

## Rules
1. Keep documents UTF-8.
2. For auto-generated docs/scripts, prefer ASCII-safe content path.
3. Internal storage keys and technical filenames: ASCII-safe (slug/uuid).
4. UI labels and user-facing text: Russian UTF-8.
5. Export filename policy:
   - try Russian filename first,
   - fallback to ASCII-safe filename if filesystem rejects.

## Forbidden assumptions
- Do not assume shell code page represents file encoding.
- Do not assume Russian path literals survive every shell bridge.

## Validation checks
- UTF-8 decode success for all `.md` docs.
- No massive replacement with `?` in docs.
- Export naming works with RU and fallback names.

## Auto-fix procedure (mandatory)
- One-time baseline setup (Windows):
  - `powershell -ExecutionPolicy Bypass -File tools/setup_utf8_windows.ps1`
  - then reopen terminal/editor tabs.
- Before reading/editing docs, run:
  - `powershell -ExecutionPolicy Bypass -File tools/normalize_docs_encoding.ps1 -Root .`
- This script normalizes `.md` and `.txt` files to UTF-8 BOM and recovers common CP1251 cases.
