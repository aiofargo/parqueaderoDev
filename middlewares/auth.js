const { executeQuery } = require('../database/connection');

// Middleware para verificar si el usuario está autenticado
const verificarAutenticacion = (req, res, next) => {
    if (!req.session.usuario) {
        req.flash('error', 'Por favor inicie sesión para continuar');
        return res.redirect('/login');
    }
    next();
};

// Middleware para verificar si el usuario tiene acceso al módulo
const verificarAccesoModulo = (modulo) => {
    return async (req, res, next) => {
        if (!req.session.usuario) {
            req.flash('error', 'Por favor inicie sesión para continuar');
            return res.redirect('/login');
        }

        try {
            console.log(`Verificando acceso al módulo: ${modulo} para el usuario ${req.session.usuario.nombres}`);
            
            const permisos = await executeQuery(`
                SELECT 1
                FROM permisos_roles pr
                INNER JOIN modulos m ON pr.modulo_id = m.id
                WHERE pr.rol_id = ?
                AND m.nombre = ?
                AND pr.estado = 1
                AND m.estado = 1
                LIMIT 1
            `, [req.session.usuario.rol_id, modulo]);

            if (permisos.length === 0) {
                console.log(`Acceso denegado al módulo: ${modulo} para el usuario ${req.session.usuario.nombres}`);
                req.flash('error', 'No tienes acceso a este módulo');
                return res.redirect('/dashboard');
            }

            console.log(`Acceso permitido al módulo: ${modulo} para el usuario ${req.session.usuario.nombres}`);
            next();
        } catch (error) {
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
            console.log(`Verificando permiso: Módulo ${modulo}, Acción ${accion} para el usuario ${req.session.usuario.nombres}`);
            
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
                console.log(`Permiso denegado: Módulo ${modulo}, Acción ${accion} para el usuario ${req.session.usuario.nombres}`);
                req.flash('error', 'No tienes permisos para realizar esta acción');
                return res.redirect('/dashboard');
            }

            console.log(`Permiso concedido: Módulo ${modulo}, Acción ${accion} para el usuario ${req.session.usuario.nombres}`);
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
        return next();
    }

    try {
        // Obtener los módulos agrupados a los que el usuario tiene acceso
        const permisos = await executeQuery(`
            SELECT DISTINCT 
                m.id as modulo_id,
                m.nombre as modulo, 
                m.ruta, 
                m.icono,
                m.grupo,
                m.orden
            FROM permisos_roles pr
            INNER JOIN modulos m ON pr.modulo_id = m.id
            WHERE pr.rol_id = ?
            AND pr.estado = 1 
            AND m.estado = 1
            ORDER BY m.orden, m.grupo, m.nombre
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

        // Obtener los permisos específicos (acciones por módulo)
        const permisosDetallados = await executeQuery(`
            SELECT 
                pr.id,
                pr.rol_id,
                pr.modulo_id,
                pr.accion_id,
                m.nombre as modulo_nombre,
                a.nombre as accion_nombre,
                a.codigo as accion_codigo,
                pr.estado
            FROM permisos_roles pr
            INNER JOIN modulos m ON pr.modulo_id = m.id
            INNER JOIN acciones a ON pr.accion_id = a.id
            WHERE pr.rol_id = ?
            AND pr.estado = 1
            AND m.estado = 1
        `, [req.session.usuario.rol_id]);

        req.session.permisos = permisos;
        req.session.gruposPermisos = gruposPermisos;
        req.session.permisosDetallados = permisosDetallados;
        
        res.locals.permisos = permisos;
        res.locals.gruposPermisos = gruposPermisos;
        res.locals.permisosDetallados = permisosDetallados;
        res.locals.usuario = req.session.usuario;
        
        console.log(`Permisos cargados para ${req.session.usuario.nombres}: ${permisos.length} módulos, ${permisosDetallados.length} acciones`);
        next();
    } catch (error) {
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