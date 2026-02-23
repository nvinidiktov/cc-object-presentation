param(
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"

$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$cp1251 = [System.Text.Encoding]::GetEncoding(1251)

$files = Get-ChildItem -Path $Root -Recurse -File -Include *.md,*.txt

$total = 0
$decodedUtf8 = 0
$decodedCp1251 = 0
$failed = 0

foreach ($file in $files) {
  $total += 1
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $text = $null

  try {
    $text = $utf8Strict.GetString($bytes)
    $decodedUtf8 += 1
  } catch {
    try {
      $text = $cp1251.GetString($bytes)
      $decodedCp1251 += 1
    } catch {
      $failed += 1
      continue
    }
  }

  [System.IO.File]::WriteAllText($file.FullName, $text, $utf8Bom)
}

Write-Host "normalize_docs_encoding: total=$total utf8=$decodedUtf8 cp1251=$decodedCp1251 failed=$failed"
