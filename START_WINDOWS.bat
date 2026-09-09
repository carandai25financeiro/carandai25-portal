@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CARANDAI 25 - Inicializador do Portal

echo =====================================================
echo   CARANDAI 25 - PORTAL DA MARCA
echo =====================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto NODE_MISSING

for /f "tokens=1 delims=." %%A in ('node -p "process.versions.node"') do set NODE_MAJOR=%%A
for /f %%A in ('node -p "process.versions.node"') do set NODE_VERSION=%%A

echo Node.js encontrado: v%NODE_VERSION%
if %NODE_MAJOR% LSS 22 goto NODE_OLD

set PORT=3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo A porta 3000 ja esta em uso. Vou tentar a porta 3001.
  set PORT=3001
)

echo.
echo Iniciando o servidor na porta %PORT%...
start "CARANDAI 25 - Servidor" cmd /k "cd /d ""%~dp0"" && set PORT=%PORT% && node server.js"

timeout /t 3 /nobreak >nul

echo Abrindo o navegador em http://localhost:%PORT%
start "" "http://localhost:%PORT%"

echo.
echo IMPORTANTE:
echo - Deixe a janela do servidor aberta enquanto usar o portal.
echo - Se o navegador mostrar erro, aguarde alguns segundos e atualize a pagina.
echo - Se a janela do servidor mostrar erro, execute DIAGNOSTICO_WINDOWS.bat.
echo.
pause
exit /b 0

:NODE_MISSING
echo ERRO: Node.js nao foi encontrado neste computador.
echo Instale Node.js 22 LTS ou superior e execute este arquivo novamente.
echo Site oficial: https://nodejs.org/
echo.
pause
exit /b 1

:NODE_OLD
echo ERRO: A versao instalada do Node.js e v%NODE_VERSION%.
echo Este portal precisa do Node.js 22 ou superior.
echo Atualize o Node.js e execute este arquivo novamente.
echo Site oficial: https://nodejs.org/
echo.
pause
exit /b 1
