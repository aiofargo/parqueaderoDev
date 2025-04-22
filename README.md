# Sistema de Gestión de Parqueadero

Sistema de gestión de parqueadero con módulo de usuarios desarrollado en Node.js, Express, Handlebars y MySQL.

## Requisitos Previos

- Node.js (v14 o superior)
- MySQL (v8 o superior)
- npm (v6 o superior)

## Instalación

1. Clonar el repositorio:
```bash
git clone [url-del-repositorio]
cd parqueadero
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
- Copiar el archivo `.env.example` a `.env`
- Modificar las variables según tu configuración local

4. Crear la base de datos:
- Ejecutar el script SQL en `database/schema.sql`

5. Ejecutar el script de tablas `setup_sessions_table.sql` para crear la tabla de sesiones

## Ejecución

1. Iniciar el servidor en modo desarrollo:
```bash
npm run dev
```

2. Iniciar el servidor en modo producción:
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## Estructura del Proyecto

```
parqueadero/
├── config/
│   └── database.js
├── controllers/
│   └── usuariosController.js
├── database/
│   └── schema.sql
├── routes/
│   └── usuarios.js
├── views/
│   ├── layouts/
│   │   └── main.handlebars
│   └── usuarios/
│       ├── lista.handlebars
│       ├── crear.handlebars
│       └── editar.handlebars
├── .env
├── app.js
└── package.json
```

## Funcionalidades

- Gestión de usuarios (CRUD)
- Roles de usuario (Administrador, Cajero)
- Interfaz responsive con Bootstrap 5 

## Configuración en Producción

### Variables de entorno importantes

```
NODE_ENV=production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=parqueadero
DB_PORT=3306
DB_CONNECTION_LIMIT=10
SESSION_SECRET=parqueaderoSessionSecret123
PORT=3000
```

### Persistencia de sesiones

En entorno de producción, la aplicación utiliza MySQL para almacenar las sesiones de usuario. Esto es necesario para entornos multi-instancia o cuando se utiliza Coolify para el despliegue.

Para asegurar que las sesiones funcionen correctamente:

1. Asegúrate de que el script `setup_sessions_table.sql` se haya ejecutado en la base de datos.
2. Verifica que `NODE_ENV=production` esté configurado.
3. Las credenciales de base de datos deben ser correctas.

### Solución de problemas de autenticación

Si los usuarios no pueden iniciar sesión en producción:

1. Revisa los logs en la carpeta `/logs`, especialmente:
   - `auth.log` para problemas de autenticación
   - `auth_middleware.log` para problemas en el flujo de autenticación
   - `database.log` para problemas de conexión a la base de datos
   - `session.log` para problemas con el manejo de sesiones

2. Verifica la configuración de Coolify:
   - Asegúrate de que el proxy esté configurado correctamente (enviando headers X-Forwarded-*)
   - Verifica que los puertos de la base de datos sean accesibles

3. Comprueba si la tabla `sessions` se ha creado correctamente en la base de datos.

4. Si persisten los problemas, intenta:
   - Limpiar la tabla de sesiones: `TRUNCATE TABLE sessions;`
   - Reiniciar el servicio 