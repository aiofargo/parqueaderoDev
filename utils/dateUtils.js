/**
 * Utilidades para manejar fechas con la zona horaria de Bogotá
 */
const { format, addMonths, addDays } = require('date-fns');
const { es } = require('date-fns/locale');

/**
 * Obtiene la fecha y hora actual en la zona horaria de Bogotá
 * @returns {Date} Fecha actual en la zona horaria de Bogotá
 */
const getCurrentDate = () => {
    // Crear una fecha con la zona horaria local
    const date = new Date();
    // La zona horaria de Bogotá es UTC-5
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
};

/**
 * Formatea una fecha según el formato especificado
 * @param {Date|string|number} date - Fecha a formatear
 * @param {string} formatStr - Formato de fecha (usa la sintaxis de date-fns)
 * @returns {string} Fecha formateada
 */
const formatDate = (date, formatStr = 'yyyy-MM-dd HH:mm:ss') => {
    if (!date) return '';
    
    // Convertir a objeto Date si es string o número
    const dateObj = typeof date === 'string' || typeof date === 'number' 
        ? new Date(date) 
        : date;
    
    // Formatear la fecha
    return format(dateObj, formatStr, { locale: es });
};

/**
 * Formatea una fecha para mostrarla en español
 * @param {Date|string|number} date - Fecha a formatear
 * @returns {string} Fecha formateada en español
 */
const formatDateES = (date) => {
    if (!date) return '';
    
    // Convertir a objeto Date si es string o número
    const dateObj = typeof date === 'string' || typeof date === 'number' 
        ? new Date(date) 
        : date;
    
    // Formatear la fecha
    return format(dateObj, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
};

/**
 * Parsea una fecha desde un string o timestamp y la ajusta a la zona horaria de Bogotá
 * @param {string|number} dateStr - String o timestamp de fecha
 * @returns {Date} Fecha ajustada a la zona horaria de Bogotá
 */
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Crear el objeto Date
    const date = new Date(dateStr);
    
    // Ajustar a la zona horaria de Bogotá
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
};

/**
 * Agrega un número específico de meses a una fecha
 * @param {Date|string|number} date - Fecha base
 * @param {number} months - Número de meses a agregar
 * @returns {Date} Nueva fecha con los meses agregados
 */
const addMonthsToDate = (date, months) => {
    if (!date) return null;
    
    // Convertir a objeto Date si es string o número
    const dateObj = typeof date === 'string' || typeof date === 'number' 
        ? new Date(date) 
        : date;
    
    // Agregar los meses
    return addMonths(dateObj, months);
};

/**
 * Agrega un número específico de días a una fecha
 * @param {Date|string|number} date - Fecha base
 * @param {number} days - Número de días a agregar
 * @returns {Date} Nueva fecha con los días agregados
 */
const addDaysToDate = (date, days) => {
    if (!date) return null;
    
    // Convertir a objeto Date si es string o número
    const dateObj = typeof date === 'string' || typeof date === 'number' 
        ? new Date(date) 
        : date;
    
    // Agregar los días
    return addDays(dateObj, days);
};

module.exports = {
    getCurrentDate,
    formatDate,
    formatDateES,
    parseDate,
    addMonthsToDate,
    addDaysToDate
}; 