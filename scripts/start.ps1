param(
  [int]$Port = 3000,
  [string]$DataDirectory = './data',
  [string]$JoinUrl = ''
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$partyNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $partyNodeCommand) { throw 'Install Node.js 24 LTS and reopen PowerShell, then run this script again.' }
$partyNodeVersion = & $partyNodeCommand.Source -p 'process.versions.node'
if (-not $partyNodeVersion.StartsWith('24.')) { throw "Node.js 24 LTS is required. Found $partyNodeVersion." }
$env:PORT = [string]$Port
$env:DATA_DIR = $DataDirectory
if ($JoinUrl) { $env:JOIN_URL = $JoinUrl }
& $partyNodeCommand.Source server.js
exit $LASTEXITCODE
