const express = require('express');
const router = express.Router();
const { verificarAutenticacion } = require('../middlewares/auth');
const parqueaderoController = require('../controllers/parqueaderoController');
const depositosController = require('../controllers/depositosController');

// Ruta principal del parqueadero
router.get('/', verificarAutenticacion, (req, res) => {
    const currentDate = new Date();
    res.render('parqueadero/index', {
        currentDate
    });
});

// Rutas para registro de entrada
router.get('/entrada', verificarAutenticacion, parqueaderoController.mostrarFormularioEntrada);
router.post('/entrada', verificarAutenticacion, parqueaderoController.procesarEntrada);

// Ruta para verificar placa
router.get('/verificar-placa', verificarAutenticacion, parqueaderoController.verificarPlaca);

// Rutas para registro de salida
router.get('/salida', verificarAutenticacion, parqueaderoController.mostrarFormularioSalida);
router.get('/verificar-salida', verificarAutenticacion, parqueaderoController.verificarVehiculoSalida);
router.post('/procesar-salida', verificarAutenticacion, parqueaderoController.procesarSalida);

// Ruta para obtener estadísticas (solo API JSON)
router.get('/estadisticas', verificarAutenticacion, parqueaderoController.obtenerEstadisticas);

// Ruta para la página de estadísticas (redirección)
router.get('/pagina-estadisticas', verificarAutenticacion, (req, res) => {
    const currentDate = new Date();
    res.render('parqueadero/estadisticas', {
        currentDate
    });
});

// Rutas para depósitos
router.get('/efectivo-en-caja', depositosController.obtenerEfectivoEnCaja);
router.get('/modal-deposito', depositosController.mostrarDepositoModal);
router.post('/confirmar-deposito', depositosController.confirmarDeposito);
router.get('/ticket-deposito/:id', depositosController.obtenerDeposito);
router.get('/historico-depositos', verificarAutenticacion, depositosController.obtenerHistoricoDepositos);

module.exports = router; 