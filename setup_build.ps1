$ErrorActionPreference = "Stop"
$baseDir = "C:\Users\gutem\OneDrive\Desktop\Insumos"
$toolsDir = "$baseDir\tools"
# Java Config
$jdkZip = "$toolsDir\jdk21.zip"
$jdkExtractPath = "$toolsDir\jdk21_extract"
$jdkFinalPath = "$toolsDir\jdk-21"

# Android Config
$androidSdkDir = "$toolsDir\android-sdk"
$cmdLineToolsZip = "$toolsDir\cmdline-tools.zip"
$cmdLineToolsExtract = "$toolsDir\cmdline_extract"
$cmdLineToolsFinal = "$androidSdkDir\cmdline-tools\latest"

Write-Host "=== Iniciando Configuração Automática do Ambiente (Java 21 + Android SDK) ==="

# -------------------------------------------------------------------------
# 1. Preparar diretórios
# -------------------------------------------------------------------------
if (!(Test-Path $toolsDir)) { New-Item -ItemType Directory -Path $toolsDir | Out-Null }
if (!(Test-Path $androidSdkDir)) { New-Item -ItemType Directory -Path $androidSdkDir | Out-Null }

# -------------------------------------------------------------------------
# 2. Configurar JAVA (Reutilizando lógica)
# -------------------------------------------------------------------------
if (!(Test-Path $jdkFinalPath)) {
    if (!(Test-Path $jdkZip)) {
        Write-Host "Baixando OpenJDK 21..."
        $url = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_windows_hotspot_21.0.2_13.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $jdkZip
    }
    Write-Host "Extraindo JDK..."
    Expand-Archive -LiteralPath $jdkZip -DestinationPath $jdkExtractPath -Force
    $subFolder = Get-ChildItem -Path $jdkExtractPath -Directory | Select-Object -First 1
    Move-Item -Path $subFolder.FullName -Destination $jdkFinalPath
    Remove-Item -Path $jdkExtractPath -Recurse -Force
}

$env:JAVA_HOME = $jdkFinalPath
$env:PATH = "$jdkFinalPath\bin;$env:PATH"
Write-Host "Java configurado: $(java -version 2>&1 | Select-Object -First 1)"

# -------------------------------------------------------------------------
# 3. Configurar Android Command Line Tools
# -------------------------------------------------------------------------
if (!(Test-Path "$cmdLineToolsFinal\bin\sdkmanager.bat")) {
    if (!(Test-Path $cmdLineToolsZip)) {
        Write-Host "Baixando Android Command Line Tools (aprox. 100MB)..."
        # URL oficial Google
        $urlSdk = "https://dl.google.com/android/repository/commandlinetools-win-10406996_latest.zip"
        Invoke-WebRequest -Uri $urlSdk -OutFile $cmdLineToolsZip
        Write-Host "Download SDK concluído."
    }

    Write-Host "Extraindo Command Line Tools..."
    Expand-Archive -LiteralPath $cmdLineToolsZip -DestinationPath $cmdLineToolsExtract -Force
    
    # Estrutura obrigatória: cmdline-tools/latest/bin
    # O zip extrai como "cmdline-tools/bin", então precisamos mover.
    
    $extractedRoot = "$cmdLineToolsExtract\cmdline-tools"
    
    if (!(Test-Path $cmdLineToolsFinal)) {
        New-Item -ItemType Directory -Path $cmdLineToolsFinal -Force | Out-Null
    }
    
    # Move conteúdo de cmdline-tools/* para cmdline-tools/latest/
    Get-ChildItem -Path $extractedRoot | Move-Item -Destination $cmdLineToolsFinal -Force
    
    Remove-Item -Path $cmdLineToolsExtract -Recurse -Force
    Write-Host "Command Line Tools configurado."
}

# Configurar Variáveis Android
$env:ANDROID_HOME = $androidSdkDir
$env:PATH = "$cmdLineToolsFinal\bin;$env:PATH"

# -------------------------------------------------------------------------
# 4. Aceitar Licenças e Instalar Plataformas
# -------------------------------------------------------------------------
Write-Host "Aceitando licenças e instalando dependências do SDK..."

# Criar arquivo de resposta 'y' para as licenças
$yesFile = "$toolsDir\yes.txt"
"y`ny`ny`ny`ny`ny`ny`n" | Set-Content $yesFile

# Instalar pacotes essenciais
# platform-tools, platforms;android-33 (compatível com config padrão), build-tools
$sdkmanager = "$cmdLineToolsFinal\bin\sdkmanager.bat"

Write-Host "Executando sdkmanager (isso pode demorar)..."
Get-Content $yesFile | & $sdkmanager --licenses --sdk_root="$androidSdkDir"
& $sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2" --sdk_root="$androidSdkDir"

# -------------------------------------------------------------------------
# 5. Build
# -------------------------------------------------------------------------
Write-Host "`n=== Iniciando Build do Android ==="
Set-Location "$baseDir\android"
.\gradlew.bat assembleDebug
