param()

$ErrorActionPreference = "Stop"

$startTag = "# >>> codex utf8 baseline >>>"
$endTag = "# <<< codex utf8 baseline <<<"

$block = @"
$startTag
try {
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  `$OutputEncoding = [System.Text.UTF8Encoding]::new()
  `$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
  `$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
  `$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
  `$PSDefaultParameterValues['Export-Csv:Encoding'] = 'utf8'
} catch {}

if (-not (Get-Variable -Scope Global -Name __CodexNormVisited -ErrorAction SilentlyContinue)) {
  `$global:__CodexNormVisited = @{}
}

function global:Invoke-CodexAutoNormalize {
  param([string]`$Dir = (Get-Location).Path)
  try {
    `$root = (Resolve-Path `$Dir).Path
  } catch {
    return
  }
  if (`$global:__CodexNormVisited.ContainsKey(`$root)) { return }
  `$scriptPath = Join-Path `$root 'tools\normalize_docs_encoding.ps1'
  if (-not (Test-Path `$scriptPath)) {
    `$global:__CodexNormVisited[`$root] = `$true
    return
  }
  try {
    & powershell -NoLogo -ExecutionPolicy Bypass -File `$scriptPath -Root `$root *> `$null
  } catch {}
  `$global:__CodexNormVisited[`$root] = `$true
}

if (-not (Get-Variable -Scope Global -Name __CodexOriginalPrompt -ErrorAction SilentlyContinue)) {
  `$global:__CodexOriginalPrompt = (Get-Command prompt).ScriptBlock
}

function global:prompt {
  try { Invoke-CodexAutoNormalize } catch {}
  if (`$global:__CodexOriginalPrompt) {
    & `$global:__CodexOriginalPrompt
  } else {
    \"PS `$(`$executionContext.SessionState.Path.CurrentLocation)> \"
  }
}

try { Invoke-CodexAutoNormalize } catch {}
$endTag
"@

$profilePath = $PROFILE.CurrentUserAllHosts
$profileDir = Split-Path -Parent $profilePath
if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$profileText = ""
if (Test-Path $profilePath) {
  $profileText = Get-Content -Path $profilePath -Raw
}

$escapedStart = [regex]::Escape($startTag)
$escapedEnd = [regex]::Escape($endTag)
$pattern = "(?s)$escapedStart.*?$escapedEnd"
if ($profileText -match $pattern) {
  $profileText = [regex]::Replace($profileText, $pattern, $block)
} else {
  if ($profileText.Length -gt 0 -and -not $profileText.EndsWith("`r`n")) {
    $profileText += "`r`n"
  }
  $profileText += $block + "`r`n"
}

Set-Content -Path $profilePath -Value $profileText -Encoding UTF8

[Environment]::SetEnvironmentVariable("PYTHONUTF8", "1", "User")
[Environment]::SetEnvironmentVariable("PYTHONIOENCODING", "utf-8", "User")

if (Get-Command git -ErrorAction SilentlyContinue) {
  git config --global core.quotepath false | Out-Null
  git config --global i18n.commitEncoding utf-8 | Out-Null
  git config --global i18n.logOutputEncoding utf-8 | Out-Null
}

Write-Host "UTF-8 baseline applied."
Write-Host "Profile: $profilePath"
Write-Host "Reopen terminal windows to apply profile changes."
