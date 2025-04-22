const { executeQuery } = require('../database/connection');
const fs = require('fs');
const path = require('path');

// Configurar logger para autenticación
const logAuthEvent = (message, data = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        message,
        ...data
    };
    
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }
    
    fs.appendFileSync(
        path.join(logsDir, 'auth_middleware.log'),
        JSON.stringify(logEntry) + '\n'
    );
    
    console.log(`[AUTH_MIDDLEWARE] ${timestamp} - ${message}`);
};

// Middleware para verificar si el usuario está autenticado
const verificarAutenticacion = (req, res, next) => {
    logAuthEvent('Verificando autenticación', {
        path: req.path,
        method: req.method,
        sessionID: req.sessionID,
        tieneUsuario: !!req.session.usuario,
        headers: {
            cookie: req.headers.cookie,
            userAgent: req.headers['user-agent']
        }
    });

    if (!req.session) {
        logAuthEvent('No hay objeto de sesión disponible', {
            path: req.path,
            headers: req.headers
        });
        req.flash('error', 'Error de sesión. Por favor inicie sesión nuevamente');
        return res.redirect('/login');
    }

    if (!req.session.usuario) {
        logAuthEvent('Usuario no autenticado', {
            path: req.path,
            sessionID: req.sessionID
        });
        req.flash('error', 'Por favor inicie sesión para continuar');
        return res.redirect('/login');
    }

    logAuthEvent('Usuario autenticado', {
        documento: req.session.usuario.documento,
        rol: req.session.usuario.rol_nombre,
        path: req.path
    });
    next();
};

// Middleware para verificar si el usuario tiene acceso al módulo
const verificarAccesoModulo = (modulo) => {
    return async (req, res, next) => {
        logAuthEvent('Verificando acceso a módulo', {
            modulo,
            path: req.path,
            usuario: req.session.usuario ? req.session.usuario.documento : null
        });

        if (!req.session.usuario) {
            logAuthEvent('Usuario no autenticado al verificar módulo', {
                modulo,
                path: req.path
            });
            req.flash('error', 'Por favor inicie sesión para continuar');
            return res.redirect('/login');
        }

        try {
            const permisos = await executeQuery(`
                SELECT 1
                FROM permisos_roles pr
                INNER JOIN modulos m ON pr.modulo_id = m.id
                WHERE pr.rol_id = ?
                AND m.nombre = ?
                AND pr.estado = 1
                AND m.estado = 1
            `, [req.session.usuario.rol_id, modulo]);

            if (permisos.length === 0) {
                logAuthEvent('Acceso denegado a módulo', {
                    modulo,
                    usuario: req.session.usuario.documento,
                    rol: req.session.usuario.rol_id
                });
                req.flash('error', 'No tienes acceso a este módulo');
                return res.redirect('/dashboard');
            }

            logAuthEvent('Acceso concedido a módulo', {
                modulo,
                usuario: req.session.usuario.documento,
                rol: req.session.usuario.rol_nombre
            });
            next();
        } catch (error) {
            logAuthEvent('Error verificando acceso al módulo', {
                error: error.message,
                stack: error.stack,
                modulo,
                usuario: req.session.usuario.documento
            });
            console.error('Error verificando acceso al módulo:', error);
            req.flash('error', 'Error al verificar permisos');
            res.redirect('/dashboard');
        }
    };
};

// Middleware para verificar permisos específicos
const verificarPermiso = (modulo, accion) => {
    return async (req, res, next) => {
        if (!req.session.usuario) {
            req.flash('error', 'Por favor inicie sesión para continuar');
            return res.redirect('/login');
        }

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
            `, [req.session.usuario.rol_id, modulo, accion]);

            if (permisos.length === 0) {
                req.flash('error', 'No tienes permisos para realizar esta acción');
                return res.redirect('/dashboard');
            }

            next();
        } catch (error) {
            console.error('Error verificando permisos:', error);
            req.flash('error', 'Error al verificar permisos');
            res.redirect('/dashboard');
        }
    };
};

// Cargar permisos del usuario con grupos
const cargarPermisosUsuario = async (req, res, next) => {
    if (!req.session.usuario) {
        logAuthEvent('No hay usuario en sesión para cargar permisos', {
            path: req.path,
            sessionID: req.sessionID
        });
        return next();
    }

    logAuthEvent('Cargando permisos de usuario', {
        usuario: req.session.usuario.documento,
        rol: req.session.usuario.rol_id,
        path: req.path
    });

    try {
        // Obtener los módulos agrupados a los que el usuario tiene acceso
        const permisos = await executeQuery(`
            SELECT DISTINCT 
                m.nombre as modulo, 
                m.ruta, 
                m.icono,
                m.grupo
            FROM permisos_roles pr
            INNER JOIN modulos m ON pr.modulo_id = m.id
            WHERE pr.rol_id = ?
            AND pr.estado = 1 
            AND m.estado = 1
            ORDER BY m.grupo, m.nombre
        `, [req.session.usuario.rol_id]);
        
        // Agrupar los permisos por grupo
        const gruposPermisos = permisos.reduce((grupos, permiso) => {
            const grupo = permiso.grupo || 'Sin Grupo';
            if (!grupos[grupo]) {
                grupos[grupo] = {
                    nombre: grupo,
                    modulos: []
                };
            }
            grupos[grupo].modulos.push(permiso);
            return grupos;
        }, {});

        req.session.permisos = permisos;
        req.session.gruposPermisos = gruposPermisos;
        res.locals.permisos = permisos;
        res.locals.gruposPermisos = gruposPermisos;
        res.locals.usuario = req.session.usuario;

        logAuthEvent('Permisos cargados con éxito', {
            usuario: req.session.usuario.documento,
            permisosCount: permisos.length,
            grupos: Object.keys(gruposPermisos)
        });

        // Guardar la sesión explícitamente después de actualizarla
        req.session.save(err => {
            if (err) {
                logAuthEvent('Error al guardar sesión con permisos', {
                    error: err.message,
                    usuario: req.session.usuario.documento
                });
                console.error('Error al guardar sesión con permisos:', err);
            }
            next();
        });
    } catch (error) {
        logAuthEvent('Error al cargar permisos', {
            error: error.message,
            stack: error.stack,
            usuario: req.session.usuario.documento
        });
        console.error('Error al cargar permisos:', error);
        next(error);
    }
};

module.exports = {
    verificarAutenticacion,
    verificarAccesoModulo,
    verificarPermiso,
    cargarPermisosUsuario
}; 