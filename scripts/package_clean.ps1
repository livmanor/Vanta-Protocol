# Submission archive. Secrets, git metadata, caches, dependencies, and the local database stay out.
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP ("vanta-submission-" + [guid]::NewGuid().ToString("n"))
$out = Join-Path $root "vanta-protocol-submission.zip"
New-Item -ItemType Directory -Path $stage | Out-Null
robocopy $root $stage /E /NFL /NDL /NJH /NJS /nc /ns /np `
  /XD .git .cursor .pytest_cache node_modules venv dist __pycache__ `
  /XF .env *.db *.db-shm *.db-wal vanta-protocol-submission.zip | Out-Null
Get-ChildItem -Path $stage -Recurse -Force -Include .env | Remove-Item -Force
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $out
Remove-Item $stage -Recurse -Force
Write-Output "Wrote $out"
