const mysql = require('mysql2/promise');
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
    queueLimit: 0
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