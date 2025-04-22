-- Script para crear la base de datos parqueadero completa con codificación UTF8MB4

-- Configuración inicial para asegurar UTF8MB4
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- 1. Primero eliminar la base de datos existente (ten cuidado con este comando)
DROP DATABASE IF EXISTS `parqueadero`;

-- 2. Crear nueva base de datos con codificación correcta
CREATE DATABASE `parqueadero` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Seleccionar la base de datos
USE `parqueadero`;

-- 4. Tabla de sesiones para express-session
CREATE TABLE `sessions` (
  `session_id` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `expires` INT(11) UNSIGNED NOT NULL,
  `data` MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- 5. Crear tablas principales
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `acciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `codigo` varchar(20) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `modulos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `icono` varchar(50) DEFAULT NULL,
  `ruta` varchar(100) DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `grupo` varchar(50) DEFAULT NULL,
  `orden` int(11) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombres` varchar(100) NOT NULL,
  `apellidos` varchar(100) NOT NULL,
  `documento` varchar(20) NOT NULL,
  `correo` varchar(100) NOT NULL,
  `celular` varchar(20) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `rol_id` int(11) DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `documento` (`documento`),
  UNIQUE KEY `correo` (`correo`),
  KEY `rol_id` (`rol_id`),
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `permisos_roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rol_id` int(11) NOT NULL,
  `modulo_id` int(11) NOT NULL,
  `accion_id` int(11) NOT NULL,
  `estado` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `rol_id` (`rol_id`),
  KEY `modulo_id` (`modulo_id`),
  KEY `accion_id` (`accion_id`),
  CONSTRAINT `permisos_roles_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `permisos_roles_ibfk_2` FOREIGN KEY (`modulo_id`) REFERENCES `modulos` (`id`),
  CONSTRAINT `permisos_roles_ibfk_3` FOREIGN KEY (`accion_id`) REFERENCES `acciones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tipos_vehiculos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `icono` varchar(255) DEFAULT NULL,
  `tarifa_hora` decimal(10,2) NOT NULL,
  `porcentaje_iva` decimal(5,2) NOT NULL DEFAULT 19.00,
  `estado` tinyint(1) DEFAULT 1,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tarifa_minuto` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tarifa_plena` decimal(10,2) DEFAULT NULL,
  `tarifa_24_horas` decimal(10,2) DEFAULT NULL,
  `tarifa_mensual` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tablas adicionales del sistema
CREATE TABLE `cli_factura_e` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pago_mensualidad_id` int(11) DEFAULT NULL,
  `movimiento_id` int(11) DEFAULT NULL,
  `tipo_movimiento` enum('TIEMPO','MENSUALIDAD') NOT NULL,
  `fecha_movimiento` datetime NOT NULL DEFAULT current_timestamp(),
  `documento_identidad` varchar(20) NOT NULL,
  `nombre_completo` varchar(100) NOT NULL,
  `correo_electronico` varchar(100) NOT NULL,
  `solicita_factura_electronica` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Indica si el cliente solicitó factura electrónica (1:Sí, 0:No)',
  `numero_celular` varchar(20) NOT NULL,
  `placa` varchar(10) NOT NULL,
  `tipo_vehiculo_id` int(11) NOT NULL,
  `valor_base` decimal(10,2) NOT NULL,
  `descuento` decimal(10,2) NOT NULL DEFAULT 0.00,
  `porcentaje_descuento` decimal(5,2) NOT NULL DEFAULT 0.00,
  `valor_iva` decimal(10,2) NOT NULL,
  `porcentaje_iva` decimal(5,2) NOT NULL,
  `valor_total` decimal(10,2) NOT NULL,
  `metodo_pago` varchar(50) NOT NULL DEFAULT 'efectivo',
  `referencia_pago` varchar(100) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `factura_creada` tinyint(1) DEFAULT 0 COMMENT '0: No creada, 1: Creada',
  `fecha_creacion_factura` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pago_mensualidad_id` (`pago_mensualidad_id`),
  KEY `movimiento_id` (`movimiento_id`),
  KEY `tipo_vehiculo_id` (`tipo_vehiculo_id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `depositos_caja_fuerte` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fecha_deposito` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_inicio_corte` datetime NOT NULL,
  `fecha_fin_corte` datetime NOT NULL,
  `monto_efectivo` decimal(10,2) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1 COMMENT '1: Activo, 0: Anulado',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `movimientos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `placa` varchar(10) NOT NULL,
  `tipo_vehiculo_id` int(11) NOT NULL,
  `fecha_entrada` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_salida` datetime DEFAULT NULL,
  `valor_base` decimal(10,2) DEFAULT NULL COMMENT 'Valor antes de IVA',
  `valor_iva` decimal(10,2) DEFAULT NULL COMMENT 'Valor del IVA',
  `valor_total` decimal(10,2) DEFAULT NULL COMMENT 'Valor total del movimiento',
  `valor_descuento` decimal(10,2) DEFAULT 0.00,
  `usuario_entrada_id` int(11) NOT NULL,
  `usuario_salida_id` int(11) DEFAULT NULL,
  `estado` tinyint(1) DEFAULT 1 COMMENT '1: En parqueadero, 0: Retirado',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `observaciones_entrada` text DEFAULT NULL,
  `observaciones_salida` text DEFAULT NULL,
  `depositado_en_caja` tinyint(1) DEFAULT 0 COMMENT '1: Depositado en caja fuerte, 0: En caja',
  PRIMARY KEY (`id`),
  KEY `tipo_vehiculo_id` (`tipo_vehiculo_id`),
  KEY `usuario_entrada_id` (`usuario_entrada_id`),
  KEY `usuario_salida_id` (`usuario_salida_id`),
  KEY `idx_depositado_en_caja` (`depositado_en_caja`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `detalle_movimientos_deposito` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `deposito_id` int(11) NOT NULL,
  `movimiento_id` int(11) NOT NULL,
  `valor_depositado` decimal(10,2) NOT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `deposito_id` (`deposito_id`),
  KEY `movimiento_id` (`movimiento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mensualidades` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `placa` varchar(10) NOT NULL,
  `nombre_dueno` varchar(100) NOT NULL,
  `documento_identidad` varchar(20) DEFAULT NULL,
  `celular` varchar(20) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date NOT NULL,
  `tipo_vehiculo_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `estado` tinyint(1) DEFAULT 1 COMMENT '1: Activo, 0: Inactivo',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_placa` (`placa`),
  KEY `tipo_vehiculo_id` (`tipo_vehiculo_id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pagos_mensualidades` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `mensualidad_id` int(11) NOT NULL,
  `fecha_pago` datetime NOT NULL DEFAULT current_timestamp(),
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date NOT NULL,
  `cantidad_meses` int(11) NOT NULL DEFAULT 1,
  `valor_base` decimal(10,2) NOT NULL,
  `descuento` decimal(10,2) NOT NULL DEFAULT 0.00,
  `porcentaje_descuento` decimal(5,2) NOT NULL DEFAULT 0.00,
  `valor_iva` decimal(10,2) NOT NULL,
  `porcentaje_iva` decimal(5,2) NOT NULL,
  `valor_total` decimal(10,2) NOT NULL,
  `metodo_pago` varchar(50) NOT NULL DEFAULT 'efectivo',
  `referencia_pago` varchar(100) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `estado` tinyint(1) DEFAULT 1 COMMENT '1: Pagado, 0: Anulado',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `mensualidad_id` (`mensualidad_id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vehiculos_exentos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `placa` varchar(10) NOT NULL,
  `nombre_propietario` varchar(100) NOT NULL,
  `documento_propietario` varchar(20) NOT NULL,
  `tipo_vehiculo_id` int(11) NOT NULL,
  `motivo` text NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `estado` tinyint(1) DEFAULT 1 COMMENT '1: Activo, 0: Inactivo',
  `usuario_id` int(11) NOT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `placa` (`placa`),
  KEY `tipo_vehiculo_id` (`tipo_vehiculo_id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Añadir restricciones y claves foráneas
ALTER TABLE `movimientos`
  ADD CONSTRAINT `movimientos_ibfk_1` FOREIGN KEY (`tipo_vehiculo_id`) REFERENCES `tipos_vehiculos` (`id`),
  ADD CONSTRAINT `movimientos_ibfk_2` FOREIGN KEY (`usuario_entrada_id`) REFERENCES `usuarios` (`id`),
  ADD CONSTRAINT `movimientos_ibfk_3` FOREIGN KEY (`usuario_salida_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `detalle_movimientos_deposito`
  ADD CONSTRAINT `detalle_movimientos_deposito_ibfk_1` FOREIGN KEY (`deposito_id`) REFERENCES `depositos_caja_fuerte` (`id`),
  ADD CONSTRAINT `detalle_movimientos_deposito_ibfk_2` FOREIGN KEY (`movimiento_id`) REFERENCES `movimientos` (`id`);

ALTER TABLE `mensualidades`
  ADD CONSTRAINT `mensualidades_ibfk_1` FOREIGN KEY (`tipo_vehiculo_id`) REFERENCES `tipos_vehiculos` (`id`),
  ADD CONSTRAINT `mensualidades_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `pagos_mensualidades`
  ADD CONSTRAINT `pagos_mensualidades_ibfk_1` FOREIGN KEY (`mensualidad_id`) REFERENCES `mensualidades` (`id`),
  ADD CONSTRAINT `pagos_mensualidades_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `cli_factura_e`
  ADD CONSTRAINT `cli_factura_e_ibfk_1` FOREIGN KEY (`pago_mensualidad_id`) REFERENCES `pagos_mensualidades` (`id`),
  ADD CONSTRAINT `cli_factura_e_ibfk_2` FOREIGN KEY (`movimiento_id`) REFERENCES `movimientos` (`id`),
  ADD CONSTRAINT `cli_factura_e_ibfk_3` FOREIGN KEY (`tipo_vehiculo_id`) REFERENCES `tipos_vehiculos` (`id`),
  ADD CONSTRAINT `cli_factura_e_ibfk_4` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `depositos_caja_fuerte`
  ADD CONSTRAINT `depositos_caja_fuerte_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `vehiculos_exentos`
  ADD CONSTRAINT `vehiculos_exentos_ibfk_1` FOREIGN KEY (`tipo_vehiculo_id`) REFERENCES `tipos_vehiculos` (`id`),
  ADD CONSTRAINT `vehiculos_exentos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

-- 8. Insertar datos iniciales
-- Roles
INSERT INTO `roles` (`nombre`, `descripcion`, `estado`) VALUES
('SUPER ADMINISTRADOR', 'Usuario con acceso total al sistema', 1),
('ADMINISTRADOR DE PARQUEADERO', 'Usuario con acceso a todas la funciones', 1),
('CONTADOR', 'Usuario con acceso a informes y registros contables', 1),
('GUARDA DE SEGURIDAD', 'PARA RECIBIR O ENTREGAR LOS VEHICULOS Y MANEJAR CAJA', 1);

-- Acciones
INSERT INTO `acciones` (`nombre`, `descripcion`, `codigo`, `estado`) VALUES
('Crear', 'Permite crear nuevos registros', 'CREATE', 1),
('Leer', 'Permite ver registros', 'READ', 1),
('Actualizar', 'Permite modificar registros', 'UPDATE', 1),
('Eliminar', 'Permite eliminar registros', 'DELETE', 1);

-- Módulos
INSERT INTO `modulos` (`nombre`, `descripcion`, `icono`, `ruta`, `estado`, `grupo`, `orden`) VALUES
('Usuarios', 'Gestión de usuarios del sistema', 'bi bi-people', '/usuarios', 1, 'Gestión de Permisos', 2),
('Roles', 'Gestión de roles y permisos', 'bi bi-shield-lock', '/roles', 1, 'Gestión de Permisos', 2),
('Parqueadero', 'Gestión de parqueadero', 'bi bi-car-front', '/parqueadero', 1, 'Operación Diaria', 1),
('Mensualidades', 'Gestión de mensualidades', 'bi bi-calendar-month', '/mensualidades', 1, 'Operación Diaria', 1),
('Tipos de Vehículos', 'Gestiona la tabla de categorías y costos de parqueo por vehículo', 'bi bi-car-front', '/tipos_vehiculos', 1, 'Configuración de Precios', 3),
('Vehículos Exentos', 'Gestiona los vehículos que no pagan', 'bi bi-shield-check', '/vehiculos_exentos', 1, 'Operación Diaria', 1),
('Permisos', 'Gestiona todos los permisos por roles', 'bi-lock', '/permisos', 1, 'Gestión de Permisos', 2),
('Facturas Electrónicas', 'Módulo para controlar la creación de facturas electrónicas en sigo por parte del contador', 'bi-clipboard-check', '/facturasElectronicas', 1, 'Operación Diaria', 1);

-- Usuario administrador (password: admin123)
INSERT INTO `usuarios` (`nombres`, `apellidos`, `documento`, `correo`, `celular`, `password`, `rol_id`, `estado`) VALUES
('FABIAN', 'GOMEZ', '1012346553', 'frincong88@gmail.com', '3108883499', '$2b$10$FdSZdIAF4PV8F/WCk7WfKeUfYwBF9kkMm9Xa4DqqZHQVsGepXAy7q', 1, 1);

-- Tipos de vehículos
INSERT INTO `tipos_vehiculos` (`nombre`, `descripcion`, `icono`, `tarifa_hora`, `porcentaje_iva`, `estado`, `tarifa_minuto`, `tarifa_plena`, `tarifa_24_horas`, `tarifa_mensual`) VALUES
('Categoría 1', 'Vehículos livianos como automóviles, camionetas, camperos y microbuses con eje de llanta sencilla para uso particular o público incluye mototaxi', 'icon-1744757565504-437141918.png', 10000.00, 19.00, 1, 120.00, 15000.00, 28000.00, 250000.00),
('Categoría 2', 'Buses busetas y microbuses con eje trasero de doble llanta o pacha además de camiones con dos ejes', 'icon-1744758008918-228284038.png', 7000.00, 19.00, 1, 140.00, 17000.00, 30000.00, 380000.00),
('Categoría 3', 'Camiones o vehículos que cuenta con tres o mas ejes', 'icon-1744757679910-911133580.png', 1000.00, 19.00, 1, 163.00, 20000.00, 38000.00, 450000.00),
('Categoría 4', 'Motocicletas', 'icon-1744835528434-547782410.png', 12000.00, 19.00, 1, 114.00, 14000.00, 25000.00, 120000.00),
('Categoría 5', 'Bicicleta', 'icon-1744835630048-838706007.png', 0.00, 19.00, 1, 0.00, 0.00, 2000.00, 25000.00);

-- Asignar todos los permisos al Super Administrador
INSERT INTO `permisos_roles` (`rol_id`, `modulo_id`, `accion_id`, `estado`)
SELECT 1, m.`id`, a.`id`, 1
FROM `modulos` m, `acciones` a;

-- 9. Verificar que la base está configurada correctamente
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME 
FROM INFORMATION_SCHEMA.SCHEMATA 
WHERE SCHEMA_NAME = 'parqueadero';

-- SELECT 'Base de datos creada con éxito con UTF8MB4' AS mensaje; 