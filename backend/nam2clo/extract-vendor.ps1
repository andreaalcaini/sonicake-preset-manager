<#
  Extracts the vendor files needed by the ARM64 NAM -> Clone AMP converter from the SonicLink
  Android app into data/vendor (mounted as /app/data/vendor by docker-compose). These files are
  proprietary: they are never committed nor baked into the public image.

    lib5868USB.so, libc++_shared.so   <- split_config.arm64_v8a.apk (adb pull from a phone)
    nam_input_wav.wav                 <- base APK (assets/flutter_assets/assets/clone_config/nam_input_file.wav)

  Usage (from the repo root):
    .\backend\nam2clo\extract-vendor.ps1 -SplitApk ...\split_config.arm64_v8a.apk -BaseApk ...\SONICLINK.apk
  Then copy data/vendor to the server's ./data/vendor.
#>
param(
  [Parameter(Mandatory = $true)][string]$SplitApk,
  [Parameter(Mandatory = $true)][string]$BaseApk,
  [string]$OutDir = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))) 'data\vendor')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Extract-Entry($zipPath, $entryName, $dest) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.GetEntry($entryName)
    if (-not $entry) { throw "Entry '$entryName' not found in $zipPath" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
  } finally { $zip.Dispose() }
}

Extract-Entry $SplitApk 'lib/arm64-v8a/lib5868USB.so' (Join-Path $OutDir 'lib5868USB.so')
Extract-Entry $SplitApk 'lib/arm64-v8a/libc++_shared.so' (Join-Path $OutDir 'libc++_shared.so')
Extract-Entry $BaseApk 'assets/flutter_assets/assets/clone_config/nam_input_file.wav' (Join-Path $OutDir 'nam_input_wav.wav')
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize
