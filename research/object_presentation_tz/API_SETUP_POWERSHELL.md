﻿﻿# API Key Setup (PowerShell)

## Why
AI smart reflow needs `OPENAI_API_KEY`.

## Fast setup for current terminal session
1. Open PowerShell in project folder.
2. Run:
```powershell
$env:OPENAI_API_KEY = "YOUR_OPENAI_KEY"
$env:ANTHROPIC_API_KEY = "YOUR_ANTHROPIC_KEY"
```
3. Verify:
```powershell
"OPENAI_SET=$([bool]$env:OPENAI_API_KEY)"
"ANTHROPIC_SET=$([bool]$env:ANTHROPIC_API_KEY)"
```

## Persistent setup for your Windows user
Run once:
```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "YOUR_OPENAI_KEY", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_KEY", "User")
```
Then close and reopen terminal.

## `.env` local file option
Create project `.env` from `.env.example` and fill values.
Never commit real keys to git.

## Security note
Even if you are okay sharing keys, best practice is to keep them out of chat and only in local env.
