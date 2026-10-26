# Client Feedback: add (or remove with -Remove) the widget line on every HTML page. Windows PowerShell.
# Run from the site folder that contains the feedback folder:
#   powershell -ExecutionPolicy Bypass -File tools\add-feedback.ps1
#   powershell -ExecutionPolicy Bypass -File tools\add-feedback.ps1 -Remove
param(
  [string]$Path = ".",
  [switch]$Remove
)
$root = (Resolve-Path $Path).Path
if (-not $Remove -and -not (Test-Path (Join-Path $root "feedback\feedback.js"))) {
  Write-Host "No feedback\feedback.js found in $root. Copy the feedback folder into the site first."; exit 1
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$count = 0
Get-ChildItem -Path $root -Recurse -File -Include *.html, *.htm |
  Where-Object { $_.FullName -notmatch '[\\/](feedback|node_modules|\.[^\\/]+)[\\/]' } |
  ForEach-Object {
    $c = [System.IO.File]::ReadAllText($_.FullName)
    if ($Remove) {
      $n = [regex]::Replace($c, '[ \t]*<script src="[^"]*feedback/feedback\.js"[^>]*></script>\r?\n?', '')
    } else {
      if ($c -match 'feedback/feedback\.js') { Write-Host "Already has it: $($_.FullName)"; return }
      $i = $c.LastIndexOf('</body>', [System.StringComparison]::OrdinalIgnoreCase)
      if ($i -lt 0) { Write-Host "Skipped (no </body>): $($_.FullName)"; return }
      $rel = $_.DirectoryName.Substring($root.Length).Trim('\', '/')
      $depth = if ($rel) { ($rel -split '[\\/]').Count } else { 0 }
      $prefix = '../' * $depth
      $nl = if ($c.Contains("`r`n")) { "`r`n" } else { "`n" }
      $n = $c.Substring(0, $i) + "<script src=""$($prefix)feedback/feedback.js"" defer></script>" + $nl + $c.Substring($i)
    }
    if ($n -ne $c) {
      [System.IO.File]::WriteAllText($_.FullName, $n, $utf8)
      $count++
      Write-Host "$(if ($Remove) {'Removed'} else {'Added  '}): $($_.FullName)"
    }
  }
Write-Host "Done: $count page(s) $(if ($Remove) {'cleaned'} else {'updated'})."
