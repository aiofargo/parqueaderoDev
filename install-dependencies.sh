#!/bin/bash
# Script para instalar dependencias específicas

echo "Instalando dependencias para el sistema de parqueadero..."

# Comprobar si npm está instalado
if ! command -v npm &> /dev/null; then
    echo "Error: npm no está instalado. Por favor, instale Node.js y npm primero."
    exit 1
fi

# Instalar exceljs
echo "Instalando exceljs..."
npm install exceljs

# Comprobar resultado
if [ $? -eq 0 ]; then
    echo "✅ ExcelJS instalado correctamente"
else
    echo "❌ Error al instalar ExcelJS"
fi

echo "Instalación completa. Reinicie la aplicación para aplicar los cambios." 