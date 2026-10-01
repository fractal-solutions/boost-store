<#
  Allow inbound TCP traffic to the dev server so you can open it from your
  phone on the same Wi-Fi. Requires an elevated (Administrator) PowerShell.

  Add:     powershell -ExecutionPolicy Bypass -File scripts/allow-lan.ps1
  Remove:  powershell -ExecutionPolicy Bypass -File scripts/allow-lan.ps1 -Remove
  Custom:  powershell -ExecutionPolicy Bypass -File scripts/allow-lan.ps1 -Port 4000
#>
param(
  [int]$Port = 4000,
  [switch]$Remove
)

$name = "boost-store-dev-$Port"

try {
  if ($Remove) {
    Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    Write-Host "Removed firewall rule '$name'."
  } elseif (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule '$name' already exists."
  } else {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
    Write-Host "Allowed inbound TCP $Port on private networks (rule '$name')."
  }
} catch {
  Write-Host "Could not change the firewall. Open PowerShell as Administrator and try again." -ForegroundColor Yellow
  Write-Host $_.Exception.Message
  exit 1
}
