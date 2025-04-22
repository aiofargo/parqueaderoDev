const { format } = require('date-fns');
const { es } = require('date-fns/locale');

const formatNumber = (value) => {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

module.exports = {
    formatDateTime: function(date) {
        if (!date) return '';
        return format(new Date(date), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
    },
    
    formatDate: function(date) {
        if (!date) return '';
        return format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
    },

    formatMoney: function(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    },

    formatNumber
}; 