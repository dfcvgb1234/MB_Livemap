# Builds release\out\MB Livemap, a folder a player can copy and double-click.
# When Inno Setup 6 is installed, also builds release\out\MB-Livemap-Setup.exe.
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Assert-Exit([string]$What) {
  if ($LASTEXITCODE -ne 0) {
    throw "$What failed with exit code $LASTEXITCODE"
  }
}

$desc = Get-Content -Raw (Join-Path $Root "mod\modDesc.xml")
if ($desc -notmatch "<version>([^<]+)</version>") {
  throw "Could not read the mod version from mod\modDesc.xml"
}
$version = $Matches[1].Trim()
Write-Host "MB Livemap $version"

Write-Host "Building the bridge..."
Push-Location (Join-Path $Root "server")
npm.cmd install
Assert-Exit "npm install (server)"
npm.cmd run typecheck
Assert-Exit "bridge typecheck"
npm.cmd run bundle
Assert-Exit "bridge bundle"
Pop-Location

Write-Host "Building the dashboard..."
Push-Location (Join-Path $Root "web")
npm.cmd install
Assert-Exit "npm install (web)"
$env:MB_LIVEMAP_EXPORT = "1"
npm.cmd run build
Assert-Exit "dashboard build"
Remove-Item Env:\MB_LIVEMAP_EXPORT
Pop-Location

$dest = Join-Path $Root "release\out\MB Livemap"
if (Test-Path $dest) {
  Remove-Item $dest -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $dest "app\web") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dest "app\logs") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dest "mod") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dest "runtime") | Out-Null

Write-Host "Packing the mod..."
$modZip = Join-Path $dest "mod\FS25_MB_Livemap.zip"
Push-Location (Join-Path $Root "mod")
tar --format=zip -cf $modZip *
Assert-Exit "mod zip"
Pop-Location

Copy-Item (Join-Path $Root "server\dist\bridge.cjs") (Join-Path $dest "app\bridge.cjs")
Copy-Item (Join-Path $Root "web\out\*") (Join-Path $dest "app\web") -Recurse
Copy-Item (Join-Path $PSScriptRoot "packaging\*") $dest -Exclude "Launcher.cs"
$csc = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $csc) {
  throw "The Windows C# compiler was not found, so MB Livemap.exe could not be built."
}
& $csc /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$(Join-Path $dest 'MB Livemap.exe')" (Join-Path $PSScriptRoot "packaging\Launcher.cs")
Assert-Exit "launcher"
Set-Content -Path (Join-Path $dest "app\version.txt") -Value $version -Encoding ascii

Write-Host "Fetching the Node.js runtime..."
$cache = Join-Path $Root "release\cache"
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
$match = $index | Where-Object { $_.version -like "v22.*" } | Select-Object -First 1
if (-not $match) {
  throw "Could not find a Node.js 22 release to bundle."
}
$nodeVersion = $match.version
$nodeZipName = "node-$nodeVersion-win-x64.zip"
$nodeZip = Join-Path $cache $nodeZipName
if (-not (Test-Path $nodeZip)) {
  Write-Host "Downloading $nodeVersion ..."
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/$nodeZipName" -OutFile $nodeZip
}
$nodeExe = Join-Path $cache "node-$nodeVersion-win-x64\node.exe"
if (-not (Test-Path $nodeExe)) {
  Expand-Archive -Path $nodeZip -DestinationPath $cache -Force
}
Copy-Item $nodeExe (Join-Path $dest "runtime\node.exe")

$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($iscc) {
  Write-Host "Building the installer..."
  & $iscc "/DMyAppVersion=$version" (Join-Path $PSScriptRoot "installer\MBLivemap.iss")
  Assert-Exit "installer"
} else {
  Write-Host "Inno Setup 6 is not installed, so the portable folder is the package."
  Write-Host "Install Inno Setup 6 and run this script again to build MB-Livemap-Setup.exe."
}

Write-Host ""
Write-Host "Ready: $dest"
Write-Host "Double-click MB Livemap.exe in that folder."
