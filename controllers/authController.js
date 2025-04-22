const { connection } = require('../database/connection');
const bcrypt = require('bcrypt');

const authController = {
    // Mostrar formulario de login
    mostrarLogin: (req, res) => {
        if (req.session.usuario) {
            return res.redirect('/dashboard');
        }
        res.render('auth/login');
    },

    // Procesar el login
    login: async (req, res) => {
        const { documento, password } = req.body;
        try {
            // Ejecutar la consulta SQL
            const [usuarios] = await connection.execute(
                'SELECT u.*, r.nombre as rol_nombre FROM usuarios u INNER JOIN roles r ON u.rol_id = r.id WHERE u.documento = ?',
                [documento]
            );
            
            // Verificar si se encontró algún usuario
            if (usuarios.length === 0) {
                req.flash('error', 'Usuario no encontrado');
                return res.redirect('/login');
            }

            const usuario = usuarios[0];

            // Verificar la contraseña
            try {
                const passwordValido = await bcrypt.compare(password, usuario.password);
                if (!passwordValido) {
                    req.flash('error', 'Contraseña incorrecta');
                    return res.redirect('/login');
                }
            } catch (bcryptError) {
                console.error('Error al verificar contraseña con bcrypt:', bcryptError);
                req.flash('error', 'Error al verificar credenciales');
                return res.redirect('/login');
            }

            // Verificar si el usuario está activo
            if (!usuario.estado) {
                req.flash('error', 'Usuario inactivo');
                return res.redirect('/login');
            }

            // Almacenar información del usuario en la sesión
            req.session.usuario = {
                id: usuario.id,
                nombres: usuario.nombres,
                apellidos: usuario.apellidos,
                documento: usuario.documento,
                rol_id: usuario.rol_id,
                rol_nombre: usuario.rol_nombre
            };

            // Cargar los permisos del usuario con información adicional
            const [permisos] = await connection.execute(`
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
                ORDER BY m.orden, m.nombre
            `, [usuario.rol_id]);

            req.session.permisos = permisos;
            
            // Obtener los permisos específicos (acciones por módulo)
            const [permisosDetallados] = await connection.execute(`
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
            `, [usuario.rol_id]);

            req.session.permisosDetallados = permisosDetallados;
            
            // Forzar guardado de sesión antes de redireccionar
            req.session.save(err => {
                if (err) {
                    console.error('Error al guardar la sesión:', err);
                }
                // Redireccionar al dashboard
                return res.redirect('/dashboard');
            });
        } catch (error) {
            console.error('Error en login:', error);
            req.flash('error', 'Error al iniciar sesión');
            return res.redirect('/login');
        }
    },

    // Cerrar sesión
    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) console.error('Error al destruir la sesión:', err);
            res.redirect('/login');
        });
    }
};

module.exports = authController; 