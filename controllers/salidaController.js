const { connection, executeQuery } = require('../database/connection');
const { format } = require('date-fns');
const { es } = require('date-fns/locale');
const { differenceInMinutes, differenceInHours } = require('date-fns');
const { getCurrentDate, formatDate, formatDateES, parseDate } = require('../utils/dateUtils');

// Mostrar formulario de salida
const mostrarFormularioSalida = async (req, res) => {
    try {
        // Obtener vehículos en patio con información de mensualidad y exención
        const [vehiculosEnPatio] = await connection.query(
            `SELECT 
                m.id,
                m.placa, 
                m.fecha_entrada, 
                tv.nombre as tipo_vehiculo,
                CASE 
                    WHEN men.id IS NOT NULL THEN 'MENSUAL'
                    WHEN ve.id IS NOT NULL THEN 'EXENTO'
                    ELSE 'TIEMPO'
                END as tipo_cobro,
                CASE 
                    WHEN men.id IS NOT NULL THEN men.vigente_hasta
                    WHEN ve.id IS NOT NULL THEN ve.fecha_fin
                    ELSE NULL 
                END as fecha_vencimiento
            FROM movimientos m 
            INNER JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id 
            LEFT JOIN mensualidades men ON m.placa = men.placa 
                AND men.vigente_hasta >= CURDATE() 
                AND men.estado = 1
            LEFT JOIN vehiculos_exentos ve ON m.placa = ve.placa 
                AND ve.fecha_fin >= CURDATE() 
                AND ve.estado = 1
            WHERE m.estado = 1 
            ORDER BY m.fecha_entrada DESC`
        );

        // Formatear las fechas y preparar los datos para la vista
        const vehiculosFormateados = vehiculosEnPatio.map(vehiculo => ({
            id: vehiculo.id,
            placa: vehiculo.placa,
            tipo: vehiculo.tipo_vehiculo,
            fecha_entrada: formatDateES(vehiculo.fecha_entrada),
            tipo_cobro: vehiculo.tipo_cobro,
            fecha_vencimiento: vehiculo.fecha_vencimiento ? 
                formatDateES(vehiculo.fecha_vencimiento) : 
                null
        }));

        res.render('parqueadero/salida', { 
            error: null,
            vehiculosEnPatio: vehiculosFormateados
        });
    } catch (error) {
        console.error('Error al mostrar formulario de salida:', error);
        res.render('parqueadero/salida', { 
            error: 'Error al cargar el formulario. Por favor, contacte al administrador.',
            vehiculosEnPatio: []
        });
    }
};

