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

function Export-PngIcon([string]$Png, [string]$Ico) {
  Add-Type -AssemblyName System.Drawing
  $source = [System.Drawing.Image]::FromFile((Resolve-Path $Png))
  try {
    $sizes = @(16, 32, 48, 256)
    $frames = New-Object System.Collections.Generic.List[byte[]]
    foreach ($size in $sizes) {
      $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $scale = [Math]::Min($size / $source.Width, $size / $source.Height)
      $w = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
      $h = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
      $graphics.DrawImage($source, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
      $graphics.Dispose()

      $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
      $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $bmp.PixelFormat)
      $stride = [Math]::Abs($data.Stride)
      $raw = New-Object byte[] ($stride * $size)
      [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
      $bmp.UnlockBits($data)
      $bmp.Dispose()

      $rowBytes = $size * 4
      $xor = New-Object byte[] ($rowBytes * $size)
      for ($y = 0; $y -lt $size; $y++) {
        [Array]::Copy($raw, $y * $stride, $xor, ($size - 1 - $y) * $rowBytes, $rowBytes)
      }
      $maskStride = [int][Math]::Ceiling($size / 32.0) * 4
      $mask = New-Object byte[] ($maskStride * $size)

      $image = New-Object System.IO.MemoryStream
      $writer = New-Object System.IO.BinaryWriter $image
      $writer.Write([int]40)
      $writer.Write([int]$size)
      $writer.Write([int]($size * 2))
      $writer.Write([int16]1)
      $writer.Write([int16]32)
      $writer.Write([int]0)
      $writer.Write([int]($xor.Length + $mask.Length))
      $writer.Write([int]0)
      $writer.Write([int]0)
      $writer.Write([int]0)
      $writer.Write([int]0)
      $writer.Write($xor)
      $writer.Write($mask)
      $writer.Flush()
      $frames.Add($image.ToArray())
      $writer.Dispose()
    }

    $count = $frames.Count
    $offset = 6 + (16 * $count)
    $output = New-Object System.IO.MemoryStream
    $header = New-Object System.IO.BinaryWriter $output
    $header.Write([uint16]0)
    $header.Write([uint16]1)
    $header.Write([uint16]$count)
    for ($i = 0; $i -lt $count; $i++) {
      $size = $sizes[$i]
      $dim = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $header.Write($dim)
      $header.Write($dim)
      $header.Write([byte]0)
      $header.Write([byte]0)
      $header.Write([uint16]1)
      $header.Write([uint16]32)
      $header.Write([uint32]$frames[$i].Length)
      $header.Write([uint32]$offset)
      $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) {
      $header.Write($frame)
    }
    $header.Flush()
    [System.IO.File]::WriteAllBytes($Ico, $output.ToArray())
    $header.Dispose()
  } finally {
    $source.Dispose()
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
$iconIco = Join-Path $dest "icon.ico"
$iconPng = Join-Path $dest "icon.png"
if (-not (Test-Path $iconIco) -and (Test-Path $iconPng)) {
  Write-Host "Building icon.ico from icon.png..."
  Export-PngIcon -Png $iconPng -Ico $iconIco
}
$csc = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $csc) {
  throw "The Windows C# compiler was not found, so MB Livemap.exe could not be built."
}
$launcherArgs = @(
  "/nologo",
  "/target:winexe",
  "/reference:System.Windows.Forms.dll",
  "/reference:System.Drawing.dll"
)
if (Test-Path $iconIco) {
  $launcherArgs += "/win32icon:$iconIco"
}
$launcherArgs += "/out:$(Join-Path $dest 'MB Livemap.exe')"
$launcherArgs += (Join-Path $PSScriptRoot "packaging\Launcher.cs")
& $csc @launcherArgs
Assert-Exit "launcher"

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
