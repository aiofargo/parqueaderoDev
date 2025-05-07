@echo off
echo Instalando dependencias para el sistema de parqueadero...

:: Comprobar si npm está instalado
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm no esta instalado. Por favor, instale Node.js y npm primero.
    exit /b 1
)

:: Instalar exceljs
echo Instalando exceljs...
npm install exceljs

:: Comprobar resultado
if %errorlevel% equ 0 (
    echo [OK] ExcelJS instalado correctamente
) else (
    echo [ERROR] Error al instalar ExcelJS
)

echo Instalacion completa. Reinicie la aplicacion para aplicar los cambios.
pause 