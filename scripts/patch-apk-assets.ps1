Param(
  [string]$Src = "",
  [switch]$KeepTemp
)

function Fail($msg) { Write-Error $msg; exit 1 }

Write-Host "==> Localizando APK de origem..."
if (-not $Src -or $Src -eq "") {
  $c1 = "dist-apk\app-debug.apk"
  $c2 = "android\app\build\outputs\apk\debug\app-debug.apk"
  if (Test-Path $c1) { $Src = $c1 }
  elseif (Test-Path $c2) { $Src = $c2 }
  else { Fail "Nenhum APK encontrado em $c1 ou $c2. Gere um APK primeiro." }
}
if (-not (Test-Path $Src)) { Fail "APK não encontrado: $Src" }
Write-Host "APK origem: $Src"

Write-Host "==> Verificando JDK (jarsigner/keytool)..."
# Tenta localizar JDK 17 e configurar PATH localmente
$jdkCandidates = @(
  "C:\Program Files\Eclipse Adoptium",
  "C:\Program Files\Java"
)
foreach ($base in $jdkCandidates) {
  if (Test-Path $base) {
    $match = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^jdk-?17' } | Select-Object -First 1
    if ($match) {
      $env:JAVA_HOME = $match.FullName
      $env:Path = "$env:JAVA_HOME\bin;$env:Path"
      break
    }
  }
}
try { & jarsigner -version | Out-Null } catch { Fail "jarsigner não encontrado no PATH. Instale/Configure JDK 17." }
try { & keytool -help | Out-Null } catch { Fail "keytool não encontrado no PATH. Instale/Configure JDK 17." }

Write-Host "==> Atualizando assets dentro do APK (sem recompilar)..."
$tmp = Join-Path $env:TEMP ("apk_patch_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null
$unzipDir = Join-Path $tmp "unzipped"
New-Item -ItemType Directory -Force $unzipDir | Out-Null

# Expand-Archive só aceita .zip: copiar o APK para .zip temporário
$srcZip = Join-Path $tmp "src.zip"
Copy-Item -Force $Src $srcZip
Expand-Archive -Path $srcZip -DestinationPath $unzipDir -Force

$assetsPublic = Join-Path $unzipDir "assets\public"
if (-not (Test-Path $assetsPublic)) {
  New-Item -ItemType Directory -Force $assetsPublic | Out-Null
}

Copy-Item -Force docs\index.html (Join-Path $assetsPublic "index.html")
Copy-Item -Force docs\app.js (Join-Path $assetsPublic "app.js")
Copy-Item -Force docs\main.css (Join-Path $assetsPublic "main.css")
if (Test-Path docs\lacre-report.js) { Copy-Item -Force docs\lacre-report.js (Join-Path $assetsPublic "lacre-report.js") }
if (Test-Path docs\ui.js) { Copy-Item -Force docs\ui.js (Join-Path $assetsPublic "ui.js") }
if (Test-Path docs\api.js) { Copy-Item -Force docs\api.js (Join-Path $assetsPublic "api.js") }
if (Test-Path docs\config.js) { Copy-Item -Force docs\config.js (Join-Path $assetsPublic "config.js") }

$zipPath = Join-Path $tmp "patched.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $unzipDir "*") -DestinationPath $zipPath -Force

$outDir = "dist-apk"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
$stamp = (Get-Date).ToString('yyyyMMdd_HHmm')
$outApk = Join-Path $outDir ("app-debug-patched-$stamp.apk")
Copy-Item -Force $zipPath $outApk
Copy-Item -Force $outApk (Join-Path $outDir "app-debug.apk")

Write-Host "==> Assinando APK com keystore local (v1)..."
$keystore = "scripts\debug-signer.keystore"
$storepass = "android"
$keypass = "android"
$alias = "debugkey"
if (-not (Test-Path $keystore)) {
  & keytool -genkeypair -v -keystore $keystore -storepass $storepass -keypass $keypass -alias $alias -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=Local Debug, OU=Dev, O=App, L=City, S=State, C=BR" | Out-Null
}
& jarsigner -keystore $keystore -storepass $storepass -keypass $keypass $outApk $alias | Out-Null

Write-Host "==> APK atualizado e assinado:"
Write-Host " - $outApk"
Write-Host " - $outDir\app-debug.apk"

if (-not $KeepTemp) {
  Remove-Item -Recurse -Force $tmp
}
Write-Host "Concluído."
