<#
  Builds the ARM64 NAM -> CLO converter bundle used by the Linux ARM server image.

  1. Extracts the vendor files from the SonicLink Android app (NOT committed to git):
       lib5868USB.so, libc++_shared.so   <- split_config.arm64_v8a.apk
       nam_input_wav.wav                 <- base APK (assets/flutter_assets/assets/clone_config/nam_input_file.wav)
  2. Cross-compiles nam2clo + the Android system-library stubs with the Android NDK.

  Usage:
    .\build.ps1 -Ndk C:\path\android-ndk-r27c -SplitApk ...\split_config.arm64_v8a.apk -BaseApk ...\SONICLINK.apk
#>
param(
  [Parameter(Mandatory = $true)][string]$Ndk,
  [Parameter(Mandatory = $true)][string]$SplitApk,
  [Parameter(Mandatory = $true)][string]$BaseApk
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vendor = Join-Path $here 'vendor'
$build = Join-Path $here 'build'
New-Item -ItemType Directory -Force $vendor, $build | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Extract-Entry($zipPath, $entryName, $dest) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.GetEntry($entryName)
    if (-not $entry) { throw "Entry '$entryName' not found in $zipPath" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
  } finally { $zip.Dispose() }
}

Extract-Entry $SplitApk 'lib/arm64-v8a/lib5868USB.so' (Join-Path $vendor 'lib5868USB.so')
Extract-Entry $SplitApk 'lib/arm64-v8a/libc++_shared.so' (Join-Path $vendor 'libc++_shared.so')
Extract-Entry $BaseApk 'assets/flutter_assets/assets/clone_config/nam_input_file.wav' (Join-Path $vendor 'nam_input_wav.wav')

$bin = Join-Path $Ndk 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$cc = Join-Path $bin 'aarch64-linux-android24-clang.cmd'
$cxx = Join-Path $bin 'aarch64-linux-android24-clang++.cmd'

# Converter: links against the vendor library and exports the JUCE getSpecialLocation interposer
& $cxx -O2 -Wall -Wno-deprecated -rdynamic -o (Join-Path $build 'nam2clo') -x c++ `
  (Join-Path $here 'nam2clo.c') (Join-Path $here 'juce_android_shim.cpp') "-L$vendor" -l5868USB -ldl
if ($LASTEXITCODE) { throw 'nam2clo build failed' }

# System library stubs (SONAMEs must match what lib5868USB.so asks for)
$stubs = Join-Path $here 'stubs'
$targets = @(
  @{ name = 'liblog.so'; src = 'liblog_stub.c' },
  @{ name = 'libOpenSLES.so'; src = 'libopensles_stub.c' },
  @{ name = 'libandroid.so'; src = 'empty_stub.c' },
  @{ name = 'libEGL.so'; src = 'empty_stub.c' },
  @{ name = 'libGLESv2.so'; src = 'empty_stub.c' }
)
foreach ($t in $targets) {
  & $cc -O2 -shared -fPIC "-Wl,-soname,$($t.name)" -o (Join-Path $build $t.name) (Join-Path $stubs $t.src)
  if ($LASTEXITCODE) { throw "stub $($t.name) build failed" }
}
Get-ChildItem $vendor, $build | Select-Object Directory, Name, Length | Format-Table -AutoSize
