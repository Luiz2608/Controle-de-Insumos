Param(
  [string]$ApiLevel = "35",
  [string]$BuildTools = "35.0.0"
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
try {
  & java -version | Out-Host
} catch {
  Write-Error "Java não disponível no PATH mesmo com JAVA_HOME configurado."
  exit 1
}

function Ensure-Dir($p) { if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force $p | Out-Null } }

$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
Ensure-Dir $sdkRoot
Ensure-Dir (Join-Path $sdkRoot "cmdline-tools")

# Baixar commandline-tools (Google)
$tmp = Join-Path $env:TEMP "cmdline-tools-win_latest.zip"
$url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
Write-Host "Baixando Android cmdline-tools..."
try {
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -ErrorAction Stop
} catch {
  Write-Warning "Invoke-WebRequest falhou. Tentando com curl..."
  $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue)
  if ($curl) {
    & $curl.Path -L -o $tmp $url
  } else {
    throw $_
  }
}

$extractTo = Join-Path $sdkRoot "cmdline-tools\_tmp"
Ensure-Dir $extractTo
Expand-Archive -Path $tmp -DestinationPath $extractTo -Force

# Mover estrutura para ...\cmdline-tools\latest
$latest = Join-Path $sdkRoot "cmdline-tools\latest"
if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
Move-Item -Force (Join-Path $extractTo "cmdline-tools") $latest
Remove-Item -Recurse -Force $extractTo
Remove-Item -Force $tmp

$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:Path = (Join-Path $latest "bin") + ";" + $env:Path

Write-Host "Aceitando licenças padrão do SDK..."
$licDir = Join-Path $sdkRoot "licenses"
if (-not (Test-Path $licDir)) { New-Item -ItemType Directory -Force $licDir | Out-Null }
# Hashes públicos de licenças do Android SDK (Build-tools / Platform)
$licenseFile = Join-Path $licDir "android-sdk-license"
@(
  "d56f5187479451eabf01fb78af6dfcb131a6481e"
  "24333f8a63b6825ea9c5514f83c2829b004d1fee"
) | Set-Content -Path $licenseFile -Encoding ascii

Write-Host "Instalando pacotes essenciais do SDK..."
& sdkmanager "platform-tools" "platforms;android-$ApiLevel" "build-tools;$BuildTools"

Write-Host "SDK instalado em: $sdkRoot"
Write-Host "cmdline-tools em: $latest"
