const { connection } = require('../database/connection');

const mensualidadesController = {
    // Obtener todas las mensualidades
    obtenerMensualidades: async (req, res) => {
        try {
            const filtroPlaca = req.query.placa ? req.query.placa.trim() : '';
            let whereClause = '';
            let params = [];

            if (filtroPlaca) {
                whereClause = 'AND m.placa LIKE ?';
                params.push(`%${filtroPlaca}%`);
            }

            const [mensualidades] = await connection.query(`
                WITH UltimoPago AS (
                    SELECT 
                        m.placa,
                        MAX(pm.fecha_pago) as ultima_fecha_pago,
                        MAX(m.vigente_hasta) as ultima_vigencia
                    FROM mensualidades m
                    LEFT JOIN pagos_mensualidades pm ON m.id = pm.mensualidad_id
                    WHERE m.estado = 1
                    GROUP BY m.placa
                )
                SELECT 
                    m.id,
                    m.placa,
                    m.documento_identidad,
                    m.nombre_dueno,
                    m.celular,
                    m.email,
                    tv.nombre as tipo_vehiculo,
                    pm.fecha_pago,
                    m.vigente_desde,
                    m.vigente_hasta,
                    pm.valor_total,
                    pm.valor_base,
                    pm.valor_iva,
                    m.estado,
                    u.nombres as usuario_nombre,
                    CASE 
                        WHEN m.vigente_hasta >= CURDATE() THEN 'ACTIVA'
                        ELSE 'VENCIDA'
                    END as estado_vigencia
                FROM mensualidades m 
                JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                JOIN usuarios u ON m.usuario_id = u.id
                JOIN UltimoPago up ON m.placa = up.placa 
                    AND m.vigente_hasta = up.ultima_vigencia
                LEFT JOIN pagos_mensualidades pm ON m.id = pm.mensualidad_id 
                    AND pm.fecha_pago = up.ultima_fecha_pago
                WHERE m.estado = 1
                ${whereClause}
                ORDER BY pm.fecha_pago DESC, m.vigente_hasta DESC
            `, params);

            res.render('mensualidades/lista', { 
                mensualidades,
                filtroPlaca
            });
        } catch (error) {
            console.error('Error al obtener mensualidades:', error);
            res.status(500).send('Error al obtener mensualidades');
        }
    },

    // Mostrar formulario de creación o redirigir a renovación si existe
    mostrarFormularioCreacion: async (req, res) => {
        try {
            // Si viene una placa en la URL, verificar si existe
            const placa = req.query.placa;
            if (placa) {
                // Verificar si el vehículo está exento
                const [vehiculoExento] = await connection.query(`
                    SELECT * FROM vehiculos_exentos 
                    WHERE placa = ? 
                    AND estado = 1 
                    AND fecha_inicio <= CURDATE() 
                    AND fecha_fin >= CURDATE()
                `, [placa]);

                if (vehiculoExento.length > 0) {
                    return res.status(400).send('Este vehículo está exento de pago hasta ' + 
                        new Date(vehiculoExento[0].fecha_fin).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }));
                }

                // Buscar la mensualidad más reciente para esta placa
                const [mensualidadExistente] = await connection.query(`
                    SELECT m.* 
                    FROM mensualidades m
                    WHERE m.placa = ?
                    ORDER BY m.vigente_hasta DESC
                    LIMIT 1
                `, [placa]);

                if (mensualidadExistente.length > 0) {
                    // Si existe, redirigir a la página de renovación
                    return res.redirect(`/mensualidades/renovar/${mensualidadExistente[0].id}`);
                }
            }

            // Si no hay placa o no existe mensualidad, mostrar formulario de creación
            const [tiposVehiculos] = await connection.query('SELECT * FROM tipos_vehiculos WHERE estado = 1');
            res.render('mensualidades/crear', { 
                tiposVehiculos,
                placa: placa || '' // Pasar la placa al formulario si existe
            });
        } catch (error) {
            console.error('Error al cargar formulario:', error);
            res.status(500).send('Error al cargar formulario');
        }
    },

    // Crear nueva mensualidad
    crearMensualidad: async (req, res) => {
        const conn = await connection.getConnection();
        try {
            const {
                placa,
                documento_identidad,
                nombre_dueno,
                celular,
                email,
                tipo_vehiculo_id,
                cantidad_meses,
                porcentaje_descuento,
                metodo_pago,
                referencia_pago,
                valor_base,
                valor_iva,
                valor_total,
                descuento,
                porcentaje_iva,
                solicita_factura_electronica
            } = req.body;

            // Iniciar transacción
            await conn.beginTransaction();

            // Verificar si el vehículo está exento
            const [vehiculoExento] = await conn.query(`
                SELECT * FROM vehiculos_exentos 
                WHERE placa = ? 
                AND estado = 1 
                AND fecha_inicio <= CURDATE() 
                AND fecha_fin >= CURDATE()
            `, [placa]);

            if (vehiculoExento.length > 0) {
                throw new Error('Este vehículo está exento de pago hasta ' + 
                    new Date(vehiculoExento[0].fecha_fin).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }));
            }

            // Si no se proporciona porcentaje_iva, obtenerlo de la tabla tipos_vehiculos
            let porcentajeIvaFinal = porcentaje_iva;
            if (!porcentajeIvaFinal) {
                const [tipoVehiculo] = await conn.query(
                    'SELECT porcentaje_iva FROM tipos_vehiculos WHERE id = ?',
                    [tipo_vehiculo_id]
                );
                if (tipoVehiculo.length > 0) {
                    porcentajeIvaFinal = tipoVehiculo[0].porcentaje_iva;
                } else {
                    throw new Error('No se pudo obtener el porcentaje de IVA para el tipo de vehículo seleccionado');
                }
            }

            const fecha_pago = new Date();
            const vigente_desde = fecha_pago;
            const vigente_hasta = new Date(fecha_pago);
            vigente_hasta.setMonth(vigente_hasta.getMonth() + parseInt(cantidad_meses));

            // Generar referencia para pagos en efectivo
            let referenciaFinal = referencia_pago;
            if (metodo_pago === 'efectivo') {
                const [ultimoRecibo] = await conn.query(
                    `SELECT MAX(CAST(SUBSTRING(referencia_pago, 2) AS UNSIGNED)) as ultimo_numero 
                     FROM pagos_mensualidades 
                     WHERE metodo_pago = 'efectivo' 
                     AND referencia_pago LIKE 'R%'`
                );
                const ultimoNumero = ultimoRecibo[0].ultimo_numero || 0;
                referenciaFinal = `R${String(ultimoNumero + 1).padStart(6, '0')}`;
            }

            // 1. Insertar en mensualidades
            const [resultadoMensualidad] = await conn.query(
                `INSERT INTO mensualidades (
                    placa, documento_identidad, nombre_dueno, celular, email, 
                    vigente_desde, vigente_hasta, tipo_vehiculo_id, 
                    usuario_id, estado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    placa, documento_identidad, nombre_dueno, celular, email,
                    vigente_desde, vigente_hasta, tipo_vehiculo_id,
                    req.session.usuario.id
                ]
            );

            // 2. Insertar en pagos_mensualidades
            const [resultadoPago] = await conn.query(
                `INSERT INTO pagos_mensualidades (
                    mensualidad_id, fecha_pago, vigente_desde, vigente_hasta,
                    cantidad_meses, valor_base, valor_iva, valor_total,
                    descuento, porcentaje_descuento, porcentaje_iva,
                    metodo_pago, referencia_pago, usuario_id, estado
                ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    resultadoMensualidad.insertId, vigente_desde, vigente_hasta,
                    cantidad_meses, valor_base, valor_iva, valor_total,
                    descuento, porcentaje_descuento, porcentajeIvaFinal,
                    metodo_pago, referenciaFinal, req.session.usuario.id
                ]
            );

            // 3. Insertar en cli_factura_e
            await conn.query(`
                INSERT INTO cli_factura_e (
                    pago_mensualidad_id, 
                    tipo_movimiento, 
                    fecha_movimiento,
                    documento_identidad,
                    nombre_completo,
                    correo_electronico,
                    numero_celular,
                    placa,
                    tipo_vehiculo_id,
                    valor_base, 
                    valor_iva, 
                    valor_total, 
                    descuento,
                    porcentaje_descuento,
                    porcentaje_iva,
                    metodo_pago,
                    referencia_pago,
                    solicita_factura_electronica,
                    usuario_id, 
                    estado
                ) VALUES (?, 'MENSUALIDAD', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `, [
                resultadoPago.insertId,
                documento_identidad,
                nombre_dueno,
                email,
                celular,
                placa,
                tipo_vehiculo_id,
                valor_base,
                valor_iva,
                valor_total,
                descuento,
                porcentaje_descuento,
                porcentajeIvaFinal,
                metodo_pago,
                referenciaFinal,
                solicita_factura_electronica || 0,
                req.session.usuario.id
            ]);

            // Confirmar transacción
            await conn.commit();

            // Enviar respuesta JSON
            res.json({
                success: true,
                message: 'Mensualidad creada correctamente',
                pagoId: resultadoPago.insertId
            });
        } catch (error) {
            await conn.rollback();
            console.error('Error al crear mensualidad:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        } finally {
            conn.release();
        }
    },

    // Mostrar detalles de la mensualidad
    mostrarDetallesMensualidad: async (req, res) => {
        try {
            const { id } = req.params;

            // Obtener los detalles de la mensualidad actual con su último pago
            const [mensualidades] = await connection.query(`
                SELECT 
                    m.*,
                    tv.nombre as tipo_vehiculo,
                    tv.tarifa_mensual,
                    tv.porcentaje_iva,
                    u.nombres as usuario_nombre,
                    CASE 
                        WHEN m.vigente_hasta >= CURDATE() THEN 'ACTIVA'
                        ELSE 'VENCIDA'
                    END as estado_vigencia
                FROM mensualidades m 
                JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                JOIN usuarios u ON m.usuario_id = u.id
                WHERE m.id = ?
            `, [id]);

            if (mensualidades.length === 0) {
                return res.status(404).send('Mensualidad no encontrada');
            }

            // Obtener el historial completo de pagos para esta mensualidad
            const [historialPagos] = await connection.query(`
                SELECT 
                    p.*,
                    u.nombres as usuario_registro,
                    CASE 
                        WHEN p.estado = 1 THEN 'Activo'
                        ELSE 'Anulado'
                    END as estado_texto
                FROM pagos_mensualidades p
                JOIN usuarios u ON p.usuario_id = u.id
                WHERE p.mensualidad_id = ?
                ORDER BY p.fecha_pago DESC
            `, [id]);

            // Formatear fechas y valores para el historial
            const formatearNumero = (numero) => {
                return numero ? numero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
            };

            const formatearFecha = (fecha) => {
                return fecha ? new Date(fecha).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }) : '';
            };

            const historialFormateado = historialPagos.map(pago => ({
                ...pago,
                fecha_pago: formatearFecha(pago.fecha_pago),
                vigente_desde: formatearFecha(pago.vigente_desde),
                vigente_hasta: formatearFecha(pago.vigente_hasta),
                valor_base: formatearNumero(pago.valor_base),
                valor_iva: formatearNumero(pago.valor_iva),
                valor_total: formatearNumero(pago.valor_total),
                descuento: formatearNumero(pago.descuento),
                estado: pago.estado_texto
            }));

            // Formatear los datos de la mensualidad
            const mensualidadFormateada = {
                ...mensualidades[0],
                vigente_desde: formatearFecha(mensualidades[0].vigente_desde),
                vigente_hasta: formatearFecha(mensualidades[0].vigente_hasta),
                tarifa_mensual: formatearNumero(mensualidades[0].tarifa_mensual)
            };

            console.log('Datos de mensualidad:', {
                id: mensualidadFormateada.id,
                placa: mensualidadFormateada.placa,
                estado: mensualidadFormateada.estado,
                vigencia: mensualidadFormateada.estado_vigencia
            });

            res.render('mensualidades/ver', { 
                mensualidad: mensualidadFormateada,
                historialPagos: historialFormateado
            });
        } catch (error) {
            console.error('Error al obtener mensualidad:', error);
            res.status(500).send('Error al obtener mensualidad: ' + error.message);
        }
    },

    // Renovar mensualidad
    renovarMensualidad: async (req, res) => {
        try {
            const { id } = req.params;
            
            // Obtener la mensualidad actual
            const [mensualidad] = await connection.query(
                'SELECT * FROM mensualidades WHERE id = ?',
                [id]
            );

            if (!mensualidad.length) {
                return res.status(404).send('Mensualidad no encontrada');
            }

            // Verificar si el vehículo está exento
            const [vehiculoExento] = await connection.query(`
                SELECT * FROM vehiculos_exentos 
                WHERE placa = ? 
                AND estado = 1 
                AND fecha_inicio <= CURDATE() 
                AND fecha_fin >= CURDATE()
            `, [mensualidad[0].placa]);

            if (vehiculoExento.length > 0) {
                return res.status(400).send('Este vehículo está exento de pago hasta ' + 
                    new Date(vehiculoExento[0].fecha_fin).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }));
            }

            // Obtener la tarifa actual del tipo de vehículo
            const [tipoVehiculo] = await connection.query(
                'SELECT tarifa_mensual, porcentaje_iva FROM tipos_vehiculos WHERE id = ?',
                [mensualidad[0].tipo_vehiculo_id]
            );

            const fecha_pago = new Date();
            const vigente_desde = new Date(mensualidad[0].vigente_hasta);
            const vigente_hasta = new Date(vigente_desde);
            vigente_hasta.setDate(vigente_hasta.getDate() + 30);

            const valor_total = tipoVehiculo[0].tarifa_mensual;
            // Calcular el IVA incluido en el valor total
            const valor_iva = (valor_total * tipoVehiculo[0].porcentaje_iva) / (100 + tipoVehiculo[0].porcentaje_iva);

            // Crear nueva mensualidad basada en la anterior
            await connection.query(
                `INSERT INTO mensualidades (
                    placa, nombre_dueno, celular, email, fecha_pago,
                    vigente_desde, vigente_hasta, tipo_vehiculo_id,
                    valor_total, valor_iva, usuario_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mensualidad[0].placa,
                    mensualidad[0].nombre_dueno,
                    mensualidad[0].celular,
                    mensualidad[0].email,
                    fecha_pago,
                    vigente_desde,
                    vigente_hasta,
                    mensualidad[0].tipo_vehiculo_id,
                    valor_total,
                    valor_iva,
                    req.session.usuario.id
                ]
            );

            res.redirect('/mensualidades');
        } catch (error) {
            console.error('Error al renovar mensualidad:', error);
            res.status(500).send('Error al renovar mensualidad');
        }
    },

    // Verificar si una mensualidad puede ser renovada
    verificarRenovacion: async (req, res) => {
        try {
            const { id } = req.params;
            const [mensualidad] = await connection.query(`
                SELECT 
                    m.*,
                    tv.nombre as tipo_vehiculo,
                    tv.tarifa_mensual,
                    tv.porcentaje_iva,
                    DATE_FORMAT(m.vigente_hasta, '%Y-%m-%d') as vigente_hasta_formato,
                    CASE 
                        WHEN m.vigente_hasta >= CURDATE() THEN 'ACTIVA'
                        ELSE 'VENCIDA'
                    END as estado_vigencia,
                    DATEDIFF(m.vigente_hasta, CURDATE()) as dias_restantes
                FROM mensualidades m 
                JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                WHERE m.id = ?
            `, [id]);

            if (mensualidad.length === 0) {
                return res.status(404).send('Mensualidad no encontrada');
            }

            // Verificar si el vehículo está exento
            const [vehiculoExento] = await connection.query(`
                SELECT * FROM vehiculos_exentos 
                WHERE placa = ? 
                AND estado = 1 
                AND fecha_inicio <= CURDATE() 
                AND fecha_fin >= CURDATE()
            `, [mensualidad[0].placa]);

            if (vehiculoExento.length > 0) {
                return res.status(400).send('Este vehículo está exento de pago hasta ' + 
                    new Date(vehiculoExento[0].fecha_fin).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
                    }));
            }

            // Calcular próxima fecha de vencimiento
            const fechaVigenciaActual = new Date(mensualidad[0].vigente_hasta);
            const proximoVencimiento = new Date(fechaVigenciaActual);
            proximoVencimiento.setMonth(proximoVencimiento.getMonth() + 1);

            // Formatear fechas para mostrar
            const proximoVencimientoFormateado = proximoVencimiento.toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Usar el formato de fecha ISO para la vista
            mensualidad[0].vigente_hasta = mensualidad[0].vigente_hasta_formato;

            res.render('mensualidades/renovar', {
                mensualidad: mensualidad[0],
                diasParaVencer: mensualidad[0].dias_restantes,
                proximoVencimiento: proximoVencimientoFormateado
            });
        } catch (error) {
            console.error('Error al verificar renovación:', error);
            res.status(500).send('Error al verificar renovación');
        }
    },

    // Previsualizar ticket antes de confirmar
    previsualizarTicket: async (req, res) => {
        try {
            const { id } = req.params;
            const { 
                metodo_pago, 
                referencia_pago, 
                cantidad_meses, 
                es_nueva, 
                porcentaje_descuento = 0,
                documento_identidad = '' // Agregamos pero solo lo usaremos para mostrar en el ticket
            } = req.body;
            const cantidadMeses = parseInt(cantidad_meses) || 1;

            let mensualidad;
            let vigente_desde, vigente_hasta;

            if (es_nueva) {
                // Para nueva mensualidad, crear objeto temporal con los datos del formulario
                const [tipoVehiculo] = await connection.query(
                    'SELECT * FROM tipos_vehiculos WHERE id = ?',
                    [req.body.tipo_vehiculo_id]
                );

                if (!tipoVehiculo.length) {
                    throw new Error('Tipo de vehículo no encontrado');
                }

                vigente_desde = new Date();
                vigente_hasta = new Date(vigente_desde);
                vigente_hasta.setMonth(vigente_hasta.getMonth() + cantidadMeses);

                mensualidad = [{
                    placa: req.body.placa,
                    nombre_dueno: req.body.nombre_dueno,
                    celular: req.body.celular,
                    email: req.body.email,
                    tipo_vehiculo_id: req.body.tipo_vehiculo_id,
                    tipo_vehiculo: tipoVehiculo[0].nombre,
                    tarifa_mensual: tipoVehiculo[0].tarifa_mensual,
                    porcentaje_iva: tipoVehiculo[0].porcentaje_iva,
                    vigente_desde: vigente_desde,
                    vigente_hasta: vigente_hasta,
                    es_nueva: true,
                    documento_identidad: documento_identidad // Solo para mostrar en el ticket
                }];
            } else {
                // Para renovación, obtener mensualidad existente
                [mensualidad] = await connection.query(`
                    SELECT m.*, tv.nombre as tipo_vehiculo, tv.tarifa_mensual, tv.porcentaje_iva
                    FROM mensualidades m 
                    JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                    WHERE m.id = ?
                `, [id]);

                if (!mensualidad.length) {
                    throw new Error('Mensualidad no encontrada');
                }

                // Calcular fechas de vigencia para renovación
                const fechaActual = new Date();
                const fechaVencimientoActual = new Date(mensualidad[0].vigente_hasta);

                // Si la mensualidad actual aún no ha vencido, la nueva vigencia comienza desde el vencimiento
                vigente_desde = fechaVencimientoActual > fechaActual ? 
                    new Date(fechaVencimientoActual) : new Date(fechaActual);

                vigente_hasta = new Date(vigente_desde);
                vigente_hasta.setMonth(vigente_hasta.getMonth() + cantidadMeses);

                // Verificar si hay traslapes con otras mensualidades
                const [mensualidadesSolapadas] = await connection.query(`
                    SELECT * FROM mensualidades 
                    WHERE placa = ? 
                    AND estado = 1
                    AND id != ?
                    AND (
                        (vigente_desde <= ? AND vigente_hasta >= ?) OR
                        (vigente_desde <= ? AND vigente_hasta >= ?) OR
                        (vigente_desde >= ? AND vigente_hasta <= ?)
                    )
                `, [
                    mensualidad[0].placa,
                    id,
                    vigente_desde, vigente_desde,
                    vigente_hasta, vigente_hasta,
                    vigente_desde, vigente_hasta
                ]);

                if (mensualidadesSolapadas.length > 0) {
                    throw new Error('Ya existe una mensualidad activa para este vehículo en el período seleccionado');
                }
            }

            // Calcular valores
            const valorTotalSinDescuento = mensualidad[0].tarifa_mensual * cantidadMeses; // Valor que ya incluye IVA
            const descuento = (valorTotalSinDescuento * parseFloat(porcentaje_descuento)) / 100;
            const valorTotalConDescuento = valorTotalSinDescuento - descuento;
            
            // Extraer el IVA del valor total con descuento
            const factorIva = 1 + (mensualidad[0].porcentaje_iva / 100);
            const valorBase = Math.round(valorTotalConDescuento / factorIva); // Valor sin IVA
            const valorIva = valorTotalConDescuento - valorBase; // IVA extraído del total

            console.log('Cálculo de valores:', {
                tarifa_mensual: mensualidad[0].tarifa_mensual,
                cantidadMeses,
                valorTotalSinDescuento,
                porcentaje_descuento,
                descuento,
                valorTotalConDescuento,
                factorIva,
                valorBase,
                valorIva
            });

            // Formatear valores con separadores de miles
            const formatearNumero = (numero) => {
                return numero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            };

            // Formatear fechas para mostrar
            const vigente_desde_formato = vigente_desde.toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const vigente_hasta_formato = vigente_hasta.toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Generar número de recibo si es pago en efectivo
            let referenciaFinal = referencia_pago;
            if (metodo_pago === 'efectivo') {
                const [ultimoRecibo] = await connection.query(
                    `SELECT MAX(CAST(SUBSTRING(referencia_pago, 2) AS UNSIGNED)) as ultimo_numero 
                     FROM pagos_mensualidades 
                     WHERE metodo_pago = 'efectivo' 
                     AND referencia_pago LIKE 'R%'`
                );
                
                const ultimoNumero = ultimoRecibo[0].ultimo_numero || 0;
                referenciaFinal = `R${String(ultimoNumero + 1).padStart(6, '0')}`;
            }

            res.render('mensualidades/ticket', {
                previsualizar: true,
                mensualidad: {
                    ...mensualidad[0],
                    porcentaje_descuento: parseFloat(porcentaje_descuento) || 0,
                    descuento: formatearNumero(descuento),
                    valor_base: formatearNumero(valorBase),
                    valor_iva: formatearNumero(valorIva),
                    valor_total: formatearNumero(valorTotalConDescuento),
                    tarifa_mensual: formatearNumero(mensualidad[0].tarifa_mensual)
                },
                metodo_pago,
                referencia_pago: referenciaFinal,
                cantidad_meses: cantidadMeses,
                valorBase: formatearNumero(valorBase),
                valorSinIva: formatearNumero(valorBase),
                valorIva: formatearNumero(valorIva),
                valorTotal: formatearNumero(valorTotalConDescuento),
                valorTotalSinDescuento: formatearNumero(valorTotalSinDescuento),
                vigente_desde: vigente_desde_formato,
                vigente_hasta: vigente_hasta_formato,
                fechaActual: new Date().toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                usuario: req.session.usuario,
                es_nueva: es_nueva === '1'
            });
        } catch (error) {
            console.error('Error al previsualizar ticket:', error);
            res.status(500).json({
                error: 'Error al previsualizar ticket',
                details: error.message
            });
        }
    },

    // Ver ticket de un pago existente
    verTicket: async (req, res) => {
        try {
            const { id } = req.params;

            // Obtener los datos del pago y la mensualidad
            const [pago] = await connection.query(`
                SELECT 
                    pm.*,
                    m.*,
                    tv.nombre as tipo_vehiculo,
                    tv.porcentaje_iva,
                    u.nombres as usuario_nombre
                FROM pagos_mensualidades pm
                JOIN mensualidades m ON pm.mensualidad_id = m.id
                JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                JOIN usuarios u ON pm.usuario_id = u.id
                WHERE pm.id = ?
            `, [id]);

            if (pago.length === 0) {
                return res.status(404).send('Ticket no encontrado');
            }

            // Formatear valores con separadores de miles
            const formatearNumero = (numero) => {
                return numero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            };

            // Formatear fechas
            const formatearFecha = (fecha) => {
                return new Date(fecha).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            };

            res.render('mensualidades/ticket', {
                previsualizar: false,
                mensualidad: {
                    ...pago[0],
                    valor_base: formatearNumero(pago[0].valor_base),
                    valor_iva: formatearNumero(pago[0].valor_iva),
                    valor_total: formatearNumero(pago[0].valor_total),
                    descuento: formatearNumero(pago[0].descuento || 0),
                    porcentaje_descuento: pago[0].porcentaje_descuento || 0
                },
                metodo_pago: pago[0].metodo_pago,
                referencia_pago: pago[0].referencia_pago,
                cantidad_meses: pago[0].cantidad_meses,
                vigente_desde: formatearFecha(pago[0].vigente_desde),
                vigente_hasta: formatearFecha(pago[0].vigente_hasta),
                fechaActual: formatearFecha(pago[0].fecha_pago),
                usuario: {
                    nombre: pago[0].usuario_nombre
                }
            });
        } catch (error) {
            console.error('Error al ver ticket:', error);
            res.status(500).json({
                error: 'Error al ver ticket',
                details: error.message
            });
        }
    },

    // Procesar el pago y renovar una mensualidad
    procesarPagoYRenovar: async (req, res) => {
        const conn = await connection.getConnection();
        try {
            await conn.beginTransaction();

            const { 
                id,
                cantidad_meses, 
                porcentaje_descuento,
                metodo_pago,
                referencia_pago,
                valor_base,
                valor_iva,
                valor_total,
                descuento,
                solicita_factura_electronica
            } = req.body;

            // Validar datos requeridos
            if (!id || !cantidad_meses || !metodo_pago) {
                throw new Error('Faltan datos requeridos para procesar el pago');
            }

            // Validar que exista la sesión del usuario
            if (!req.session || !req.session.usuario || !req.session.usuario.id) {
                throw new Error('No hay una sesión de usuario válida');
            }

            // Obtener datos de la mensualidad actual
                const [mensualidad] = await conn.query(`
                    SELECT m.*, tv.tarifa_mensual, tv.porcentaje_iva
                    FROM mensualidades m 
                    JOIN tipos_vehiculos tv ON m.tipo_vehiculo_id = tv.id
                    WHERE m.id = ?
                `, [id]);

            if (mensualidad.length === 0) {
                    throw new Error('Mensualidad no encontrada');
                }

            // Validar método de pago y referencia
            if ((metodo_pago === 'transferencia' || metodo_pago === 'tarjeta') && !referencia_pago) {
                throw new Error('Se requiere referencia de pago para pagos con tarjeta o transferencia');
            }

            // Generar referencia de pago para pagos en efectivo
            let referenciaPago = referencia_pago;
            if (metodo_pago === 'efectivo') {
                referenciaPago = `EF-${Date.now()}`;
            }

            // Calcular nueva fecha de vencimiento
                const fechaActual = new Date();
                const fechaVencimientoActual = new Date(mensualidad[0].vigente_hasta);
            const vigente_desde = fechaVencimientoActual > fechaActual ? 
                    new Date(fechaVencimientoActual) : new Date(fechaActual);
            const vigente_hasta = new Date(vigente_desde);
            vigente_hasta.setMonth(vigente_hasta.getMonth() + parseInt(cantidad_meses));

            // Registrar el pago
            const [resultPago] = await conn.query(`
                INSERT INTO pagos_mensualidades (
                    mensualidad_id, valor_base, valor_iva, valor_total, 
                    descuento, metodo_pago, referencia_pago, fecha_pago,
                    cantidad_meses, porcentaje_descuento, porcentaje_iva, usuario_id,
                    vigente_desde, vigente_hasta
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
            `, [
                id, valor_base, valor_iva, valor_total, 
                descuento, metodo_pago, referenciaPago,
                cantidad_meses, porcentaje_descuento, mensualidad[0].porcentaje_iva,
                req.session.usuario.id,
                vigente_desde,
                vigente_hasta
            ]);

            // Actualizar fecha de vencimiento de la mensualidad
            await conn.query(`
                UPDATE mensualidades 
                SET vigente_hasta = ?, 
                    estado = 1
                WHERE id = ?
            `, [vigente_hasta, id]);

            // Generar factura electrónica
            await conn.query(`
                INSERT INTO cli_factura_e (
                    pago_mensualidad_id, 
                    tipo_movimiento, 
                    fecha_movimiento,
                    documento_identidad,
                    nombre_completo,
                    correo_electronico,
                    numero_celular,
                    placa,
                    tipo_vehiculo_id,
                    valor_base, 
                    valor_iva, 
                    valor_total, 
                    descuento,
                    porcentaje_descuento,
                    porcentaje_iva,
                    metodo_pago,
                    referencia_pago,
                    solicita_factura_electronica,
                    usuario_id, 
                    estado
                ) VALUES (?, 'MENSUALIDAD', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `, [
                resultPago.insertId,
                mensualidad[0].documento_identidad,
                mensualidad[0].nombre_dueno,
                mensualidad[0].email,
                mensualidad[0].celular,
                mensualidad[0].placa,
                mensualidad[0].tipo_vehiculo_id,
                valor_base,
                valor_iva,
                valor_total,
                descuento,
                porcentaje_descuento,
                mensualidad[0].porcentaje_iva,
                metodo_pago,
                referenciaPago,
                solicita_factura_electronica || 0,
                req.session.usuario.id
            ]);

            await conn.commit();

            res.json({
                success: true,
                pagoId: resultPago.insertId,
                message: 'Pago procesado correctamente'
            });

        } catch (error) {
            await conn.rollback();
            console.error('Error al procesar pago y renovar:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al procesar el pago y renovar la mensualidad'
            });
        } finally {
            if (conn) {
            conn.release();
            }
        }
    },

    // Procesar pago de mensualidad
    procesarPago: async (req, res) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            console.log('Datos recibidos:', req.body);
            const {
                placa,
                documento_identidad,
                nombre_dueno,
                celular,
                email,
                tipo_vehiculo,
                cantidad_meses,
                porcentaje_descuento,
                metodo_pago,
                referencia_pago
            } = req.body;

            let idMensualidad = req.params.id;
            let mensualidadBase;

            // Obtener información del tipo de vehículo
            const [tipoVehiculo] = await connection.query(
                'SELECT tarifa_mensual, porcentaje_iva FROM tipos_vehiculos WHERE id = ?',
                [tipo_vehiculo]
            );

            // Calcular valores
            const valorTotalSinDescuento = tipoVehiculo[0].tarifa_mensual * cantidad_meses;
            const descuento = (valorTotalSinDescuento * parseFloat(porcentaje_descuento || 0)) / 100;
            const valorTotalConDescuento = valorTotalSinDescuento - descuento;
            const factorIva = 1 + (tipoVehiculo[0].porcentaje_iva / 100);
            const valorBase = Math.round(valorTotalConDescuento / factorIva);
            const valorIva = valorTotalConDescuento - valorBase;

            console.log('Valores calculados:', {
                valorTotalSinDescuento,
                descuento,
                valorTotalConDescuento,
                factorIva,
                valorBase,
                valorIva
            });

            if (!idMensualidad) {
                // Crear nueva mensualidad
                const [result] = await connection.query(
                    `INSERT INTO mensualidades 
                    (placa, documento_identidad, nombre_dueno, celular, email, tipo_vehiculo, fecha_inicio, fecha_fin, estado) 
                    VALUES (?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? MONTH), 'ACTIVO')`,
                    [placa, documento_identidad, nombre_dueno, celular, email, tipo_vehiculo, cantidad_meses]
                );
                idMensualidad = result.insertId;
            } else {
                // Renovar mensualidad existente
                const [mensualidad] = await connection.query(
                    'SELECT fecha_fin FROM mensualidades WHERE id = ?',
                    [idMensualidad]
                );
                
                await connection.query(
                    `UPDATE mensualidades 
                    SET fecha_fin = DATE_ADD(fecha_fin, INTERVAL ? MONTH),
                        estado = 'ACTIVO'
                    WHERE id = ?`,
                    [cantidad_meses, idMensualidad]
                );
            }

            // Generar referencia para pagos en efectivo
            let referenciaFinal = referencia_pago;
            if (metodo_pago === 'Efectivo') {
                const [ultimaReferencia] = await connection.query(
                    'SELECT MAX(CAST(SUBSTRING(referencia_pago, 2) AS UNSIGNED)) as ultimo FROM pagos_mensualidades WHERE metodo_pago = "Efectivo"'
                );
                const numeroReferencia = (ultimaReferencia[0].ultimo || 0) + 1;
                referenciaFinal = `R${String(numeroReferencia).padStart(6, '0')}`;
            }

            // Insertar pago
            const [resultPago] = await connection.query(
                `INSERT INTO pagos_mensualidades 
                (mensualidad_id, valor_base, valor_iva, valor_total, metodo_pago, referencia_pago) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [idMensualidad, valorBase, valorIva, valorTotalConDescuento, metodo_pago, referenciaFinal]
            );

            // Insertar factura electrónica
            await connection.query(
                `INSERT INTO cli_factura_e 
                (mensualidad_id, pago_id, valor_base, valor_iva, valor_total, fecha_emision) 
                VALUES (?, ?, ?, ?, ?, CURDATE())`,
                [idMensualidad, resultPago.insertId, valorBase, valorIva, valorTotalConDescuento]
            );

            await connection.commit();
            res.json({ 
                success: true, 
                message: 'Pago procesado correctamente',
                mensualidadId: idMensualidad,
                referencia: referenciaFinal
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error al procesar el pago:', error);
            res.status(500).json({
                success: false, 
                message: 'Error al procesar el pago', 
                error: error.message 
            });
        } finally {
            connection.release();
        }
    }
};

module.exports = mensualidadesController; 