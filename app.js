const express = require('express');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();
const fs = require('fs');
const morgan = require('morgan');
const { conectarDB, executeQuery, dbConfig } = require('./database/connection');
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

// Crear directorio para logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Configurar logger
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
// Logger para errores de autenticación
const authLogStream = fs.createWriteStream(path.join(logsDir, 'auth.log'), { flags: 'a' });

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
const sessionSecret = process.env.SESSION_SECRET || 'tu_secreto_aqui';

// Configuración de opciones de sesión
const sessionConfig = {
    key: 'parqueadero_session',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax'
    }
};

// En producción, configurar el proxy y usar MySQL para almacenamiento de sesiones
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1); // Confiar en el primer proxy
    console.log('Modo producción activado - Configuración de sesión segura habilitada');
    
    // Opciones para MySQL session store
    const options = {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
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
    
    // Crear tabla de sesiones si no existe
    console.log('Configurando almacenamiento de sesiones en MySQL');
    sessionConfig.store = new MySQLStore(options);
    
    fs.appendFileSync(
        path.join(logsDir, 'session.log'),
        `${new Date().toISOString()} - Sesiones configuradas con MySQL Store: ${JSON.stringify({
            host: options.host,
            database: options.database,
            tableName: options.schema.tableName
        })}\n`
    );
}

app.use(session(sessionConfig));

// Configuración de Flash Messages
app.use(flash());

// Middleware para hacer la sesión y mensajes flash disponibles en todas las vistas
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario;
    res.locals.permisos = req.session.permisos;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    
    // Log para seguimiento de sesión
    const sessionInfo = {
        sessionID: req.sessionID,
        tieneUsuario: !!req.session.usuario,
        path: req.path
    };
    
    if (req.path !== '/login' && req.path !== '/logout') {
        console.log(`[${new Date().toISOString()}] Ruta: ${req.path}, Usuario en sesión: ${req.session.usuario ? req.session.usuario.documento : 'No autenticado'}, SessionID: ${req.sessionID}`);
        
        fs.appendFileSync(
            path.join(logsDir, 'session.log'),
            `${new Date().toISOString()} - Sesión: ${JSON.stringify(sessionInfo)}\n`
        );
    }
    
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
    console.log(`Renderizando dashboard para usuario: ${req.session.usuario.documento}, SessionID: ${req.sessionID}`);
    res.render('dashboard', {
        usuario: req.session.usuario
    });
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} en modo ${process.env.NODE_ENV || 'desarrollo'}`);
    console.log(`Session cookie secure: ${sessionConfig.cookie.secure}`);
    console.log(`Almacenamiento de sesiones: ${sessionConfig.store ? 'MySQL' : 'MemoryStore'}`);
    conectarDB();
}); 