Param(
  [switch]$Clean
)

Write-Host "==> Verificando JDK 17..."
$jdkCandidates = @(
  "C:\Program Files\Eclipse Adoptium",
  "C:\Program Files\Java"
)
$jdkHome = $null
foreach ($base in $jdkCandidates) {
  if (Test-Path $base) {
    $match = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^jdk-?17' } | Select-Object -First 1
    if ($match) {
      $jdkHome = $match.FullName
      break
    }
  }
}
if (-not $jdkHome) {
  Write-Error "JDK 17 não encontrado. Instale com: winget install EclipseAdoptium.Temurin.17.JDK"
  exit 1
}
$env:JAVA_HOME = $jdkHome
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Write-Host "JAVA_HOME=" $env:JAVA_HOME
try {
  & java -version
} catch {
  Write-Error "Java não disponível no PATH mesmo com JAVA_HOME configurado."
  exit 1
}

Write-Host "==> Verificando Android SDK..."
$sdkDefault = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (Test-Path $env:ANDROID_HOME) {
  $sdkPath = $env:ANDROID_HOME
} elseif (Test-Path $env:ANDROID_SDK_ROOT) {
  $sdkPath = $env:ANDROID_SDK_ROOT
} elseif (Test-Path $sdkDefault) {
  $sdkPath = $sdkDefault
} else {
  $sdkPath = $null
}
if ($sdkPath) {
  $env:ANDROID_HOME = $sdkPath
  $env:ANDROID_SDK_ROOT = $sdkPath
  Write-Host "ANDROID_SDK_ROOT=" $env:ANDROID_SDK_ROOT
} else {
  Write-Warning "Android SDK não encontrado. Prosseguindo; o Gradle apontará o que falta (instale via Android Studio ou sdkmanager)."
}

Write-Host "==> Sincronizando assets web para Android..."
$public = "android\app\src\main\assets\public"
if (-not (Test-Path $public)) { New-Item -ItemType Directory -Force $public | Out-Null }
Copy-Item -Force docs\index.html $public\index.html
Copy-Item -Force docs\app.js $public\app.js
Copy-Item -Force docs\main.css $public\main.css
if (Test-Path docs\lacre-report.js) { Copy-Item -Force docs\lacre-report.js $public\lacre-report.js }
if (Test-Path docs\ui.js) { Copy-Item -Force docs\ui.js $public\ui.js }
if (Test-Path docs\api.js) { Copy-Item -Force docs\api.js $public\api.js }
if (Test-Path docs\config.js) { Copy-Item -Force docs\config.js $public\config.js }

Push-Location android
try {
  if ($Clean) {
    Write-Host "==> Limpando build..."
    & .\gradlew.bat clean
  }
  Write-Host "==> Gerando APK (debug)..."
  & .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao compilar APK."
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$apkSrc = "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkSrc)) {
  Write-Error "APK não encontrado em $apkSrc"
  exit 1
}

if (-not (Test-Path "dist-apk")) { New-Item -ItemType Directory -Force "dist-apk" | Out-Null }
$stamp = (Get-Date).ToString('yyyyMMdd_HHmm')
$apkDest = "dist-apk\app-debug-$stamp.apk"
Copy-Item -Force $apkSrc $apkDest
Copy-Item -Force $apkSrc "dist-apk\app-debug.apk"

Write-Host "==> APK atualizado:"
Write-Host " - $apkDest"
Write-Host " - dist-apk\app-debug.apk"
Write-Host "Concluído com sucesso."

