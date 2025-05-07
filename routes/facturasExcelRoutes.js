const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const facturasExcelController = require('../controllers/facturasExcelController');
const fs = require('fs');
const { executeQuery } = require('../database/connection');

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const fechaArchivo = new Date().toISOString().split('T')[0];
        cb(null, `resultados_${fechaArchivo}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        const filetypes = /xlsx|xls/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            return cb(null, true);
        }
        cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
    }
});

// Ruta para descargar Excel
router.get('/descargar', async (req, res) => {
    let archivoTemporal = null;
    
    try {
        const { fechaInicio, fechaFin } = req.query;
        if (!fechaInicio || !fechaFin) {
            throw new Error('Las fechas de inicio y fin son requeridas');
        }

        const facturas = await executeQuery(
            `SELECT 
                f.id,
                f.placa,
                tv.nombre as tipo_vehiculo,
                COALESCE(f.nombre_completo, '-') as nombre_completo,
                COALESCE(f.documento_identidad, '-') as documento_identidad,
                COALESCE(f.correo_electronico, '-') as correo_electronico,
                f.fecha_movimiento,
                f.valor_base,
                f.porcentaje_descuento,
                f.descuento,
                f.valor_iva,
                f.valor_total,
                f.solicita_factura_electronica,
                f.factura_creada,
                f.fecha_creacion_factura
            FROM cli_factura_e f
            LEFT JOIN tipos_vehiculos tv ON f.tipo_vehiculo_id = tv.id
            WHERE DATE(f.fecha_movimiento) BETWEEN ? AND ?
            ORDER BY f.fecha_movimiento DESC`,
            [fechaInicio, fechaFin]
        );

        if (!facturas || facturas.length === 0) {
            throw new Error('No se encontraron facturas para el período seleccionado');
        }

        const resultado = facturasExcelController.generarExcel(facturas);

        if (!fs.existsSync(resultado.rutaArchivo)) {
            throw new Error('Error al generar el archivo Excel');
        }

        archivoTemporal = resultado.rutaArchivo;

        res.download(resultado.rutaArchivo, resultado.nombreArchivo, (err) => {
            if (archivoTemporal && fs.existsSync(archivoTemporal)) {
                fs.unlink(archivoTemporal, () => {});
            }
        });
    } catch (error) {
        if (archivoTemporal && fs.existsSync(archivoTemporal)) {
            try {
                fs.unlinkSync(archivoTemporal);
            } catch (e) {}
        }
        
        res.status(500).json({
            success: false,
            mensaje: error.message || 'Error al generar archivo Excel'
        });
    }
});

// Ruta para cargar resultados
router.post('/cargar', upload.single('archivo'), async (req, res) => {
    let archivoTemporal = null;
    
    try {
        if (!req.file) {
            throw new Error('No se ha subido ningún archivo');
        }

        archivoTemporal = req.file.path;
        const resultado = facturasExcelController.procesarExcelResultados(archivoTemporal);
        let actualizados = 0;

        for (const registro of resultado.resultados) {
            const result = await executeQuery(
                `UPDATE cli_factura_e 
                 SET factura_creada = 1,
                     fecha_creacion_factura = ?
                 WHERE id = ? OR placa = ?`,
                [registro.fecha_creacion, registro.id, registro.placa]
            );
            actualizados += result.affectedRows;
        }

        if (archivoTemporal && fs.existsSync(archivoTemporal)) {
            fs.unlink(archivoTemporal, () => {});
        }

        res.json({
            success: true,
            mensaje: `Se actualizaron ${actualizados} registros exitosamente`,
            total: resultado.total
        });
    } catch (error) {
        if (archivoTemporal && fs.existsSync(archivoTemporal)) {
            try {
                fs.unlinkSync(archivoTemporal);
            } catch (e) {}
        }

        res.status(500).json({
            success: false,
            mensaje: error.message || 'Error al procesar archivo Excel'
        });
    }
});

module.exports = router; 