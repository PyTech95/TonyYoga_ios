# TonYoga - build the signed Android App Bundle (.aab) for Google Play.
#
# Double-click "Build Android app.bat" (or run:  powershell -ExecutionPolicy Bypass -File .\build-android.ps1)
# Needs: Android Studio installed once (it brings Java 21 and the Android SDK) and an internet connection.
# The first build downloads Gradle and the Android build tools (about 1 GB) and takes 5-15 minutes.
# The upload key password is asked here and only lives in this window; nothing is saved.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$android = Join-Path $root "android"

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host ""; Write-Host "STOPPED: $m" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Plain($secure) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function JavaMajor($javaExe) {
  # java prints its version on stderr; keep PowerShell from treating that as an error.
  $ErrorActionPreference = "Continue"
  $out = & $javaExe -version 2>&1 | ForEach-Object { "$_" } | Select-Object -First 1
  if ("$out" -match '"(\d+)') { return [int]$Matches[1] }
  return 0
}

Write-Host "TonYoga - Android release build" -ForegroundColor White

# ---------------------------------------------------------------------------
Step "1/5 Java 21"
# A private Java 21 can live here (downloaded below if the computer has none). Nothing is installed system-wide.
$jdkDir = Join-Path $env:LOCALAPPDATA "TonYoga\jdk21"
$candidates = @()
if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
$candidates += @(
  "$env:ProgramFiles\Android\Android Studio\jbr",
  "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
  "$env:ProgramFiles\Android\Android Studio Preview\jbr",
  "$env:ProgramFiles\JetBrains\Android Studio\jbr"
)
foreach ($base in @($jdkDir, "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Zulu")) {
  if (Test-Path $base) { Get-ChildItem $base -Directory | ForEach-Object { $candidates += $_.FullName } }
}
$javaHome = $null
foreach ($c in $candidates) {
  $exe = Join-Path $c "bin\java.exe"
  if (-not (Test-Path $exe)) { continue }
  $v = JavaMajor $exe
  if ($v -ge 21) { $javaHome = $c; break }
  Write-Host "      skipping Java $v at $c (the build needs 21)"
}
if (-not $javaHome) {
  Warn "Java 21 isn't on this computer (the Android Studio here comes with an older Java)."
  Write-Host "      It can be fetched now: Eclipse Temurin 21 JDK - the free, official OpenJDK build from adoptium.net,"
  Write-Host "      about 200 MB, unpacked into $jdkDir (portable, no installer)."
  $yes = Read-Host "Download Java 21 now? [Y/N]"
  if ($yes -notmatch '^\s*(y|yes)\s*$') {
    Fail "Java 21 is needed. Either run this again and answer Y, or update Android Studio (Help > Check for Updates) and run this again."
  }
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = "SilentlyContinue"
  try {
    $info = Invoke-RestMethod -UseBasicParsing -Uri "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"
  } catch { Fail ("Couldn't reach adoptium.net: " + $_.Exception.Message) }
  $pkg = @($info)[0].binary.package
  if (-not $pkg -or -not $pkg.link -or -not $pkg.checksum) { Fail "adoptium.net didn't return a Java 21 download. Try again in a few minutes." }
  $zip = Join-Path $env:TEMP $pkg.name
  Write-Host ("      Downloading " + $pkg.name + " (" + [math]::Round($pkg.size / 1MB) + " MB)...")
  $ErrorActionPreference = "Continue"
  & curl.exe -L --fail --retry 3 --progress-bar -o $zip $pkg.link
  $dl = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($dl -ne 0 -or -not (Test-Path $zip)) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $pkg.link -OutFile $zip } catch { Fail ("Download failed: " + $_.Exception.Message) }
  }
  $hash = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash
  if ($hash -ne $pkg.checksum.ToUpper()) {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Fail "The Java download was damaged (checksum didn't match). Run this again."
  }
  Ok "Download verified (SHA-256 matches adoptium.net)"
  Write-Host "      Unpacking..."
  New-Item -ItemType Directory -Force -Path $jdkDir | Out-Null
  $ErrorActionPreference = "Continue"
  & tar.exe -xf $zip -C $jdkDir
  $tx = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($tx -ne 0) { Expand-Archive -Path $zip -DestinationPath $jdkDir -Force }
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  foreach ($d in (Get-ChildItem $jdkDir -Directory)) {
    $exe = Join-Path $d.FullName "bin\java.exe"
    if ((Test-Path $exe) -and ((JavaMajor $exe) -ge 21)) { $javaHome = $d.FullName; break }
  }
  if (-not $javaHome) { Fail "Java 21 was downloaded but didn't start - send a screenshot of this window to Rajeev." }
}
Ok "Java: $javaHome"
$env:JAVA_HOME = $javaHome

# ---------------------------------------------------------------------------
Step "2/5 Android SDK"
$sdk = $null
foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk", "$env:USERPROFILE\AppData\Local\Android\Sdk")) {
  if (-not $c -or -not (Test-Path $c)) { continue }
  # A folder with accepted licences is enough: Gradle downloads the missing Android 16 pieces itself.
  foreach ($sub in @("platform-tools", "platforms", "build-tools", "licenses")) {
    if (Test-Path (Join-Path $c $sub)) { $sdk = $c; break }
  }
  if ($sdk) { break }
}
if (-not $sdk) { Fail "Android SDK not found. Open Android Studio once (it installs the SDK), then run this again." }
Ok "SDK: $sdk"
# local.properties tells Gradle where the SDK is (forward slashes work on Windows).
Set-Content -Path (Join-Path $android "local.properties") -Value ("sdk.dir=" + ($sdk -replace '\\', '/')) -Encoding ASCII
if (-not (Test-Path (Join-Path $sdk "licenses\android-sdk-license"))) {
  Warn "SDK licences not accepted yet. If the build stops with 'licences not accepted': Android Studio > Tools > SDK Manager > SDK Platforms > tick 'Android 16 (API 36)' > Apply."
}
if (-not (Test-Path (Join-Path $sdk "platforms\android-36"))) {
  Warn "Android 16 (API 36) isn't installed yet; Gradle downloads it during the build."
}

