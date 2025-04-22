const entradaController = require('./entradaController');
const salidaController = require('./salidaController');
const utilsController = require('./utilsController');

module.exports = {
    // Controlador de entradas
    mostrarFormularioEntrada: entradaController.mostrarFormularioEntrada,
    verificarPlaca: entradaController.verificarPlaca,
    procesarEntrada: entradaController.procesarEntrada,
    
    // Controlador de salidas
    mostrarFormularioSalida: salidaController.mostrarFormularioSalida,
    verificarVehiculoSalida: salidaController.verificarVehiculoSalida,
    procesarSalida: salidaController.procesarSalida,
    
    // Funciones de utilidad
    obtenerEstadisticas: utilsController.obtenerEstadisticas,

    // Histórico de depósitos
    historicoDepositos: async (req, res) => {
        try {
            const { fechaInicio, fechaFin } = req.query;
            let whereClause = '';
            let params = [];

            if (fechaInicio && fechaFin) {
                whereClause = 'WHERE DATE(d.fecha_deposito) BETWEEN ? AND ?';
                params = [fechaInicio, fechaFin];
            }

            const [depositos] = await pool.query(
                `SELECT 
                    d.id,
                    d.fecha_deposito,
                    d.monto_efectivo,
                    d.fecha_inicio_corte,
                    d.fecha_fin_corte,
                    CONCAT(u.nombre, ' ', u.apellido) as nombre_usuario
                FROM depositos_caja_fuerte d
                LEFT JOIN usuarios u ON d.usuario_id = u.id
                ${whereClause}
                ORDER BY d.fecha_deposito DESC`,
                params
            );

            res.render('parqueadero/historico-depositos', {
                depositos,
                fechaInicio,
                fechaFin
            });
        } catch (error) {
            console.error('Error al obtener histórico de depósitos:', error);
            req.flash('error', 'Error al cargar el histórico de depósitos');
            res.redirect('/parqueadero');
        }
    }
}; 