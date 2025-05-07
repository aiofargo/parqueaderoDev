const { connection } = require('../database/connection');
const { format } = require('date-fns');
const { executeQuery } = require('../database/connection');
const { getCurrentDate, formatDate } = require('../utils/dateUtils');

// Listar todas las facturas
const listarFacturas = async (req, res) => {
    try {
        // Consultar facturas electrónicas usando la tabla cli_factura_e directamente
        const [facturas] = await connection.execute(`
            SELECT 
                cfe.id,
                cfe.placa,
                tv.nombre AS tipo_vehiculo,
                cfe.fecha_movimiento,
                cfe.documento_identidad,
                cfe.nombre_completo,
                cfe.correo_electronico,
                cfe.solicita_factura_electronica,
                cfe.valor_base,
                cfe.porcentaje_descuento,
                cfe.descuento,
                cfe.valor_iva,
                cfe.valor_total,
                CASE 
                    WHEN cfe.tipo_movimiento = 'TIEMPO' THEN TRUE
                    ELSE FALSE
                END AS es_movimiento,
                cfe.tipo_movimiento,
                cfe.factura_creada,
                cfe.fecha_creacion_factura
            FROM cli_factura_e cfe
            JOIN tipos_vehiculos tv ON cfe.tipo_vehiculo_id = tv.id
            ORDER BY cfe.fecha_movimiento DESC
            LIMIT 500
        `);

        res.render('facturas-electronicas/index', {
            title: 'Facturas Electrónicas',
            facturas,
            usuario: req.session.usuario
        });
    } catch (error) {
        console.error('Error al listar facturas electrónicas:', error);
        req.flash('error', 'Error al cargar las facturas electrónicas: ' + error.message);
        res.redirect('/');
    }
};

// Marcar factura como creada
const marcarFacturaCreada = async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({
                error: true,
                mensaje: 'ID de factura inválido'
            });
        }
        
        const fechaActual = formatDate(getCurrentDate(), 'yyyy-MM-dd HH:mm:ss');
        
        await connection.execute(`
            UPDATE cli_factura_e 
            SET factura_creada = 1, 
                fecha_creacion_factura = ? 
            WHERE id = ?
        `, [fechaActual, id]);
        
        res.json({
            error: false,
            mensaje: 'Factura marcada como creada correctamente',
            fecha_creacion: fechaActual
        });
    } catch (error) {
        console.error('Error al marcar factura como creada:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al marcar la factura como creada: ' + error.message
        });
    }
};

// Actualizar facturas con resultados del archivo cargado
const actualizarResultados = async (req, res) => {
    try {
        const { resultados } = req.body;
        
        if (!resultados || !Array.isArray(resultados) || resultados.length === 0) {
            return res.status(400).json({
                error: true,
                mensaje: 'No se recibieron datos válidos para actualizar'
            });
        }
        
        let actualizados = 0;
        const errores = [];
        
        for (const resultado of resultados) {
            try {
                const { id, estado_factura = 'CREADA', fecha_creacion, numero_factura = null } = resultado;
                
                if (!id) {
                    errores.push({ id, error: 'ID no válido' });
                    continue;
                }
                
                // Formatear la fecha
                const fechaFormateada = fecha_creacion || formatDate(getCurrentDate(), 'yyyy-MM-dd HH:mm:ss');
                
                // Actualizar en la base de datos
                await connection.execute(`
                    UPDATE cli_factura_e 
                    SET factura_creada = 1, 
                        fecha_creacion_factura = ?
                        ${numero_factura ? ', numero_factura = ?' : ''}
                    WHERE id = ?
                `, numero_factura ? [fechaFormateada, numero_factura, id] : [fechaFormateada, id]);
                
                actualizados++;
            } catch (error) {
                console.error('Error al procesar registro:', error);
                errores.push({ id: resultado.id, error: error.message });
            }
        }
        
        res.json({
            error: false,
            actualizados,
            errores: errores.length,
            detalles: errores,
            mensaje: `Se actualizaron ${actualizados} facturas correctamente.`
        });
    } catch (error) {
        console.error('Error al actualizar resultados:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al actualizar los resultados: ' + error.message
        });
    }
};

module.exports = {
    listarFacturas,
    marcarFacturaCreada,
    actualizarResultados
}; 