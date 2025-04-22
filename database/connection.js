const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Función para extraer host y puerto desde DB_HOST
const parseHostAndPort = (connectionString) => {
    if (connectionString.includes(':')) {
        const [host, port] = connectionString.split(':');
        return { host, port: parseInt(port, 10) };
    }
    return { host: connectionString, port: 3306 }; // puerto por defecto
};

// Configuración de la conexión a la base de datos
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parqueadero',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci'
};

// Pool de conexiones
let pool = mysql.createPool(dbConfig);

// Función para obtener una conexión del pool
const getConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Conexión exitosa a la base de datos');
        return connection;
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        console.error('Verifica que MySQL esté instalado y en ejecución en tu sistema.');
        console.error('Si estás usando XAMPP o WAMP, asegúrate de que el servicio MySQL esté iniciado.');
        console.error('Detalles del error:', {
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        });
        throw error;
    }
};

// Función para conectar inicialmente a la base de datos
const conectarDB = async () => {
    try {
        const connection = await pool.getConnection();
        console.log(`Conexión exitosa a la base de datos MySQL (${dbConfig.host}:${dbConfig.port})`);
        
        // Crear tabla de sesiones si no existe directamente con consulta SQL
        try {
            const sessionSetupSQL = `CREATE TABLE IF NOT EXISTS sessions (
                session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
                expires INT(11) UNSIGNED NOT NULL,
                data MEDIUMTEXT COLLATE utf8mb4_bin,
                PRIMARY KEY (session_id)
            ) ENGINE=InnoDB;`;
            
            await connection.query(sessionSetupSQL);
            console.log('Tabla de sesiones verificada/creada');
            
            // Verificar y corregir codificación de caracteres para tablas importantes
            await corregirCodificacionTablas(connection);
            
        } catch (setupError) {
            console.error('Error al configurar tabla de sesiones:', setupError);
        }
        
        connection.release();
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        console.error('Verifica que MySQL esté instalado y en ejecución en tu sistema.');
        console.error('Si estás usando XAMPP o WAMP, asegúrate de que el servicio MySQL esté iniciado.');
        console.error('Detalles del error:', {
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        });
        
        if (error.code === 'ECONNREFUSED') {
            console.error(`No se pudo conectar al puerto ${dbConfig.port}. Intentando con el puerto 3306...`);
            try {
                // Intentar con el puerto por defecto
                dbConfig.port = 3306;
                pool = mysql.createPool(dbConfig);
                const newConnection = await pool.getConnection();
                console.log(`Conexión exitosa a la base de datos MySQL (${dbConfig.host}:3306)`);
                
                // Crear tabla de sesiones si no existe directamente con consulta SQL
                try {
                    const sessionSetupSQL = `CREATE TABLE IF NOT EXISTS sessions (
                        session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
                        expires INT(11) UNSIGNED NOT NULL,
                        data MEDIUMTEXT COLLATE utf8mb4_bin,
                        PRIMARY KEY (session_id)
                    ) ENGINE=InnoDB;`;
                    
                    await newConnection.query(sessionSetupSQL);
                    console.log('Tabla de sesiones verificada/creada');
                    
                    // Verificar y corregir codificación de caracteres para tablas importantes
                    await corregirCodificacionTablas(newConnection);
                } catch (setupError) {
                    console.error('Error al configurar tabla de sesiones:', setupError);
                }
                
                newConnection.release();
                console.log('Se ha establecido la conexión usando el puerto 3306');
            } catch (retryError) {
                console.error('Error al intentar conectar con el puerto 3306:', retryError);
                throw retryError;
            }
        } else {
            throw error;
        }
    }
};

// Función para corregir la codificación de caracteres en las tablas
const corregirCodificacionTablas = async (connection) => {
    try {
        // Lista de tablas a verificar
        const tablas = ['modulos', 'roles', 'usuarios', 'permisos_roles'];
        
        for (const tabla of tablas) {
            try {
                // Verificar si la tabla existe
                const [tablaExiste] = await connection.query(`
                    SELECT 1 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                    AND table_name = ?
                `, [tabla]);
                
                if (tablaExiste.length > 0) {
                    // Convertir tabla a UTF8MB4
                    await connection.query(`
                        ALTER TABLE ${tabla} 
                        CONVERT TO CHARACTER SET utf8mb4 
                        COLLATE utf8mb4_unicode_ci
                    `);
                    console.log(`Tabla ${tabla} convertida a UTF8MB4`);
                }
            } catch (error) {
                console.error(`Error al convertir tabla ${tabla}:`, error);
            }
        }
        
        // Verificar y corregir orden de los módulos
        try {
            await connection.query(`
                UPDATE modulos 
                SET 
                  nombre = REPLACE(nombre, 'Configuracin', 'Configuración'),
                  nombre = REPLACE(nombre, 'Gestin', 'Gestión'),
                  nombre = REPLACE(nombre, 'Administracin', 'Administración'),
                  nombre = REPLACE(nombre, 'Vehiculos', 'Vehículos')
                WHERE 
                  nombre LIKE '%Configuracin%' 
                  OR nombre LIKE '%Gestin%'
                  OR nombre LIKE '%Administracin%'
                  OR nombre LIKE '%Vehiculos%'
            `);
            
            // Actualizar orden de los módulos
            await connection.query(`
                UPDATE modulos 
                SET orden = id 
                WHERE orden IS NULL OR orden = 0
            `);
            
            console.log('Nombres y orden de módulos corregidos');
        } catch (error) {
            console.error('Error al corregir nombres y orden de módulos:', error);
        }
    } catch (error) {
        console.error('Error al corregir codificación de tablas:', error);
    }
};

// Función para ejecutar consultas
const executeQuery = async (query, params = []) => {
    try {
        const [rows] = await pool.execute(query, params);
        return rows;
    } catch (error) {
        console.error('Error al ejecutar la consulta:', error);
        throw error;
    }
};

module.exports = {
    getConnection,
    conectarDB,
    executeQuery,
    connection: pool
}; 