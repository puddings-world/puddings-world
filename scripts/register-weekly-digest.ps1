# Registers scripts/weekly-digest.ts as an Assistant Hub tool
# (widget.site-projects.digest) so a weekly hub routine can run it.
# Idempotent: re-running replaces the same tool entry.
#
#   ./scripts/register-weekly-digest.ps1 [-HubRoot <assistant-hub dir>] [-Python <python.exe>]
param(
    [string]$HubRoot = $env:ASSISTANT_HUB_ROOT,
    [string]$Python = $(if ($env:PYTHON) { $env:PYTHON } else { "python" })
)
$ErrorActionPreference = "Stop"
$Repo = Split-Path $PSScriptRoot -Parent
if (-not $HubRoot) {
    $HubRoot = Join-Path (Split-Path $Repo -Parent) "pudding-lifestyle-tools/assistant-hub"
}
if (-not (Test-Path (Join-Path $HubRoot "assistant_hub"))) {
    Write-Error "Assistant Hub not found at $HubRoot. Pass -HubRoot or set ASSISTANT_HUB_ROOT."
    exit 1
}
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
    Write-Error "Install Node.js (>=20) first: https://nodejs.org"
    exit 1
}
$Tsx = Join-Path $Repo "node_modules/tsx/dist/cli.mjs"
if (-not (Test-Path $Tsx)) {
    Write-Error "tsx is missing. Run ./scripts/setup.ps1 first."
    exit 1
}

$spec = [ordered]@{
    name            = "widget.site-projects.digest"
    title           = "網站每週專案摘要"
    kind            = "argv"
    argv            = @($Node, ($Tsx -replace "\\", "/"), "scripts/weekly-digest.ts")
    cwd             = ($Repo -replace "\\", "/")
    requires_unlock = $false
    timeout_seconds = 120
    inputSchema     = [ordered]@{ type = "object"; properties = @{}; required = @(); additionalProperties = $false }
}
$tmp = Join-Path ([IO.Path]::GetTempPath()) "site-projects-digest.tool.json"
[IO.File]::WriteAllText($tmp, ($spec | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Push-Location $HubRoot
try {
    & $Python -X utf8 -m assistant_hub register $tmp
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
} finally {
    Pop-Location
    Remove-Item $tmp -ErrorAction SilentlyContinue
}
