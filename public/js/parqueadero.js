// Función para preparar depósito
function prepararDeposito() {
    $.ajax({
        url: '/parqueadero/preparar-deposito',
        method: 'GET',
        success: function(response) {
            if (!response.error) {
                actualizarModalDeposito(response);
                $('#modalDeposito').modal('show');
            } else {
                alert(response.mensaje);
            }
        },
        error: function() {
            alert('Error al preparar el depósito');
        }
    });
}

// Evento para el botón de depósito
$(document).on('click', '#btnDeposito', function() {
    window.location.href = '/parqueadero/preparar-deposito';
}); 