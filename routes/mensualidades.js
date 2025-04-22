const express = require('express');
const router = express.Router();
const mensualidadesController = require('../controllers/mensualidadesController');

// Rutas principales
router.get('/', mensualidadesController.obtenerMensualidades);

// Rutas para crear mensualidad
router.get('/crear', mensualidadesController.mostrarFormularioCreacion);
router.post('/crear', mensualidadesController.crearMensualidad);

// Rutas para renovar mensualidad
router.get('/renovar/:id', mensualidadesController.verificarRenovacion);
router.post('/renovar/:id', mensualidadesController.procesarPagoYRenovar);

// Rutas para ver detalles y ticket
router.get('/ver/:id', mensualidadesController.mostrarDetallesMensualidad);
router.get('/ticket/:id', mensualidadesController.verTicket);

module.exports = router; 