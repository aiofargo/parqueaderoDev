const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
// Intentar importar ExcelJS, pero continuar si no está disponible
let ExcelJS;
try {
    ExcelJS = require('exceljs');
} catch (error) {
    console.warn('ExcelJS no está instalado. Se usará XLSX para todas las operaciones.');
}
const { executeQuery } = require('../database/connection');
const { getCurrentDate, formatDate } = require('../utils/dateUtils');

class FacturasExcelController {
    constructor() {
        this.logger = console;
    }

    /**
     * Genera un archivo Excel con los datos de las facturas
     * @param {Array} facturas - Array de facturas a exportar
     * @returns {Object} - Objeto con la ruta del archivo generado
     */
    generarExcel(facturas) {
        try {
            this.logger.info('Iniciando generación de archivo Excel...');
            
            // Preparar datos para Excel
            const datos = facturas.map(factura => ({
                'ID': factura.id,
                'Placa': factura.placa,
                'Tipo Vehículo': factura.tipo_vehiculo,
                'Cliente': factura.nombre_completo || '-',
                'Documento': factura.documento_identidad || '-',
                'Email': factura.correo_electronico || '-',
                'Fecha': factura.fecha_movimiento,
                'Valor Base': factura.valor_base,
                '% Desc.': factura.porcentaje_descuento || '0',
                'Descuento': factura.descuento,
                'IVA': factura.valor_iva,
                'Total': factura.valor_total,
                'Tipo': factura.es_movimiento ? 'Por Tiempo' : 'Mensualidad',
                'Estado Factura': factura.factura_creada ? 'CREADA' : 
                                (factura.solicita_factura_electronica ? 'PENDIENTE' : 'NO_SOLICITADA'),
                'Fecha Creación': factura.fecha_creacion_factura || '-'
            }));

            // Crear libro de Excel
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(datos);

            // Ajustar anchos de columnas
            const wscols = [
                {wch: 10}, // ID
                {wch: 15}, // Placa
                {wch: 20}, // Tipo Vehículo
                {wch: 30}, // Cliente
                {wch: 15}, // Documento
                {wch: 25}, // Email
                {wch: 15}, // Fecha
                {wch: 15}, // Valor Base
                {wch: 10}, // % Desc.
                {wch: 15}, // Descuento
                {wch: 15}, // IVA
                {wch: 15}, // Total
                {wch: 15}, // Tipo
                {wch: 20}, // Estado Factura
                {wch: 20}  // Fecha Creación
            ];
            ws['!cols'] = wscols;

            // Agregar hoja al libro
            XLSX.utils.book_append_sheet(wb, ws, 'Facturas');

            // Generar nombre de archivo
            const fechaArchivo = formatDate(getCurrentDate(), 'yyyy-MM-dd');
            const nombreArchivo = `facturas_electronicas_${fechaArchivo}.xlsx`;
            const rutaArchivo = path.join(__dirname, '..', 'uploads', nombreArchivo);

            // Asegurar que existe el directorio
            const uploadsDir = path.join(__dirname, '..', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            // Guardar archivo
            XLSX.writeFile(wb, rutaArchivo);
            
            this.logger.info(`Archivo Excel generado exitosamente: ${rutaArchivo}`);
            
            return {
                success: true,
                rutaArchivo,
                nombreArchivo
            };
        } catch (error) {
            this.logger.error('Error al generar archivo Excel:', error);
            throw new Error(`Error al generar archivo Excel: ${error.message}`);
        }
    }

    /**
     * Procesa un archivo Excel con resultados de facturación
     * @param {string} rutaArchivo - Ruta del archivo Excel a procesar
     * @returns {Object} - Objeto con los resultados procesados
     */
    procesarExcelResultados(rutaArchivo) {
        try {
            this.logger.info('Iniciando procesamiento de archivo Excel...');
            
            // Leer archivo Excel
            const workbook = XLSX.readFile(rutaArchivo);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const datos = XLSX.utils.sheet_to_json(worksheet);

            this.logger.info(`Se encontraron ${datos.length} registros en el archivo`);

            // Procesar resultados
            const resultados = datos.map(fila => {
                // Buscar columnas por nombre o posición
                const id = fila['ID'] || fila['id'] || fila[0];
                const placa = fila['PLACA'] || fila['Placa'] || fila[1];
                const estado = (fila['ESTADO_FACTURA'] || fila['Estado Factura'] || fila[12] || '').toString().toUpperCase();

                return {
                    id: id?.toString(),
                    placa: placa?.toString(),
                    estado_factura: estado.includes('CREADA') ? 'CREADA' : 'PENDIENTE',
                    fecha_creacion: formatDate(getCurrentDate())
                };
            }).filter(r => r.id || r.placa); // Filtrar registros válidos

            this.logger.info(`Se procesaron ${resultados.length} registros válidos`);

            return {
                success: true,
                resultados,
                total: resultados.length
            };
        } catch (error) {
            this.logger.error('Error al procesar archivo Excel:', error);
            throw new Error(`Error al procesar archivo Excel: ${error.message}`);
        }
    }
}

module.exports = new FacturasExcelController(); 