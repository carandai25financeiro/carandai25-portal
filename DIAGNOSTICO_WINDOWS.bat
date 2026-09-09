@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CARANDAI 25 - Diagnostico

echo =====================================================
echo   CARANDAI 25 - DIAGNOSTICO DO PORTAL
echo =====================================================
echo.
echo Pasta atual: %CD%
echo.

echo [1] Verificando Node.js...
where node
if errorlevel 1 (
  echo FALHA: Node.js nao encontrado.
) else (
  node -v
)
echo.

echo [2] Verificando arquivos principais...
for %%F in (server.js package.json public\index.html public\app.js public\styles.css public\assets\estruturas\estrutura-moda.png public\assets\estruturas\estrutura-bem-estar-decoracao.png public\assets\estruturas\estrutura-bolsas-sapatos.png public\assets\estruturas\estrutura-acessorios.png) do (
  if exist "%%F" (echo OK: %%F) else (echo FALTA: %%F)
)
echo.

echo [3] Verificando porta 3000...
netstat -ano | findstr /R /C:":3000 .*LISTENING"
if errorlevel 1 echo OK: porta 3000 aparentemente livre.
echo.

echo [4] Teste direto do servidor...
echo Se aparecer uma mensagem de erro abaixo, copie ou tire uma foto e envie no ChatGPT.
echo Para encerrar o teste, pressione Ctrl+C.
echo.
node server.js

echo.
pause
