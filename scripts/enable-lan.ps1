param(
  [ValidateRange(1,65535)][int]$Port = 3000,
  [string]$LanAddress = '',
  [ValidateRange(8,30)][int]$PrefixLength = 24,
  [string]$NodePath = '',
  [ValidateSet('Public','Private')][string]$Profile = 'Public',
  [switch]$Plan,
  [switch]$Undo
)
$ErrorActionPreference = 'Stop'
$partyRoot = Split-Path -Parent $PSScriptRoot
$partyRecordPath = Join-Path $partyRoot "data/firewall-lan-$Port.json"
$partyResultPath = Join-Path $partyRoot "data/firewall-lan-$Port.result.json"
# Keep stable rule IDs so -Undo works for rules installed before the rename.
$partyAllowName = "DiwaliTraitors-LAN-$Port-Allow"
$partyBlockName = "DiwaliTraitors-LAN-$Port-Outside-Block"
function Convert-PartyIPv4Number([string]$Address) {
  $bytes = [Net.IPAddress]::Parse($Address).GetAddressBytes()
  if ($bytes.Length -ne 4) { throw 'Use an IPv4 LAN address.' }
  $number = [uint64]0
  foreach ($byte in $bytes) { $number = $number * 256 + $byte }
  return $number
}
function Convert-PartyIPv4Text([uint64]$Number) {
  return ((24,16,8,0 | ForEach-Object { [int]([Math]::Floor($Number / [Math]::Pow(2,$_)) % 256) }) -join '.')
}
if (-not $Undo) {
  if (-not $LanAddress) { throw 'Set -LanAddress to the host Wi-Fi IPv4 address and use -Plan to review the scope.' }
  $partyAddressNumber = Convert-PartyIPv4Number $LanAddress
  $partySubnetSize = [uint64][Math]::Pow(2,32 - $PrefixLength)
  $partyNetworkNumber = [uint64]([Math]::Floor($partyAddressNumber / $partySubnetSize) * $partySubnetSize)
  $partyLastNumber = $partyNetworkNumber + $partySubnetSize - 1
  $partySubnet = "$(Convert-PartyIPv4Text $partyNetworkNumber)/$PrefixLength"
  $partyOutside = @()
  for ($partyDepth = 1; $partyDepth -le $PrefixLength; $partyDepth++) {
    $partyBlockSize = [uint64][Math]::Pow(2,32 - $partyDepth)
    $partyPrefixBase = [uint64]([Math]::Floor($partyAddressNumber / $partyBlockSize) * $partyBlockSize)
    $partySibling = if (([uint64]($partyPrefixBase / $partyBlockSize) % 2) -eq 0) { $partyPrefixBase + $partyBlockSize } else { $partyPrefixBase - $partyBlockSize }
    $partyOutside += "$(Convert-PartyIPv4Text $partySibling)/$partyDepth"
  }
  # Nonzero prefix lengths avoid Windows rejecting an IPv6 /0 in mixed-family lists.
  $partyOutside += @('::/1','8000::/1')
  $partyOtherPorts = @()
  if ($Port -gt 1) { $partyOtherPorts += "1-$($Port - 1)" }
  if ($Port -lt 65535) { $partyOtherPorts += "$($Port + 1)-65535" }
  if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
  $NodePath = (Resolve-Path -LiteralPath $NodePath).Path
  if ($Plan) {
    [pscustomobject]@{ Program=$NodePath; LocalAddress=$LanAddress; TCPPort=$Port; AllowedRemoteSubnet=$partySubnet; Profile=$Profile; BlockedOtherPorts=$partyOtherPorts; BlockedRemoteAddressesOnGamePort=$partyOutside; FirewallRemainsEnabled=$true } | ConvertTo-Json
    exit 0
  }
}
$partyIsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $partyIsAdmin) { throw 'Run this script in PowerShell as administrator. Use -Plan to inspect it without changes.' }
New-Item -ItemType Directory -Path (Join-Path $partyRoot 'data') -Force | Out-Null
try {
  if ($Undo) {
    $record = Get-Content -LiteralPath $partyRecordPath -Raw | ConvertFrom-Json
    foreach ($change in @($record.LegacyChanges)) { Get-NetFirewallRule -Name $change.Name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort @($change.LocalPorts) }
    foreach ($name in @($partyAllowName,$partyBlockName)) { Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule }
    $record.Status = 'Undone'; $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $partyRecordPath -Encoding UTF8
    @{Success=$true;Action='Undo';Message='Original TCP block restored; game exception removed.'} | ConvertTo-Json | Set-Content -LiteralPath $partyResultPath -Encoding UTF8
    exit 0
  }
  $address = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress
  if ($address.PrefixLength -ne $PrefixLength) { throw 'LAN prefix changed; check the current adapter configuration.' }
  $connection = Get-NetConnectionProfile -InterfaceIndex $address.InterfaceIndex
  if ($connection.NetworkCategory.ToString() -ne $Profile) { throw 'Network profile changed; inspect it before applying an exception.' }
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -First 1
  if ((Get-Process -Id $listener.OwningProcess).Path -ine $NodePath) { throw 'The listener executable does not match NodePath.' }
  $firewallProfile = Get-NetFirewallProfile -Name $Profile
  if (-not $firewallProfile.Enabled -or $firewallProfile.DefaultInboundAction.ToString() -eq 'Allow') { throw 'Expected an enabled firewall with inbound traffic blocked by default.' }
  if (Test-Path -LiteralPath $partyRecordPath) {
    $existing = Get-Content -LiteralPath $partyRecordPath -Raw | ConvertFrom-Json
    if ($existing.Status -eq 'Applied') { throw 'An exception is already recorded. Use -Undo before changing its configuration.' }
  }
  foreach ($name in @($partyAllowName,$partyBlockName)) { if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { throw "Rule $name already exists; review it before continuing." } }
  $profileBit = if ($Profile -eq 'Public') { 4 } else { 2 }
  $changes = @()
  $matching = @(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Block | Where-Object { ([int]$_.Profile -band $profileBit) -or $_.Profile.ToString() -eq 'Any' })
  foreach ($rule in $matching) {
    $application = $rule | Get-NetFirewallApplicationFilter
    if ($application.Program -ine $NodePath -and -not $rule.Name.EndsWith($NodePath,[StringComparison]::OrdinalIgnoreCase)) { continue }
    $ports = $rule | Get-NetFirewallPortFilter
    if ($ports.Protocol.ToString() -in @('6','TCP')) {
      $localPorts = @($ports.LocalPort)
      if ($localPorts.Count -ne 1 -or $localPorts[0] -ne 'Any') { throw "Nonstandard Node block $($rule.Name); review its port scope manually." }
      $changes += [pscustomobject]@{Name=$rule.Name;LocalPorts=@($ports.LocalPort)}
    } elseif ($ports.Protocol.ToString() -in @('Any','256')) { throw 'A broader Node protocol block needs manual review.' }
  }
  $record = [pscustomobject]@{Status='Prepared';At=(Get-Date).ToString('o');Program=$NodePath;LanAddress=$LanAddress;Subnet=$partySubnet;Profile=$Profile;Port=$Port;LegacyChanges=$changes}
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $partyRecordPath -Encoding UTF8
  try {
    # Preserve the existing explicit block for every other port and outside-LAN traffic.
    $partyStep = 'Create outside-LAN block'
    New-NetFirewallRule -Name $partyBlockName -DisplayName "Traitors: block TCP $Port outside party LAN" -Direction Inbound -Action Block -Enabled True -Profile $Profile -Program $NodePath -Protocol TCP -LocalPort $Port -RemoteAddress $partyOutside | Out-Null
    $partyStep = 'Create LAN allow rule'
    New-NetFirewallRule -Name $partyAllowName -DisplayName "Traitors: TCP $Port from party LAN only" -Direction Inbound -Action Allow -Enabled True -Profile $Profile -Program $NodePath -Protocol TCP -LocalPort $Port -LocalAddress $LanAddress -RemoteAddress $partySubnet -InterfaceAlias $address.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
    $partyStep = 'Preserve other-port blocks'
    foreach ($change in $changes) { Get-NetFirewallRule -Name $change.Name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort $partyOtherPorts }
    $record.Status = 'Applied'
    $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $partyRecordPath -Encoding UTF8
  } catch {
    foreach ($change in $changes) { Get-NetFirewallRule -Name $change.Name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort @($change.LocalPorts) }
    foreach ($name in @($partyAllowName,$partyBlockName)) { Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule }
    $record.Status = 'RolledBack'; $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $partyRecordPath -Encoding UTF8
    throw
  }
  @{Success=$true;Action='Apply';Address=$LanAddress;Subnet=$partySubnet;Profile=$Profile;Port=$Port;AdjustedTCPBlockRules=$changes.Count;FirewallEnabled=(Get-NetFirewallProfile -Name $Profile).Enabled} | ConvertTo-Json | Set-Content -LiteralPath $partyResultPath -Encoding UTF8
  Get-Content -LiteralPath $partyResultPath
} catch {
  @{Success=$false;Error=$_.Exception.Message;Step=$partyStep;ErrorId=$_.FullyQualifiedErrorId} | ConvertTo-Json | Set-Content -LiteralPath $partyResultPath -Encoding UTF8
  Write-Error $_
  exit 1
}
