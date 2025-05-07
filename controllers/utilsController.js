const { connection } = require('../database/connection');
const { format } = require('date-fns');
const { es } = require('date-fns/locale');
const { executeQuery } = require('../database/connection');
const { getCurrentDate, formatDate } = require('../utils/dateUtils');

// Obtener estadísticas del parqueadero
const obtenerEstadisticas = async (req, res) => {
    try {
        // Parámetros de filtro para API
        const fechaInicio = req.query.fechaInicio || formatDate(getCurrentDate(), 'yyyy-MM-dd');
        const fechaFin = req.query.fechaFin || formatDate(getCurrentDate(), 'yyyy-MM-dd');
        const horaInicio = req.query.horaInicio || '00:00';
        const horaFin = req.query.horaFin || '23:59';
        
        // Construir los rangos de fecha y hora
        const fechaHoraInicio = `${fechaInicio} ${horaInicio}:00`;
        const fechaHoraFin = `${fechaFin} ${horaFin}:59`;

        // 1. Obtener vehículos actualmente en el parqueadero
        const [vehiculosActivos] = await connection.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM mensualidades m 
                        WHERE m.placa = mov.placa 
                        AND m.vigente_hasta >= CURDATE() 
                        AND m.estado = 1
                    ) THEN 1 ELSE 0 END
                ) as mensual,
                SUM(CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM vehiculos_exentos ve 
                        WHERE ve.placa = mov.placa 
                        AND ve.fecha_fin >= CURDATE() 
                        AND ve.estado = 1
                    ) THEN 1 ELSE 0 END
                ) as exento,
                SUM(CASE 
                    WHEN NOT EXISTS (
                        SELECT 1 FROM mensualidades m 
                        WHERE m.placa = mov.placa 
                        AND m.vigente_hasta >= CURDATE() 
                        AND m.estado = 1
                    ) 
                    AND NOT EXISTS (
                        SELECT 1 FROM vehiculos_exentos ve 
                        WHERE ve.placa = mov.placa 
                        AND ve.fecha_fin >= CURDATE() 
                        AND ve.estado = 1
                    ) THEN 1 ELSE 0 END
                ) as tiempo
            FROM movimientos mov 
            WHERE mov.estado = 1
        `);

        // 2. Obtener vehículos por tipo en patio
        const [vehiculosPorTipo] = await connection.query(`
            SELECT 
                tv.nombre,
                COUNT(*) as cantidad
            FROM movimientos mov
            JOIN tipos_vehiculos tv ON mov.tipo_vehiculo_id = tv.id
            WHERE mov.estado = 1
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `);

        // 3. Obtener movimientos del período
        const [movimientosDia] = await connection.query(`
            SELECT 
                COUNT(CASE WHEN fecha_entrada BETWEEN ? AND ? THEN 1 END) as entradas_total,
                COUNT(CASE 
                    WHEN fecha_entrada BETWEEN ? AND ?
                    AND NOT EXISTS (
                        SELECT 1 FROM mensualidades m 
                        WHERE m.placa = mov.placa 
                        AND m.vigente_hasta >= fecha_entrada
                        AND m.estado = 1
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM vehiculos_exentos ve 
                        WHERE ve.placa = mov.placa 
                        AND ve.fecha_fin >= fecha_entrada
                        AND ve.estado = 1
                    )
                THEN 1 END) as entradas_tiempo,
                COUNT(CASE 
                    WHEN fecha_entrada BETWEEN ? AND ?
                    AND EXISTS (
                        SELECT 1 FROM mensualidades m 
                        WHERE m.placa = mov.placa 
                        AND m.vigente_hasta >= fecha_entrada
                        AND m.estado = 1
                    )
                THEN 1 END) as entradas_mensual,
                COUNT(CASE 
                    WHEN fecha_entrada BETWEEN ? AND ?
                    AND EXISTS (
                        SELECT 1 FROM vehiculos_exentos ve 
                        WHERE ve.placa = mov.placa 
                        AND ve.fecha_fin >= fecha_entrada
                        AND ve.estado = 1
                    )
                THEN 1 END) as entradas_exento,
                COUNT(CASE WHEN fecha_salida BETWEEN ? AND ? THEN 1 END) as salidas,
                COALESCE(SUM(CASE 
                    WHEN fecha_salida BETWEEN ? AND ? 
                    THEN valor_total 
                    ELSE 0 
                END), 0) as ingresos
            FROM movimientos mov
        `, [
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin
        ]);

        // 4. Obtener movimientos por tipo
        const [movimientosPorTipo] = await connection.query(`
            SELECT 
                tv.nombre,
                COUNT(CASE WHEN mov.fecha_entrada BETWEEN ? AND ? THEN 1 END) as total_entradas,
                COUNT(CASE WHEN mov.fecha_salida BETWEEN ? AND ? THEN 1 END) as total_salidas,
                COALESCE(SUM(CASE 
                    WHEN mov.fecha_salida BETWEEN ? AND ? 
                    THEN mov.valor_total 
                    ELSE 0 
                END), 0) as total_ingresos
            FROM movimientos mov
            JOIN tipos_vehiculos tv ON mov.tipo_vehiculo_id = tv.id
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `, [
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin,
            fechaHoraInicio, fechaHoraFin
        ]);

        // Preparar respuesta API
        const respuesta = {
            activos: {
                total: vehiculosActivos[0].total || 0,
                tiempo: vehiculosActivos[0].tiempo || 0,
                mensual: vehiculosActivos[0].mensual || 0,
                exento: vehiculosActivos[0].exento || 0
            },
            vehiculosPorTipo: vehiculosPorTipo,
            movimientos: {
                entradas: {
                    total: movimientosDia[0].entradas_total || 0,
                    tiempo: movimientosDia[0].entradas_tiempo || 0,
                    mensual: movimientosDia[0].entradas_mensual || 0,
                    exento: movimientosDia[0].entradas_exento || 0
                },
                salidas: movimientosDia[0].salidas || 0,
                ingresos: movimientosDia[0].ingresos || 0
            },
            movimientosPorTipo: movimientosPorTipo,
            filtros: {
                fechaInicio,
                fechaFin,
                horaInicio,
                horaFin
            }
        };

        return res.json(respuesta);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ 
            error: true, 
            mensaje: 'Error al obtener las estadísticas del parqueadero'
        });
    }
};

module.exports = {
    obtenerEstadisticas
}; 