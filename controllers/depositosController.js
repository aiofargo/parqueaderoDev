const { connection, executeQuery } = require('../database/connection');
const { format } = require('date-fns');
const { getCurrentDate, formatDate } = require('../utils/dateUtils');

// Obtener el efectivo en caja desde el último depósito
const obtenerEfectivoEnCaja = async (req, res) => {
    try {
        // Calcular el monto total en efectivo que está en caja (no depositado)
        const [resultado] = await connection.execute(`
            SELECT COALESCE(SUM(valor_total), 0) as monto_total
            FROM movimientos
            WHERE fecha_salida IS NOT NULL
            AND valor_total > 0
            AND depositado_en_caja = 0
        `);

        // Asegurarnos de que el monto sea un número válido
        const montoTotal = resultado[0]?.monto_total ?? 0;
        const montoNumerico = parseFloat(montoTotal);

        res.json({
            error: false,
            monto: montoNumerico,
            montoFormateado: montoNumerico.toLocaleString('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            })
        });

    } catch (error) {
        console.error('Error al obtener efectivo en caja:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al obtener el efectivo en caja',
            monto: 0,
            montoFormateado: '$0'
        });
    }
};

// Mostrar vista previa del depósito
const mostrarVistaPrevia = async (req, res) => {
    try {
        // Obtener movimientos pendientes de depositar con detalles
        const [movimientos] = await connection.execute(`
            SELECT 
                m.id,
                m.placa,
                m.valor_total,
                m.fecha_salida,
                tv.nombre as tipo_vehiculo
            FROM movimientos m
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE m.estado = 0
            AND m.valor_total > 0
            AND m.depositado_en_caja = 0
            ORDER BY tv.nombre, m.fecha_salida
        `);

        if (movimientos.length === 0) {
            req.flash('error', 'No hay efectivo pendiente para depositar');
            return res.redirect('/parqueadero');
        }

        // Calcular totales por tipo de vehículo
        const [movimientosPorTipo] = await connection.execute(`
            SELECT 
                tv.nombre as tipo_vehiculo,
                COUNT(*) as cantidad,
                SUM(m.valor_total) as total
            FROM movimientos m
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE m.estado = 0
            AND m.valor_total > 0
            AND m.depositado_en_caja = 0
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `);

        // Obtener el último depósito para establecer el período
        const [ultimoDeposito] = await connection.execute(`
            SELECT fecha_deposito 
            FROM depositos_caja_fuerte 
            WHERE estado = 1 
            ORDER BY fecha_deposito DESC 
            LIMIT 1
        `);

        const fechaInicio = ultimoDeposito.length > 0 
            ? ultimoDeposito[0].fecha_deposito 
            : new Date(0);

        const montoTotal = movimientos.reduce((sum, mov) => sum + parseFloat(mov.valor_total), 0);

        res.render('parqueadero/vista-previa-deposito', {
            movimientos,
            movimientosPorTipo,
            fechaInicio,
            fechaFin: getCurrentDate(),
            montoTotal,
            usuario: req.session.usuario
        });

    } catch (error) {
        console.error('Error al preparar vista previa del depósito:', error);
        req.flash('error', 'Error al preparar la vista previa del depósito');
        res.redirect('/parqueadero');
    }
};

