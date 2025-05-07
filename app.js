const express = require('express');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const flash = require('connect-flash');
const path = require('path');
const { conectarDB, executeQuery } = require('./database/connection');
const usuariosRoutes = require('./routes/usuarios');
const rolesRoutes = require('./routes/roles');
const authRoutes = require('./routes/auth');
const tiposVehiculosRoutes = require('./routes/tipos_vehiculos');
const vehiculosExentosRoutes = require('./routes/vehiculos_exentos');
const mensualidadesRoutes = require('./routes/mensualidades');
const parqueaderoRoutes = require('./routes/parqueadero');
const permisosRoutes = require('./routes/permisos');
const facturasElectronicasRoutes = require('./routes/facturas_electronicas');
const { verificarAutenticacion, verificarAccesoModulo, cargarPermisosUsuario } = require('./middlewares/auth');
const helpers = require('./helpers/handlebars');
const facturasExcelRoutes = require('./routes/facturasExcelRoutes');

const app = express();

// Configuración de proxy en producción
if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
    console.log('Configuración de proxy habilitada');
}

// Configuración de rutas base
const basePath = process.env.BASE_PATH || '';
if (basePath) {
    console.log(`Base path configurado: ${basePath}`);
}

// Configuración de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Handlebars
const hbs = exphbs.create({
    defaultLayout: 'main',
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        ...helpers,
        eq: (a, b) => a === b,
        lt: (a, b) => a < b,
        add: (a, b) => a + b,
        multiply: (a, b) => a * b,
        formatCurrency: (amount) => {
            return new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount || 0);
        },
        formatDateInput: (date) => {
            if (!date) return '';
            try {
                const dateObj = new Date(date);
                if (isNaN(dateObj.getTime())) return '';
                return dateObj.toISOString().split('T')[0];
            } catch (error) {
                console.error('Error formateando fecha para input:', error);
                return '';
            }
        },
        tienePermiso: async function(usuario, modulo, accion) {
            if (!usuario || !usuario.rol_id) return false;
            try {
                const permisos = await executeQuery(`
                    SELECT 1
                    FROM permisos_roles pr
                    INNER JOIN modulos m ON pr.modulo_id = m.id
                    INNER JOIN acciones a ON pr.accion_id = a.id
                    WHERE pr.rol_id = ?
                    AND m.nombre = ?
                    AND a.codigo = ?
                    AND pr.estado = 1
                    AND m.estado = 1
                `, [usuario.rol_id, modulo, accion]);
                
                return permisos.length > 0;
            } catch (error) {
                console.error('Error verificando permisos:', error);
                return false;
            }
        },
        tienePermisoActivo: function(permisosActuales, modulo_id, accion_id) {
            if (!permisosActuales || !Array.isArray(permisosActuales)) return false;
            return permisosActuales.some(p => 
                parseInt(p.modulo_id) === parseInt(modulo_id) && 
                parseInt(p.accion_id) === parseInt(accion_id) && 
                parseInt(p.estado) === 1
            );
        }
    }
});

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '10mb' }));

// Configuración de sesiones
const options = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parqueadero',
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
};

const sessionStore = new MySQLStore(options);

app.use(session({
    key: 'parqueadero_session',
    secret: process.env.SESSION_SECRET || 'tu_secreto_aqui',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Cambiar a false para permitir conexiones no HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Configuración de Flash Messages
app.use(flash());

// Middleware para hacer la sesión y mensajes flash disponibles en todas las vistas
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario;
    res.locals.permisos = req.session.permisos;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// Rutas públicas
app.use('/', authRoutes);

// Middleware para cargar permisos en todas las rutas protegidas
app.use(cargarPermisosUsuario);

// Rutas protegidas
app.use('/usuarios', [verificarAutenticacion, verificarAccesoModulo('Usuarios')], usuariosRoutes);
app.use('/roles', [verificarAutenticacion, verificarAccesoModulo('Roles')], rolesRoutes);
app.use('/tipos_vehiculos', [verificarAutenticacion, verificarAccesoModulo('Tipos de Vehículos')], tiposVehiculosRoutes);
app.use('/vehiculos_exentos', [verificarAutenticacion, verificarAccesoModulo('Vehículos Exentos')], vehiculosExentosRoutes);
app.use('/mensualidades', [verificarAutenticacion, verificarAccesoModulo('Mensualidades')], mensualidadesRoutes);
app.use('/parqueadero', [verificarAutenticacion, verificarAccesoModulo('Parqueadero')], parqueaderoRoutes);
app.use('/permisos', [verificarAutenticacion, verificarAccesoModulo('Permisos')], permisosRoutes);
app.use('/facturasElectronicas', [verificarAutenticacion, verificarAccesoModulo('Facturas Electrónicas')], facturasElectronicasRoutes);
app.use('/facturasExcel', facturasExcelRoutes);

// Ruta raíz
app.get('/', (req, res) => {
    if (req.session.usuario) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

// Ruta del dashboard
app.get('/dashboard', verificarAutenticacion, (req, res) => {
    res.render('dashboard', {
        usuario: req.session.usuario
    });
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
    conectarDB();
}); 