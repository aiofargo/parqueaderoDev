const { connection, executeQuery } = require('../database/connection');
const { format } = require('date-fns');
const { es } = require('date-fns/locale');
const { getCurrentDate, formatDate, formatDateES, parseDate } = require('../utils/dateUtils');

// Mostrar formulario de entrada
const mostrarFormularioEntrada = async (req, res) => {
    try {
        const [tiposVehiculos] = await connection.execute(
            'SELECT id, nombre, descripcion, icono FROM tipos_vehiculos WHERE estado = ?',
            [1]
        );
        
        res.render('parqueadero/entrada', { 
            tiposVehiculos,
            error: null 
        });
    } catch (error) {
        console.error('Error al cargar tipos de vehículos:', error);
        res.render('parqueadero/entrada', { 
            error: 'Error al cargar los tipos de vehículos. Por favor, contacte al administrador.',
            tiposVehiculos: []
        });
    }
};

// Verificar placa
const verificarPlaca = async (req, res) => {
    const { placa } = req.query;
    try {
        console.log('Iniciando verificación de placa:', placa);
        const placaFormateada = placa.trim().toUpperCase();
        console.log('Placa formateada:', placaFormateada);
        
        // Verificar si el vehículo está dentro del parqueadero
        const [vehiculoActivo] = await connection.query(
            'SELECT id, fecha_entrada FROM movimientos WHERE placa = ? AND estado = 1',
            [placaFormateada]
        );
        console.log('Resultado búsqueda vehículo activo:', vehiculoActivo);

        if (vehiculoActivo.length > 0) {
            console.log('Vehículo encontrado dentro del parqueadero');
            return res.json({
                error: true,
                mensaje: 'Este vehículo ya se encuentra dentro del parqueadero',
                fechaEntrada: formatDateES(vehiculoActivo[0].fecha_entrada),
                requiereTipoVehiculo: false
            });
        }

        // 1. Verificar si tiene mensualidad activa
        const queryMensualidad = 'SELECT m.*, tv.nombre as tipo_vehiculo, tv.id as tipo_vehiculo_id FROM mensualidades m ' +
            'INNER JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id ' +
            'WHERE m.placa = ? AND m.vigente_hasta >= CURDATE() AND m.estado = 1 ' +
            'ORDER BY m.vigente_hasta DESC LIMIT 1';
        console.log('Query mensualidad:', queryMensualidad);
        
        const [mensualidades] = await connection.query(queryMensualidad, [placaFormateada]);
        console.log('Resultado búsqueda mensualidad:', mensualidades);

        // 2. Verificar si es vehículo exento
        const queryExento = 'SELECT ve.*, tv.nombre as tipo_vehiculo, tv.id as tipo_vehiculo_id FROM vehiculos_exentos ve ' +
            'INNER JOIN tipos_vehiculos tv ON ve.tipo_vehiculo_id = tv.id ' +
            'WHERE ve.placa = ? AND ve.fecha_fin >= CURDATE() AND ve.estado = 1';
        console.log('Query exento:', queryExento);
        
        const [vehiculosExentos] = await connection.query(queryExento, [placaFormateada]);
        console.log('Resultado búsqueda vehículo exento:', vehiculosExentos);

        let resultado = {
            error: false,
            requiereTipoVehiculo: true,
            tipo: 'TIEMPO',
            mensaje: null
        };

        if (mensualidades.length > 0) {
            console.log('Vehículo con mensualidad activa encontrado');
            resultado = {
                error: false,
                requiereTipoVehiculo: false,
                tipo: 'MENSUAL',
                tipoVehiculoId: mensualidades[0].tipo_vehiculo_id,
                tipoVehiculo: mensualidades[0].tipo_vehiculo,
                vencimiento: mensualidades[0].vigente_hasta,
                mensaje: 'Vehículo con mensualidad activa'
            };
        } else if (vehiculosExentos.length > 0) {
            console.log('Vehículo exento encontrado');
            resultado = {
                error: false,
                requiereTipoVehiculo: false,
                tipo: 'EXENTO',
                tipoVehiculoId: vehiculosExentos[0].tipo_vehiculo_id,
                tipoVehiculo: vehiculosExentos[0].tipo_vehiculo,
                mensaje: 'Vehículo exento de pago'
            };
        } else {
            console.log('Vehículo requiere selección de tipo para cobro por tiempo');
        }

        console.log('Enviando resultado:', resultado);
        res.json(resultado);
    } catch (error) {
        console.error('Error detallado al verificar placa:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: true, 
            mensaje: 'Error al verificar la placa: ' + error.message,
            requiereTipoVehiculo: false
        });
    }
};