// Confirmar y registrar el depósito
const confirmarDeposito = async (req, res) => {
    let conn;
    try {
        // Depuración del cuerpo de la solicitud
        console.log('Cuerpo completo de la solicitud:', req.body);
        console.log('Headers de la solicitud:', req.headers);
        console.log('Content-Type:', req.headers['content-type']);
        
        // Asegurarse de que tengamos un objeto con las observaciones
        let observaciones = '';
        if (typeof req.body === 'string') {
            // Si recibimos un string, intentamos parsearlo como JSON
            try {
                const bodyObj = JSON.parse(req.body);
                observaciones = bodyObj.observaciones || '';
            } catch (e) {
                console.error('Error al parsear body como JSON:', e);
                observaciones = req.body;
            }
        } else if (req.body && typeof req.body === 'object') {
            // Si es un objeto, extraemos las observaciones directamente
            observaciones = req.body.observaciones || '';
        }
        
        console.log('Observaciones procesadas:', observaciones);
        
        conn = await connection.getConnection();
        await conn.beginTransaction();
        
        // Verificar que el usuario esté autenticado
        if (!req.session || !req.session.usuario || !req.session.usuario.id) {
            console.error('Usuario no autenticado - session:', req.session);
            await conn.rollback();
            return res.status(401).json({
                error: true,
                mensaje: 'No autorizado. Por favor, inicie sesión nuevamente.'
            });
        }
        
        const usuario_id = req.session.usuario.id;
        console.log('ID de usuario:', usuario_id);
        const fechaActual = formatDate(getCurrentDate(), 'yyyy-MM-dd HH:mm:ss');

        // Obtener movimientos pendientes de depositar
        console.log('Consultando movimientos pendientes...');
        const [movimientos] = await conn.execute(`
            SELECT id, valor_total, fecha_salida
            FROM movimientos
            WHERE estado = 0
            AND valor_total > 0
            AND depositado_en_caja = 0
        `);
        console.log('Movimientos encontrados:', movimientos.length);

        if (movimientos.length === 0) {
            await conn.rollback();
            return res.json({
                error: true,
                mensaje: 'No hay efectivo pendiente para depositar'
            });
        }

        const montoTotal = movimientos.reduce((sum, mov) => sum + parseFloat(mov.valor_total), 0);
        console.log('Monto total a depositar:', montoTotal);

        // Obtener el último depósito para establecer el período
        const [ultimoDeposito] = await conn.execute(`
            SELECT fecha_deposito 
            FROM depositos_caja_fuerte 
            WHERE estado = 1 
            ORDER BY fecha_deposito DESC 
            LIMIT 1
        `);

        const fechaInicio = ultimoDeposito.length > 0 
            ? ultimoDeposito[0].fecha_deposito 
            : formatDate(new Date(0), 'yyyy-MM-dd HH:mm:ss');

        console.log('Insertando registro de depósito...');
        // Crear el registro de depósito
        const [resultDeposito] = await conn.execute(`
            INSERT INTO depositos_caja_fuerte (
                fecha_deposito,
                fecha_inicio_corte,
                fecha_fin_corte,
                monto_efectivo,
                usuario_id,
                observaciones
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [fechaActual, fechaInicio, fechaActual, montoTotal, usuario_id, observaciones]);

        const depositoId = resultDeposito.insertId;
        console.log('Depósito creado con ID:', depositoId);

        // Registrar los movimientos incluidos en el depósito y marcarlos como depositados
        console.log('Registrando movimientos en el depósito...');
        for (const movimiento of movimientos) {
            // Insertar en detalle_movimientos_deposito
            await conn.execute(`
                INSERT INTO detalle_movimientos_deposito (
                    deposito_id,
                    movimiento_id,
                    valor_depositado
                ) VALUES (?, ?, ?)
            `, [depositoId, movimiento.id, movimiento.valor_total]);

            // Actualizar el estado en movimientos
            await conn.execute(`
                UPDATE movimientos 
                SET depositado_en_caja = 1 
                WHERE id = ?
            `, [movimiento.id]);
        }

        console.log('Transacción completa, haciendo commit...');
        await conn.commit();
        console.log('Commit exitoso!');

        console.log('Enviando respuesta exitosa');
        res.json({
            error: false,
            mensaje: 'Depósito registrado exitosamente',
            depositoId: depositoId
        });

    } catch (error) {
        console.error('Error capturado en confirmarDeposito:', error);
        if (conn) {
            try {
                console.log('Haciendo rollback de la transacción');
                await conn.rollback();
            } catch (rollbackError) {
                console.error('Error al hacer rollback de la transacción:', rollbackError);
            }
        }
        console.error('Error al confirmar depósito:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al procesar el depósito: ' + (error.message || 'Error desconocido')
        });
    } finally {
        if (conn) {
            try {
                console.log('Liberando conexión');
                conn.release();
            } catch (releaseError) {
                console.error('Error al liberar la conexión:', releaseError);
            }
        }
    }
};

// Obtener información de un depósito para el ticket
const obtenerDeposito = async (req, res) => {
    try {
        const { id } = req.params;

        // Obtener información básica del depósito
        const [deposito] = await connection.execute(`
            SELECT 
                d.*,
                CONCAT(u.nombres, ' ', u.apellidos) as nombre_usuario
            FROM depositos_caja_fuerte d
            JOIN usuarios u ON d.usuario_id = u.id
            WHERE d.id = ?
        `, [id]);

        if (deposito.length === 0) {
            return res.status(404).render('error', {
                mensaje: 'Depósito no encontrado'
            });
        }

        // Obtener detalle de movimientos incluidos en el depósito
        const [movimientos] = await connection.execute(`
            SELECT 
                m.placa,
                m.fecha_salida,
                m.valor_total,
                tv.nombre as tipo_vehiculo
            FROM detalle_movimientos_deposito dmd
            JOIN movimientos m ON dmd.movimiento_id = m.id
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE dmd.deposito_id = ?
            ORDER BY tv.nombre, m.fecha_salida
        `, [id]);

        // Calcular totales por tipo de vehículo
        const [movimientosPorTipo] = await connection.execute(`
            SELECT 
                tv.nombre as tipo_vehiculo,
                COUNT(*) as cantidad,
                SUM(m.valor_total) as total
            FROM detalle_movimientos_deposito dmd
            JOIN movimientos m ON dmd.movimiento_id = m.id
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE dmd.deposito_id = ?
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `, [id]);

        res.render('parqueadero/ticket-deposito', {
            deposito: deposito[0],
            movimientos,
            movimientosPorTipo,
            now: getCurrentDate()
        });

    } catch (error) {
        console.error('Error al obtener información del depósito:', error);
        res.status(500).render('error', {
            mensaje: 'Error al generar el ticket de depósito'
        });
    }
};

// Mostrar modal de depósito con transacciones desde el último depósito
const mostrarDepositoModal = async (req, res) => {
    try {
        console.log('Iniciando mostrarDepositoModal');
        
        // Verificar la conexión a la base de datos
        try {
            await connection.execute('SELECT 1');
            console.log('Conexión a la base de datos verificada correctamente.');
        } catch (dbError) {
            console.error('Error de conexión a la base de datos:', dbError);
            req.flash('error', 'Error de conexión a la base de datos. Por favor, contacte al administrador.');
            return res.redirect('/parqueadero');
        }

        // Obtener el total de movimientos pendientes de depositar
        console.log('Consultando total de movimientos pendientes');
        const [totalMovimientos] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM movimientos
            WHERE estado = 0
            AND valor_total > 0
            AND depositado_en_caja = 0
        `);

        console.log('Total de movimientos pendientes:', totalMovimientos[0].total);
        if (parseInt(totalMovimientos[0].total) === 0) {
            req.flash('error', 'No hay efectivo pendiente para depositar');
            return res.redirect('/parqueadero');
        }

        // Obtener movimientos pendientes de depositar con detalles
        console.log('Consultando detalle de movimientos pendientes');
        const [movimientos] = await connection.execute(`
            SELECT 
                m.id,
                m.placa,
                m.valor_total,
                m.fecha_salida,
                tv.nombre as tipo_vehiculo
            FROM movimientos m
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE m.estado = 0
            AND m.valor_total > 0
            AND m.depositado_en_caja = 0
            ORDER BY tv.nombre, m.fecha_salida
        `);

        // Calcular totales por tipo de vehículo
        console.log('Calculando totales por tipo de vehículo');
        const [movimientosPorTipo] = await connection.execute(`
            SELECT 
                tv.nombre as tipo_vehiculo,
                COUNT(*) as cantidad,
                SUM(m.valor_total) as total
            FROM movimientos m
            JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
            WHERE m.estado = 0
            AND m.valor_total > 0
            AND m.depositado_en_caja = 0
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `);

        // Obtener el último depósito para establecer el período
        console.log('Consultando último depósito');
        const [ultimoDeposito] = await connection.execute(`
            SELECT fecha_deposito 
            FROM depositos_caja_fuerte 
            WHERE estado = 1 
            ORDER BY fecha_deposito DESC 
            LIMIT 1
        `);

        const fechaInicio = ultimoDeposito.length > 0 
            ? ultimoDeposito[0].fecha_deposito 
            : new Date(0);

        console.log('Fecha inicio corte:', fechaInicio);
        
        const montoTotal = movimientos.reduce((sum, mov) => sum + parseFloat(mov.valor_total), 0);
        console.log('Monto total a depositar:', montoTotal);

        // Renderizar la vista modal-deposito.handlebars con los datos
        console.log('Renderizando vista de depósito');
        res.render('parqueadero/modal-deposito', {
            movimientos,
            movimientosPorTipo,
            fechaInicio,
            fechaFin: getCurrentDate(),
            montoTotal,
            usuario: req.session.usuario
        });

    } catch (error) {
        console.error('Error detallado al preparar modal de depósito:', error);
        req.flash('error', 'Error al preparar el depósito: ' + error.message);
        res.redirect('/parqueadero');
    }
};

// Obtener histórico de depósitos
const obtenerHistoricoDepositos = async (req, res) => {
    try {
        // Consultar todos los depósitos ordenados por fecha (más reciente primero)
        const [depositos] = await connection.execute(`
            SELECT 
                d.*,
                CONCAT(u.nombres, ' ', u.apellidos) as nombre_usuario
            FROM depositos_caja_fuerte d
            JOIN usuarios u ON d.usuario_id = u.id
            WHERE d.estado = 1
            ORDER BY d.fecha_deposito DESC
        `);

        res.render('parqueadero/historico-depositos', {
            depositos,
            usuario: req.session.usuario
        });
    } catch (error) {
        console.error('Error al obtener histórico de depósitos:', error);
        req.flash('error', 'Error al cargar el histórico de depósitos');
        res.redirect('/parqueadero');
    }
};

module.exports = {
    obtenerEfectivoEnCaja,
    mostrarVistaPrevia,
    confirmarDeposito,
    obtenerDeposito,
    mostrarDepositoModal,
    obtenerHistoricoDepositos
}; 