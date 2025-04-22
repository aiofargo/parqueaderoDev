const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configurar logger para base de datos
const logDBEvent = (message, data = {}) => {
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
        path.join(logsDir, 'database.log'),
        JSON.stringify(logEntry) + '\n'
    );
    
    console.log(`[DB] ${timestamp} - ${message}`);
};

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
    queueLimit: 0
};

logDBEvent('Configuración de base de datos cargada', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    connectionLimit: dbConfig.connectionLimit,
    environment: process.env.NODE_ENV || 'desarrollo'
});

// Pool de conexiones
let pool = mysql.createPool(dbConfig);

// Función para obtener una conexión del pool
const getConnection = async () => {
    try {
        const connection = await pool.getConnection();
        logDBEvent('Conexión obtenida del pool', { poolSize: pool.pool?.config?.connectionLimit });
        return connection;
    } catch (error) {
        logDBEvent('Error al obtener conexión del pool', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        });
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
        logDBEvent('Conexión inicial exitosa a la base de datos', {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database
        });
        console.log(`Conexión exitosa a la base de datos MySQL (${dbConfig.host}:${dbConfig.port})`);
        connection.release();
    } catch (error) {
        logDBEvent('Error en conexión inicial a la base de datos', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState,
            host: dbConfig.host,
            port: dbConfig.port
        });
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
                logDBEvent('Intentando conexión alternativa con puerto 3306', {
                    host: dbConfig.host,
                    originalPort: dbConfig.port,
                    newPort: 3306
                });
                const newConnection = await pool.getConnection();
                logDBEvent('Conexión alternativa exitosa usando puerto 3306', {
                    host: dbConfig.host,
                    port: 3306
                });
                console.log(`Conexión exitosa a la base de datos MySQL (${dbConfig.host}:3306)`);
                newConnection.release();
                console.log('Se ha establecido la conexión usando el puerto 3306');
            } catch (retryError) {
                logDBEvent('Error en conexión alternativa', {
                    error: retryError.message,
                    stack: retryError.stack,
                    code: retryError.code,
                    errno: retryError.errno
                });
                console.error('Error al intentar conectar con el puerto 3306:', retryError);
                throw retryError;
            }
        } else {
            throw error;
        }
    }
};

// Función para ejecutar consultas
const executeQuery = async (query, params = []) => {
    try {
        const [rows] = await pool.execute(query, params);
        return rows;
    } catch (error) {
        logDBEvent('Error al ejecutar consulta', {
            error: error.message,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
            params: JSON.stringify(params)
        });
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