# Builds Shrimple.apk from the web game in the parent folder, without Gradle.
# Needs the Android SDK (build-tools + a platform) and Android Studio's bundled JDK.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$web  = Split-Path $here -Parent

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$bt = Get-ChildItem "$sdk\build-tools" | Sort-Object { [version]$_.Name } | Select-Object -Last 1 -ExpandProperty FullName
$platform = Get-ChildItem "$sdk\platforms" | Sort-Object { [int]($_.Name -replace '\D') } | Select-Object -Last 1 -ExpandProperty FullName
$androidJar = "$platform\android.jar"

$out = "$here\build"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out\assets", "$out\classes", "$out\dex" | Out-Null

# Native tools are called directly (splatting $args mangles "-flag value" pairs in PowerShell 5).
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed ($LASTEXITCODE)" } }

Write-Host '> Copying game files'
Copy-Item "$web\index.html", "$web\style.css", "$web\game.js", "$web\words.js" "$out\assets"

Write-Host '> Compiling resources'
& "$bt\aapt2.exe" compile --dir "$here\res" -o "$out\res.zip"
Check aapt2.exe
& "$bt\aapt2.exe" link -o "$out\unsigned.apk" -I $androidJar --manifest "$here\AndroidManifest.xml" `
    -A "$out\assets" --min-sdk-version 24 --target-sdk-version 34 --version-code 1 --version-name 1.0 "$out\res.zip"
Check aapt2.exe

Write-Host '> Compiling Java'
$sources = Get-ChildItem -Recurse "$here\src" -Filter *.java | ForEach-Object FullName
& javac -source 8 -target 8 -nowarn -bootclasspath $androidJar -d "$out\classes" $sources
Check javac
$classes = Get-ChildItem -Recurse "$out\classes" -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --release --min-api 24 --lib $androidJar --output "$out\dex" $classes
Check d8.bat

Write-Host '> Packaging'
Push-Location "$out\dex"
try { & "$bt\aapt.exe" add "$out\unsigned.apk" classes.dex; Check aapt.exe } finally { Pop-Location }
& "$bt\zipalign.exe" -p -f 4 "$out\unsigned.apk" "$out\aligned.apk"
Check zipalign.exe

$ks = "$here\shrimple.keystore"
if (-not (Test-Path $ks)) {
    Write-Host '> Creating signing key'
    & keytool -genkeypair -keystore $ks -alias shrimple -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass shrimple -keypass shrimple -dname 'CN=Shrimple'
    Check keytool
}
Write-Host '> Signing'
& "$bt\apksigner.bat" sign --ks $ks --ks-key-alias shrimple --ks-pass pass:shrimple --key-pass pass:shrimple `
    --out "$out\Shrimple.apk" "$out\aligned.apk"
Check apksigner.bat
& "$bt\apksigner.bat" verify "$out\Shrimple.apk"
Check apksigner.bat

Write-Host "`nBuilt $out\Shrimple.apk"
