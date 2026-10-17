$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Show-Problem([string]$Text) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($Text, "MB Livemap") | Out-Null
}

function Test-Health {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:43127/health" -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (Test-Health) {
  Start-Process "http://127.0.0.1:43127/?setup=1"
  exit 0
}

$node = Join-Path $Root "runtime\node.exe"
if (-not (Test-Path $node)) {
  Show-Problem "The MB Livemap program files are incomplete. Download the package again."
  exit 1
}

$rule = netsh advfirewall firewall show rule name="MB Livemap" | Out-String
if ($rule -notmatch "43127") {
  try {
    Start-Process -FilePath (Join-Path $Root "Allow iPad.bat") -Verb RunAs -Wait | Out-Null
  } catch {
    # Allow iPad.bat can be run again if this prompt was dismissed.
  }
}

$logDir = Join-Path $Root "app\logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$versionFile = Join-Path $Root "app\version.txt"
$version = ""
if (Test-Path $versionFile) {
  $version = (Get-Content -Raw $versionFile).Trim()
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.Arguments = "bridge.cjs"
$psi.WorkingDirectory = Join-Path $Root "app"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.EnvironmentVariables["MB_LIVEMAP_STATIC"] = (Join-Path $Root "app\web")
$psi.EnvironmentVariables["MB_LIVEMAP_MOD_ZIP"] = (Join-Path $Root "mod\FS25_MB_Livemap.zip")
$psi.EnvironmentVariables["MB_LIVEMAP_VERSION"] = $version
$psi.EnvironmentVariables["MB_LIVEMAP_PORT"] = "43127"
$psi.EnvironmentVariables["MB_LIVEMAP_LOG"] = (Join-Path $logDir "bridge.log")

$process = [System.Diagnostics.Process]::Start($psi)
if (-not $process) {
  Show-Problem "MB Livemap could not start. Details are in app\logs\bridge.log."
  exit 1
}
Set-Content -Path (Join-Path $Root "app\bridge.pid") -Value $process.Id

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  if (Test-Health) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Show-Problem "MB Livemap did not start. Details are in app\logs\bridge.log."
  exit 1
}

Start-Process "http://127.0.0.1:43127/?setup=1"