# ---------------------------------------------------------------------------
Step "3/5 Upload key"
$guess = @(
  (Join-Path $root "tonyoga-upload-new.jks"),
  "$env:USERPROFILE\Downloads\tonyoga-upload-new.jks",
  "$env:USERPROFILE\Desktop\tonyoga-upload-new.jks",
  "$env:USERPROFILE\Documents\tonyoga-upload-new.jks",
  "$env:USERPROFILE\OneDrive\Desktop\tonyoga-upload-new.jks",
  "$env:USERPROFILE\OneDrive\Documents\tonyoga-upload-new.jks"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($guess) {
  $answer = Read-Host "Keystore file [Enter = $guess]"
  $keystore = if ($answer) { $answer.Trim('"') } else { $guess }
} else {
  $keystore = (Read-Host "Full path of the upload keystore (.jks) - you can drag the file into this window").Trim('"')
}
if (-not (Test-Path $keystore)) { Fail "Keystore not found: $keystore" }
$env:TONYOGA_KEYSTORE = (Resolve-Path $keystore).Path
$keytool = Join-Path $javaHome "bin\keytool.exe"
$opened = $false
for ($try = 1; $try -le 3 -and -not $opened; $try++) {
  $alias = Read-Host "Key alias [Enter = tonyoga-upload]"
  if (-not $alias) { $alias = "tonyoga-upload" }
  $storePass = ""
  while (-not $storePass) {
    $storePass = Plain (Read-Host "Keystore password (typing stays hidden)" -AsSecureString)
    if (-not $storePass) { Warn "The password can't be empty - type it, then press Enter." }
  }
  $keyPass = Plain (Read-Host "Key password [Enter = same as keystore password]" -AsSecureString)
  if (-not $keyPass) { $keyPass = $storePass }
  $env:TONYOGA_KEY_ALIAS = $alias
  $env:TONYOGA_STORE_PASSWORD = $storePass
  $env:TONYOGA_KEY_PASSWORD = $keyPass

  $ErrorActionPreference = "Continue"
  $listing = & $keytool -list -v -keystore $env:TONYOGA_KEYSTORE -alias $alias -storepass:env TONYOGA_STORE_PASSWORD 2>&1 | ForEach-Object { "$_" }
  $ktCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($ktCode -eq 0) { $opened = $true; break }
  Warn ("The keystore didn't open: " + (($listing | Select-Object -First 2) -join " "))
  if ($try -lt 3) { Write-Host "      Wrong password or alias? Try again ($try of 3)." }
}
if (-not $opened) {
  Remove-Item Env:TONYOGA_STORE_PASSWORD, Env:TONYOGA_KEY_PASSWORD -ErrorAction SilentlyContinue
  Fail "The keystore didn't open after 3 tries. Check the password (and the alias) and run this again."
}
$shaLine = $listing | Select-String -Pattern "SHA1:\s*(.+)$" | Select-Object -First 1
$sha1 = if ($shaLine) { $shaLine.Matches[0].Groups[1].Value.Trim() } else { "(not shown)" }
Ok "Upload key '$alias' opened. SHA-1: $sha1"
Write-Host "      (Play Console > Test and release > App integrity > App signing > 'Upload key certificate' must show the same SHA-1.)"

# ---------------------------------------------------------------------------
# A newer copy of the app screens may be delivered next to this script (folder "app-web").
# Mirror it into the Android project so the bundle holds exactly that build and nothing older.
$fresh = Join-Path $root "app-web"
$public = Join-Path $android "app\src\main\assets\public"
if (Test-Path (Join-Path $fresh "index.html")) {
  $ErrorActionPreference = "Continue"
  & robocopy $fresh $public /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  $rc = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($rc -ge 8) { Fail "Couldn't copy the new app screens into the Android project (robocopy code $rc)." }
  Ok "App screens updated from app-web"
}

Step "4/5 Building (first time 5-15 minutes - it downloads the Android build tools)"
Push-Location $android
$ErrorActionPreference = "Continue"
& .\gradlew.bat --no-daemon --console=plain bundleRelease
$code = $LASTEXITCODE
$ErrorActionPreference = "Stop"
Pop-Location
Remove-Item Env:TONYOGA_STORE_PASSWORD, Env:TONYOGA_KEY_PASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) { Fail "The build failed - scroll up for the first red 'FAILURE' or 'What went wrong' lines and send them to Rajeev." }

# ---------------------------------------------------------------------------
Step "5/5 Done"
$aab = Join-Path $android "app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $aab)) { Fail "The build finished but app-release.aab wasn't found." }
$gradleFile = Get-Content (Join-Path $android "app\build.gradle") -Raw
$vName = if ($gradleFile -match 'versionName\s+"([^"]+)"') { $Matches[1] } else { "release" }
$vCode = if ($gradleFile -match 'versionCode\s+(\d+)') { $Matches[1] } else { "" }
$desktop = [Environment]::GetFolderPath("Desktop")
$dest = Join-Path $desktop "TonYoga-$vName-$vCode.aab"
Copy-Item $aab $dest -Force
Ok "Signed app bundle: $dest"
Write-Host ""
Write-Host "Next: Play Console > TonYoga > Test and release > Production > Create new release > upload this file." -ForegroundColor White
Start-Process explorer.exe -ArgumentList "/select,`"$dest`""
Read-Host "Press Enter to close"
