const mysql = require('mysql2');

// Configuración de conexión básica
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'parqueadero'
});

// Intentar conectar
connection.connect((err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        console.error('Código de error:', err.code);
        console.error('Número de error:', err.errno);
        return;
    }
    
    console.log('¡Conexión exitosa a la base de datos MySQL!');
    
    // Probar una consulta simple
    connection.query('SHOW TABLES', (err, results) => {
        if (err) {
            console.error('Error ejecutando consulta:', err);
            return;
        }
        
        console.log('Tablas en la base de datos:');
        console.log(results);
        
        // Cerrar la conexión
        connection.end();
    });
}); 