// Verificar vehículo para salida
const verificarVehiculoSalida = async (req, res) => {
    try {
        const placa = req.query.placa;
        const descuentoPlaza = req.query.descuentoPlaza === 'true';
        
        if (!placa) {
            return res.status(400).json({
                error: true,
                mensaje: 'La placa es requerida'
            });
        }

        // Buscar el movimiento activo por placa con información de mensualidad y exención
        const [movimiento] = await connection.query(
            `SELECT m.*, tv.nombre as tipo_vehiculo, tv.porcentaje_iva, 
                    tv.tarifa_minuto, tv.tarifa_plena, tv.tarifa_24_horas,
                    CASE 
                        WHEN men.id IS NOT NULL THEN 'MENSUAL'
                        WHEN ve.id IS NOT NULL THEN 'EXENTO'
                        ELSE 'TIEMPO'
                    END as tipo_cobro,
                    CASE 
                        WHEN men.id IS NOT NULL THEN men.vigente_hasta
                        WHEN ve.id IS NOT NULL THEN ve.fecha_fin
                        ELSE NULL 
                    END as fecha_vencimiento
             FROM movimientos m 
             INNER JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id 
             LEFT JOIN mensualidades men ON m.placa = men.placa 
                AND men.vigente_hasta >= CURDATE() 
                AND men.estado = 1
             LEFT JOIN vehiculos_exentos ve ON m.placa = ve.placa 
                AND ve.fecha_fin >= CURDATE() 
                AND ve.estado = 1
             WHERE m.placa = ? AND m.estado = 1`,
            [placa.trim().toUpperCase()]
        );

        if (movimiento.length === 0) {
            return res.status(404).json({
                error: true,
                mensaje: 'No se encontró un movimiento activo para el vehículo'
            });
        }

        const fechaEntrada = parseDate(movimiento[0].fecha_entrada);
        const fechaSalida = getCurrentDate();

        // Calcular tiempo total en minutos
        const tiempoOriginal = Math.ceil((fechaSalida - fechaEntrada) / (1000 * 60));
        let tiempoACobrar = tiempoOriginal;

        // Aplicar descuento por compra en plaza si está marcado
        let descuentoPlazaMinutos = 0;
        if (descuentoPlaza) {
            descuentoPlazaMinutos = 60; // 1 hora de descuento
            tiempoACobrar = Math.max(0, tiempoACobrar - descuentoPlazaMinutos);
        }

        // Constantes de tiempo
        const minutosEnDosHoras = 120;
        const minutosEn12Horas = 720;
        const minutosEn24Horas = 1440;

        // Calcular días completos y minutos restantes
        const diasCompletos = Math.floor(tiempoACobrar / minutosEn24Horas);
        const minutosRestantesDespuesDias = tiempoACobrar % minutosEn24Horas;

        let desgloseCobro = [];
        let valorTotal = 0;

        // Solo calcular valor si no es mensual ni exento
        if (movimiento[0].tipo_cobro === 'TIEMPO') {
            // Cobro por días completos
            if (diasCompletos > 0) {
                const valorDias = diasCompletos * Number(movimiento[0].tarifa_24_horas);
                desgloseCobro.push({
                    concepto: `${diasCompletos} día${diasCompletos > 1 ? 's' : ''} (24 horas)`,
                    valor: valorDias
                });
                valorTotal += valorDias;
            }

            // Cobro por tiempo restante
            if (minutosRestantesDespuesDias > 0) {
                if (minutosRestantesDespuesDias <= minutosEnDosHoras) {
                    const valorMinutos = Math.ceil(minutosRestantesDespuesDias * Number(movimiento[0].tarifa_minuto));
                    desgloseCobro.push({
                        concepto: `${minutosRestantesDespuesDias} minutos`,
                        valor: valorMinutos
                    });
                    valorTotal += valorMinutos;
                } else if (minutosRestantesDespuesDias <= minutosEn12Horas) {
                    desgloseCobro.push({
                        concepto: 'Tarifa plena',
                        valor: Number(movimiento[0].tarifa_plena)
                    });
                    valorTotal += Number(movimiento[0].tarifa_plena);
                } else {
                    desgloseCobro.push({
                        concepto: 'Día adicional (24 horas)',
                        valor: Number(movimiento[0].tarifa_24_horas)
                    });
                    valorTotal += Number(movimiento[0].tarifa_24_horas);
                }
            }

            // Si hay descuento por plaza, agregarlo al desglose
            if (descuentoPlaza) {
                const valorDescuento = Math.ceil(60 * Number(movimiento[0].tarifa_minuto));
                desgloseCobro.push({
                    concepto: 'Descuento por compra en plaza (1 hora)',
                    valor: -valorDescuento
                });
                valorTotal = Math.max(0, valorTotal - valorDescuento);
            }
        }

        // Cálculo del IVA solo si es cobro por tiempo
        const porcentajeIva = movimiento[0].tipo_cobro === 'TIEMPO' ? Number(movimiento[0].porcentaje_iva) : 0;
        const valorSinIva = Math.round(valorTotal / (1 + (porcentajeIva / 100)));
        const valorIva = valorTotal - valorSinIva;

        // Preparar respuesta
        const respuesta = {
            error: false,
            movimientoId: movimiento[0].id,
            placa: movimiento[0].placa,
            tipoVehiculo: movimiento[0].tipo_vehiculo,
            fechaEntrada: formatDateES(movimiento[0].fecha_entrada),
            fechaSalida: formatDateES(fechaSalida),
            tiempoTotal: {
                dias: Math.floor(tiempoACobrar / 1440),
                horas: Math.floor((tiempoACobrar % 1440) / 60),
                minutos: tiempoACobrar % 60
            },
            tiempoOriginal: {
                dias: Math.floor(tiempoOriginal / 1440),
                horas: Math.floor((tiempoOriginal % 1440) / 60),
                minutos: tiempoOriginal % 60
            },
            tipo: movimiento[0].tipo_cobro,
            desgloseCobro,
            valorSinIva,
            valorIva,
            valorTotal,
            porcentajeIva,
            descuentoPlaza,
            mostrarFactura: movimiento[0].tipo_cobro === 'TIEMPO',
            vencimiento: movimiento[0].fecha_vencimiento ? 
                formatDateES(movimiento[0].fecha_vencimiento) : 
                null
        };

        res.json(respuesta);
    } catch (error) {
        console.error('Error al verificar salida:', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error al verificar la salida del vehículo'
        });
    }
};

