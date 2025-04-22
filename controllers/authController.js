const { connection } = require('../database/connection');
const bcrypt = require('bcrypt');
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
        path.join(logsDir, 'auth.log'),
        JSON.stringify(logEntry) + '\n'
    );
    
    console.log(`[AUTH] ${timestamp} - ${message}`);
};

const authController = {
    // Mostrar formulario de login
    mostrarLogin: (req, res) => {
        if (req.session.usuario) {
            logAuthEvent('Usuario ya autenticado, redirigiendo a dashboard', {
                usuario: req.session.usuario.documento,
                sessionID: req.sessionID
            });
            return res.redirect('/dashboard');
        }
        res.render('auth/login');
    },

    // Procesar el login
    login: async (req, res) => {
        const { documento, password } = req.body;
        logAuthEvent('Intento de inicio de sesión', { 
            documento,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            sessionID: req.sessionID
        });
        
        try {
            // Ejecutar la consulta SQL
            const [usuarios] = await connection.execute(
                'SELECT u.*, r.nombre as rol_nombre FROM usuarios u INNER JOIN roles r ON u.rol_id = r.id WHERE u.documento = ?',
                [documento]
            );
            
            // Verificar si se encontró algún usuario
            if (usuarios.length === 0) {
                logAuthEvent('Usuario no encontrado', { documento });
                req.flash('error', 'Usuario no encontrado');
                return res.redirect('/login');
            }

            const usuario = usuarios[0];
            logAuthEvent('Usuario encontrado', { 
                documento, 
                id: usuario.id,
                rol: usuario.rol_nombre
            });

            // Verificar la contraseña
            const passwordValido = await bcrypt.compare(password, usuario.password);
            if (!passwordValido) {
                logAuthEvent('Contraseña incorrecta', { documento });
                req.flash('error', 'Contraseña incorrecta');
                return res.redirect('/login');
            }

            // Verificar si el usuario está activo
            if (!usuario.estado) {
                logAuthEvent('Usuario inactivo', { documento });
                req.flash('error', 'Usuario inactivo');
                return res.redirect('/login');
            }

            // Regenerar la sesión para prevenir session fixation
            const regenerateSession = () => {
                return new Promise((resolve, reject) => {
                    req.session.regenerate((err) => {
                        if (err) {
                            logAuthEvent('Error regenerando sesión', { 
                                error: err.message, 
                                documento 
                            });
                            reject(err);
                            return;
                        }
                        logAuthEvent('Sesión regenerada con éxito', { 
                            documento, 
                            newSessionID: req.sessionID 
                        });
                        resolve();
                    });
                });
            };

            // Guardar sesión después de actualizar
            const saveSession = () => {
                return new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) {
                            logAuthEvent('Error guardando sesión', { 
                                error: err.message, 
                                documento 
                            });
                            reject(err);
                            return;
                        }
                        logAuthEvent('Sesión guardada con éxito', { 
                            documento, 
                            sessionID: req.sessionID 
                        });
                        resolve();
                    });
                });
            };

            try {
                // Regenerar la sesión para prevenir session fixation
                await regenerateSession();

                // Almacenar información del usuario en la sesión
                req.session.usuario = {
                    id: usuario.id,
                    nombres: usuario.nombres,
                    apellidos: usuario.apellidos,
                    documento: usuario.documento,
                    rol_id: usuario.rol_id,
                    rol_nombre: usuario.rol_nombre,
                    login_time: new Date().toISOString()
                };

                logAuthEvent('Información de usuario almacenada en sesión', { 
                    sessionID: req.sessionID,
                    usuario: req.session.usuario
                });

                // Cargar los permisos del usuario
                const [permisos] = await connection.execute(`
                    SELECT DISTINCT m.nombre as modulo, m.ruta, m.icono
                    FROM permisos_roles pr
                    INNER JOIN modulos m ON pr.modulo_id = m.id
                    WHERE pr.rol_id = ?
                    AND pr.estado = 1 
                    AND m.estado = 1
                    ORDER BY m.nombre
                `, [usuario.rol_id]);

                req.session.permisos = permisos;
                
                logAuthEvent('Permisos cargados', { 
                    documento,
                    permisos: permisos.map(p => p.modulo),
                    sessionID: req.sessionID
                });
                
                // Guardar la sesión explícitamente
                await saveSession();
                
                logAuthEvent('Inicio de sesión exitoso', { 
                    documento,
                    sessionID: req.sessionID
                });
                
                // Redireccionar al dashboard
                return res.redirect('/dashboard');
            } catch (sessionError) {
                logAuthEvent('Error en manejo de sesión', { 
                    error: sessionError.message,
                    stack: sessionError.stack,
                    documento
                });
                console.error('Error en manejo de sesión:', sessionError);
                req.flash('error', 'Error al iniciar sesión, por favor intente de nuevo');
                return res.redirect('/login');
            }
        } catch (error) {
            logAuthEvent('Error en login', { 
                error: error.message,
                stack: error.stack,
                documento
            });
            console.error('Error en login:', error);
            req.flash('error', 'Error al iniciar sesión');
            return res.redirect('/login');
        }
    },

    // Cerrar sesión
    logout: (req, res) => {
        const usuario = req.session.usuario ? req.session.usuario.documento : 'desconocido';
        const sessionID = req.sessionID;
        
        logAuthEvent('Iniciando cierre de sesión', { 
            usuario,
            sessionID 
        });
        
        req.session.destroy((err) => {
            if (err) {
                logAuthEvent('Error al destruir la sesión', { 
                    error: err.message,
                    usuario,
                    sessionID
                });
                console.error('Error al destruir la sesión:', err);
            } else {
                logAuthEvent('Sesión cerrada correctamente', { 
                    usuario,
                    sessionID 
                });
            }
            res.redirect('/login');
        });
    }
};

module.exports = authController; 