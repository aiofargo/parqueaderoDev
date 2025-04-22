const express = require('express');
const router = express.Router();
const { verificarAutenticacion } = require('../middlewares/auth');
const facturasElectronicasController = require('../controllers/facturasElectronicasController');

// Ruta para listar todas las facturas
router.get('/', verificarAutenticacion, facturasElectronicasController.listarFacturas);

// Ruta para marcar factura como creada
router.post('/marcar-creada', verificarAutenticacion, facturasElectronicasController.marcarFacturaCreada);

// Ruta para actualizar facturas con resultados del archivo cargado
router.post('/actualizar-resultados', verificarAutenticacion, facturasElectronicasController.actualizarResultados);

module.exports = router; 