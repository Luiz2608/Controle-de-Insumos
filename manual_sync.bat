@echo off
echo ==========================================
echo      INICIANDO SINCRONIZACAO AUTOMATICA
echo ==========================================
echo.
echo [1/5] Atualizando repositorio local (git pull)...
git pull origin master

echo.
echo [2/5] Sincronizando pasta docs...
xcopy "frontend\*" "docs\" /E /I /Y

echo.
echo [3/5] Adicionando alteracoes ao Git...
git add .

echo.
echo [4/5] Registrando versao (commit)...
git commit -m "feat: Atualizacao completa Painel Admin e Auditoria"

echo.
echo [5/5] Enviando para nuvem (git push)...
git push origin master

echo.
if %errorlevel% equ 0 (
    echo ==========================================
    echo      SUCESSO! TUDO ATUALIZADO.
    echo ==========================================
) else (
    echo ==========================================
    echo      ERRO NO ENVIO (PUSH)
    echo ==========================================
    echo Verifique sua internet ou credenciais.
)
pause
