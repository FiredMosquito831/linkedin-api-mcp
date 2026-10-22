# One-time setup for linkedin-api-mcp on Windows.
#
#   1. installs the npm package (or uses this checkout)
#   2. downloads the Chromium build Playwright needs
#   3. registers the MCP server with Claude Code, Codex, opencode and Antigravity
#   4. reports what is missing
#
# Usage, from a clone of this repository:
#   powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1
#   powershell -File scripts\bootstrap.ps1 owner/repo
#   $env:TARGETS="claude codex"; $env:SCOPE="project"; powershell -File scripts\bootstrap.ps1
#   $env:SKIP_BROWSER="1"; powershell -File scripts\bootstrap.ps1
#
# Nothing here contacts LinkedIn. Authentication is a separate, explicit step.

[CmdletBinding()]
param(
  [string]$Source = 'FiredMosquito831/linkedin-api-mcp',
  [string]$Targets = 'all',
  [string]$Scope = 'global'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProjectDir = (Get-Location).Path

function Invoke-Step {
  param([string]$Label, [scriptblock]$Action)
  Write-Host "==> $Label"
  & $Action
}

$skipNpm = $env:SKIP_NPM -eq '1'
$skipBrowser = $env:SKIP_BROWSER -eq '1'

if (-not $skipNpm) {
  Invoke-Step 'npm package' {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
      npm install -g linkedin-api-mcp
      if ($LASTEXITCODE -ne 0) { throw 'npm install -g failed' }
    } else {
      throw 'npm is not on PATH. Install Node.js >= 22.12.0 from nodejs.org, then run this script again.'
    }
  }
} else {
  Write-Host '==> npm package: skipped, using the checkout'
}

if (-not $skipBrowser) {
  Invoke-Step 'Chromium for the browser adapters (one-time download, about 150 MB)' {
    # Playwright does not download a browser on install; this step is required
    # before any experimental browser operation can run.
    if (Get-Command npx -ErrorAction SilentlyContinue) {
      npx --yes playwright install chromium
      if ($LASTEXITCODE -ne 0) { throw 'playwright install chromium failed' }
    } else {
      Write-Warning 'npx is not on PATH. Run "npx playwright install chromium" once Node.js is installed.'
    }
  }
}

Write-Host "==> Registering the MCP server in: $Targets (scope: $Scope)"
$cli = if (Get-Command linkedin -ErrorAction SilentlyContinue) { 'linkedin' } else { $null }
$targetArgs = if ($Targets -eq 'all') { @() } else { $Targets -split '\s+' }
if ($cli) {
  & $cli install @targetArgs --scope $Scope --source $Source --yes
  if ($LASTEXITCODE -ne 0) { throw 'linkedin install failed' }
} else {
  & node (Join-Path $Root 'bin\linkedin.js') install @targetArgs --scope $Scope --source $Source --yes
  if ($LASTEXITCODE -ne 0) { throw 'linkedin install failed' }
}

Write-Host '==> Doctor'
if ($cli) { & $cli doctor } else { & node (Join-Path $Root 'bin\linkedin.js') doctor }

Write-Host ''
Write-Host 'Next steps:'
Write-Host '  linkedin auth login      import an official OAuth token, or use linkedin auth login --oauth'
Write-Host '  linkedin experimental browser login --experimental   sign in for the browser adapters'