// Procesar entrada de vehículo
const procesarEntrada = async (req, res) => {
    try {
        const { placa, tipo_vehiculo_id, observaciones_entrada } = req.body;
        
        // Validaciones iniciales
        if (!placa || !tipo_vehiculo_id) {
            throw new Error('La placa y el tipo de vehículo son obligatorios');
        }

        // Verificar si el vehículo ya está dentro del parqueadero
        const [vehiculoActivo] = await connection.query(
            'SELECT id, fecha_entrada FROM movimientos WHERE placa = ? AND estado = 1',
            [placa.trim().toUpperCase()]
        );

        if (vehiculoActivo.length > 0) {
            throw new Error('Este vehículo ya se encuentra dentro del parqueadero. ' +
                          'Entrada registrada el: ' + 
                          formatDateES(vehiculoActivo[0].fecha_entrada));
        }

        // Validar que tipo_vehiculo_id sea un número válido
        const tipoVehiculoId = parseInt(tipo_vehiculo_id);
        if (isNaN(tipoVehiculoId)) {
            throw new Error('El tipo de vehículo seleccionado no es válido');
        }

        // Verificar que el tipo de vehículo existe y obtener su información
        const [tiposVehiculo] = await connection.query(
            'SELECT id, nombre, porcentaje_iva FROM tipos_vehiculos WHERE id = ? AND estado = 1',
            [tipoVehiculoId]
        );

        if (tiposVehiculo.length === 0) {
            throw new Error('El tipo de vehículo seleccionado no existe o está inactivo');
        }

        // 1. Verificar si tiene mensualidad activa
        const [mensualidades] = await connection.query(
            'SELECT id, vigente_hasta FROM mensualidades WHERE placa = ? AND vigente_hasta >= CURDATE() AND estado = 1 LIMIT 1',
            [placa.trim().toUpperCase()]
        );

        // 2. Verificar si es vehículo exento
        const [vehiculosExentos] = await connection.query(
            'SELECT id FROM vehiculos_exentos WHERE placa = ? AND fecha_fin >= CURDATE() AND estado = 1 LIMIT 1',
            [placa.trim().toUpperCase()]
        );

        // Registrar la entrada en la tabla de movimientos
        const [resultado] = await connection.query(
            `INSERT INTO movimientos (
                placa, 
                tipo_vehiculo_id, 
                fecha_entrada,
                usuario_entrada_id, 
                observaciones_entrada,
                estado,
                valor_base,
                valor_iva,
                valor_total,
                valor_descuento
            ) VALUES (?, ?, NOW(), ?, ?, 1, 0, 0, 0, 0)`,
            [
                placa.trim().toUpperCase(),
                tipoVehiculoId,
                req.session.usuario?.id || null,
                observaciones_entrada || null
            ]
        );

        // Determinar el tipo de cobro para el ticket
        const tipoCobro = mensualidades.length > 0 ? 'PAGO POR MENSUALIDAD' : 
                         vehiculosExentos.length > 0 ? 'VEHÍCULO EXENTO' : 
                         'COBRO POR TIEMPO DE PERMANENCIA';

        // Preparar datos para el ticket
        const ticketData = {
            placa: placa.trim().toUpperCase(),
            fechaEntrada: formatDateES(getCurrentDate()),
            tipoVehiculo: tiposVehiculo[0].nombre,
            tipoCobro,
            mensualidadVence: mensualidades.length > 0 && mensualidades[0].vigente_hasta ? 
                formatDate(mensualidades[0].vigente_hasta, "d 'de' MMMM 'de' yyyy") : 
                null,
            observaciones: observaciones_entrada || null,
            error: null,
            success: true,
            movimientoId: resultado.insertId,
            numeroTicket: `E-${String(resultado.insertId).padStart(6, '0')}`,
            session: req.session,
            vehiculo: {
                ...tiposVehiculo[0],
                placa: placa.trim().toUpperCase(),
                fechaEntrada: formatDateES(getCurrentDate()),
                tieneVigencia: mensualidades.length > 0 && 
                               parseDate(mensualidades[0].vigente_hasta) >= getCurrentDate(),
                fechaVencimiento: mensualidades.length > 0 ? 
                    formatDate(mensualidades[0].vigente_hasta, "d 'de' MMMM 'de' yyyy") :
                    null
            }
        };

        res.render('parqueadero/ticket', ticketData);
    } catch (error) {
        console.error('Error detallado:', error);
        const [tiposVehiculos] = await connection.query(
            'SELECT id, nombre, descripcion FROM tipos_vehiculos WHERE estado = 1'
        );
        res.render('parqueadero/entrada', {
            error: error.message,
            tiposVehiculos,
            success: false
        });
    }
};

module.exports = {
    mostrarFormularioEntrada,
    verificarPlaca,
    procesarEntrada
}; 