// Procesar salida de vehículo
const procesarSalida = async (req, res) => {
    const { movimientoId, descuentoPlaza, requiereFactura } = req.body;
    try {
        // Obtener el movimiento y tipo de vehículo con información de mensualidad y exención
        const [movimientos] = await connection.query(
            `SELECT m.*, tv.nombre as tipo_vehiculo, tv.porcentaje_iva, 
                    tv.tarifa_minuto, tv.tarifa_plena, tv.tarifa_24_horas,
                    CASE 
                        WHEN men.id IS NOT NULL THEN 'MENSUAL'
                        WHEN ve.id IS NOT NULL THEN 'EXENTO'
                        ELSE 'TIEMPO'
                    END as tipo_cobro,
                    CASE 
                        WHEN men.id IS NOT NULL THEN men.vigente_hasta
                        WHEN ve.id IS NOT NULL THEN ve.fecha_fin
                        ELSE NULL 
                    END as fecha_vencimiento
             FROM movimientos m 
             INNER JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id 
             LEFT JOIN mensualidades men ON m.placa = men.placa 
                AND men.vigente_hasta >= CURDATE() 
                AND men.estado = 1
             LEFT JOIN vehiculos_exentos ve ON m.placa = ve.placa 
                AND ve.fecha_fin >= CURDATE() 
                AND ve.estado = 1
             WHERE m.id = ?`,
            [movimientoId]
        );

        if (movimientos.length === 0) {
            throw new Error('No se encontró el movimiento');
        }

        const movimiento = movimientos[0];
        const fechaEntrada = parseDate(movimiento.fecha_entrada);
        const fechaSalida = getCurrentDate();

        // Calcular tiempo total en minutos
        const tiempoOriginal = Math.ceil((fechaSalida - fechaEntrada) / (1000 * 60));
        let tiempoACobrar = tiempoOriginal;
        
        let desgloseCobro = [];
        let valorTotal = 0;
        let valorBase = 0;
        let valorIva = 0;
        let valorDescuento = 0;
        let porcentajeIva = 0;

        // Solo calcular valores si es cobro por tiempo
        if (movimiento.tipo_cobro === 'TIEMPO') {
            // Aplicar descuento por compra en plaza si está marcado
            let descuentoPlazaMinutos = 0;
            if (descuentoPlaza === 'on') {
                descuentoPlazaMinutos = 60;
                tiempoACobrar = Math.max(0, tiempoACobrar - descuentoPlazaMinutos);
                valorDescuento = Math.ceil(60 * Number(movimiento.tarifa_minuto));
            }

            // Constantes de tiempo
            const minutosEnDosHoras = 120;
            const minutosEn12Horas = 720;
            const minutosEn24Horas = 1440;

            // Calcular días completos y minutos restantes
            const diasCompletos = Math.floor(tiempoACobrar / minutosEn24Horas);
            const minutosRestantesDespuesDias = tiempoACobrar % minutosEn24Horas;

            // Cobro por días completos
            if (diasCompletos > 0) {
                const valorDias = Number(diasCompletos) * Number(movimiento.tarifa_24_horas);
                desgloseCobro.push({
                    concepto: `${diasCompletos} día${diasCompletos > 1 ? 's' : ''} (24 horas)`,
                    valor: valorDias
                });
                valorTotal += valorDias;
            }

            // Cobro por tiempo restante
            if (minutosRestantesDespuesDias > 0) {
                if (minutosRestantesDespuesDias <= minutosEnDosHoras) {
                    // Cobro por minutos
                    const valorMinutos = Math.ceil(Number(minutosRestantesDespuesDias) * Number(movimiento.tarifa_minuto));
                    desgloseCobro.push({
                        concepto: `${minutosRestantesDespuesDias} minutos`,
                        valor: valorMinutos
                    });
                    valorTotal += valorMinutos;
                } else if (minutosRestantesDespuesDias <= minutosEn12Horas) {
                    // Tarifa plena
                    desgloseCobro.push({
                        concepto: 'Tarifa plena',
                        valor: Number(movimiento.tarifa_plena)
                    });
                    valorTotal += Number(movimiento.tarifa_plena);
                } else {
                    // Tarifa 24 horas adicional
                    desgloseCobro.push({
                        concepto: 'Día adicional (24 horas)',
                        valor: Number(movimiento.tarifa_24_horas)
                    });
                    valorTotal += Number(movimiento.tarifa_24_horas);
                }
            }

            // Si hay descuento por plaza, agregarlo al desglose
            if (descuentoPlaza === 'on') {
                desgloseCobro.push({
                    concepto: 'Descuento por compra en plaza (1 hora)',
                    valor: -valorDescuento
                });
                valorTotal = Math.max(0, valorTotal - valorDescuento);
            }

            // Cálculo del IVA
            porcentajeIva = Number(movimiento.porcentaje_iva) || 0;
            valorBase = Math.round(valorTotal / (1 + (porcentajeIva / 100)));
            valorIva = valorTotal - valorBase;
        }

        // Si requiere factura electrónica y es cobro por tiempo, guardar los datos
        if (requiereFactura === 'on' && movimiento.tipo_cobro === 'TIEMPO') {
            await connection.query(
                `INSERT INTO cli_factura_e (
                    movimiento_id,
                    tipo_movimiento,
                    fecha_movimiento,
                    documento_identidad,
                    nombre_completo,
                    correo_electronico,
                    numero_celular,
                    solicita_factura_electronica,
                    placa,
                    tipo_vehiculo_id,
                    valor_base,
                    valor_iva,
                    porcentaje_iva,
                    valor_total,
                    metodo_pago,
                    usuario_id,
                    estado
                ) VALUES (?, 'TIEMPO', NOW(), ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'efectivo', ?, 1)`,
                [
                    movimientoId,
                    req.body.documentoIdentidad,
                    req.body.nombreCompleto,
                    req.body.correoElectronico,
                    req.body.numeroCelular,
                    movimiento.placa,
                    movimiento.tipo_vehiculo_id,
                    valorBase,
                    valorIva,
                    porcentajeIva,
                    valorTotal,
                    req.session.usuario?.id || null
                ]
            );
        } else if (movimiento.tipo_cobro === 'TIEMPO') {
            // Si no solicita factura pero es cobro por tiempo, también guardar los datos con solicita_factura_electronica = 0
            await connection.query(
                `INSERT INTO cli_factura_e (
                    movimiento_id,
                    tipo_movimiento,
                    fecha_movimiento,
                    documento_identidad,
                    nombre_completo,
                    correo_electronico,
                    numero_celular,
                    solicita_factura_electronica,
                    placa,
                    tipo_vehiculo_id,
                    valor_base,
                    valor_iva,
                    porcentaje_iva,
                    valor_total,
                    metodo_pago,
                    usuario_id,
                    estado
                ) VALUES (?, 'TIEMPO', NOW(), ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'efectivo', ?, 1)`,
                [
                    movimientoId,
                    'No registrado', // Documento por defecto
                    'Cliente general', // Nombre por defecto
                    'no-email@example.com', // Correo por defecto
                    'Sin contacto', // Teléfono por defecto
                    movimiento.placa,
                    movimiento.tipo_vehiculo_id,
                    valorBase,
                    valorIva,
                    porcentajeIva,
                    valorTotal,
                    req.session.usuario?.id || null
                ]
            );
        }

        // Actualizar el movimiento
        await connection.query(
            `UPDATE movimientos 
             SET fecha_salida = NOW(), 
                 valor_base = ?,
                 valor_iva = ?,
                 valor_total = ?,
                 valor_descuento = ?,
                 estado = 0, 
                 usuario_salida_id = ?,
                 observaciones_salida = ?
             WHERE id = ?`,
            [
                valorBase,
                valorIva,
                valorTotal,
                valorDescuento,
                req.session.usuario?.id || null,
                req.body.observaciones_salida || null,
                movimientoId
            ]
        );

        // Preparar datos para el ticket
        const ticketData = {
            placa: movimiento.placa,
            tipoVehiculo: movimiento.tipo_vehiculo,
            fechaEntrada: formatDateES(movimiento.fecha_entrada),
            fechaSalida: formatDateES(fechaSalida),
            tiempoTotal: {
                dias: Math.floor(tiempoACobrar / 1440),
                horas: Math.floor((tiempoACobrar % 1440) / 60),
                minutos: tiempoACobrar % 60
            },
            tiempoOriginal: {
                dias: Math.floor(tiempoOriginal / 1440),
                horas: Math.floor((tiempoOriginal % 1440) / 60),
                minutos: tiempoOriginal % 60
            },
            tipo: movimiento.tipo_cobro,
            desgloseCobro,
            valorBase,
            valorIva,
            valorTotal,
            porcentajeIva,
            descuentoPlaza: descuentoPlaza === 'on' ? true : false,
            valorDescuento,
            error: null,
            success: true,
            session: req.session,
            numeroTicket: `S-${String(movimientoId).padStart(6, '0')}`,
            observacionesEntrada: movimiento.observaciones_entrada,
            observacionesSalida: req.body.observaciones_salida,
            requiereFactura: requiereFactura === 'on' ? true : false,
            vencimiento: movimiento.fecha_vencimiento ? 
                formatDateES(movimiento.fecha_vencimiento) : 
                null
        };

        res.render('parqueadero/ticket-salida', ticketData);
    } catch (error) {
        console.error('Error al procesar salida:', error);
        res.render('parqueadero/salida', {
            error: error.message,
            success: false
        });
    }
};

module.exports = {
    mostrarFormularioSalida,
    verificarVehiculoSalida,
    procesarSalida
}; 