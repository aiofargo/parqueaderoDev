/**
 * Funciones de filtrado para facturas electrónicas
 */

// Función para aplicar filtros
function aplicarFiltros(mostrarAlertaFlag = true) {
    // Obtener valores de los filtros - ahora usando radio buttons
    const estadoFacturaEl = document.querySelector('input[name="filtroEstadoFactura"]:checked');
    const tipoEl = document.querySelector('input[name="filtroTipo"]:checked');
    const solicitudEl = document.querySelector('input[name="filtroSolicitud"]:checked');
    
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    const tablaFacturas = document.getElementById('tablaFacturas');
    
    if (!tablaFacturas) {
        console.error('No se encontró la tabla de facturas');
        return 0;
    }
    
    // Obtener valores de los filtros seleccionados
    const estadoFactura = estadoFacturaEl ? estadoFacturaEl.value : "";
    const fechaDesde = fechaInicio && fechaInicio.value ? new Date(fechaInicio.value) : null;
    const fechaHasta = fechaFin && fechaFin.value ? new Date(fechaFin.value) : null;
    const tipo = tipoEl ? tipoEl.value : "";
    const solicitud = solicitudEl ? solicitudEl.value : "";
    
    const filas = tablaFacturas.querySelectorAll('tr');
    let contadorVisibles = 0;
    
    console.log('Aplicando filtros:', {
        estadoFactura,
        fechaDesde: fechaDesde ? fechaDesde.toISOString() : null,
        fechaHasta: fechaHasta ? fechaHasta.toISOString() : null,
        tipo,
        solicitud
    });
    
    filas.forEach((fila, rowIndex) => {
        const celdas = fila.querySelectorAll('td');
        if (celdas.length === 0) return; // Saltar encabezados
        
        if (celdas.length < 14) {
            console.warn(`Fila ${rowIndex} no tiene suficientes celdas`);
            return;
        }
        
        // IMPORTANTE: Con la nueva estructura, estos son los índices correctos:
        // 0 - ID
        // 1 - Placa
        // 2 - Tipo Vehículo
        // 3 - Cliente
        // 4 - Documento
        // 5 - Email
        // 6 - Fecha
        // 7 - Valor Base
        // 8 - % Desc.
        // 9 - Descuento
        // 10 - IVA
        // 11 - Total
        // 12 - Tipo
        // 13 - Estado Factura
        // 14 - Fecha Creación
        
        // Filtrar por tipo de registro
        let cumpleTipo = true;
        if (tipo) {
            try {
                const tipoCell = celdas[12]; // Celda "Tipo"
                if (tipoCell) {
                    const tipoSpan = tipoCell.querySelector('span');
                    if (tipoSpan) {
                        const tipoTexto = tipoSpan.textContent.trim().toLowerCase();
                        const esMovimiento = tipoTexto.includes('tiempo');
                        const tipoRegistro = esMovimiento ? 'tiempo' : 'mensualidad';
                        cumpleTipo = tipoRegistro === tipo;
                        console.log(`Fila ${rowIndex} tipo:`, { tipoTexto, esMovimiento, tipoRegistro, cumpleTipo });
                    }
                }
            } catch (e) {
                console.error('Error al procesar tipo:', e);
            }
        }
        
        // Filtrar por fecha
        let cumpleFecha = true;
        if (fechaDesde || fechaHasta) {
            try {
                const fechaTexto = celdas[6].textContent.trim(); // Celda "Fecha"
                let fechaRegistro = new Date(fechaTexto);
                
                // Si la fecha no es válida, intentar otros formatos
                if (isNaN(fechaRegistro.getTime())) {
                    const partesFecha = fechaTexto.split(/[\/, -]/);
                    if (partesFecha.length >= 3) {
                        fechaRegistro = new Date(
                            parseInt(partesFecha[2]),
                            parseInt(partesFecha[1]) - 1,
                            parseInt(partesFecha[0])
                        );
                    }
                }
                
                if (!isNaN(fechaRegistro.getTime())) {
                    if (fechaDesde) {
                        fechaDesde.setHours(0, 0, 0, 0);
                        if (fechaRegistro < fechaDesde) cumpleFecha = false;
                    }
                    
                    if (fechaHasta) {
                        fechaHasta.setHours(23, 59, 59, 999);
                        if (fechaRegistro > fechaHasta) cumpleFecha = false;
                    }
                }
            } catch (e) {
                console.error('Error al procesar fecha:', e);
            }
        }
        
        // Filtrar por estado de factura
        let cumpleEstado = true;
        if (estadoFactura) {
            try {
                const estadoCell = celdas[13]; // Celda "Estado Factura"
                if (estadoCell) {
                    const estadoSpan = estadoCell.querySelector('span');
                    if (estadoSpan) {
                        const estadoTexto = estadoSpan.textContent.trim().toLowerCase();
                        const facturaCreada = estadoTexto.includes('factura creada');
                        const pendiente = estadoTexto.includes('pendiente');
                        const noSolicitada = estadoTexto.includes('no solicitada');
                        
                        console.log(`Fila ${rowIndex} estado:`, { 
                            estadoTexto, 
                            facturaCreada, 
                            pendiente, 
                            noSolicitada 
                        });
                        
                        if (estadoFactura === 'realizadas') {
                            cumpleEstado = facturaCreada;
                        } else if (estadoFactura === 'pendientes') {
                            // Para estado "pendientes" incluimos tanto "Pendiente" como "No solicitada"
                            cumpleEstado = pendiente || noSolicitada;
                        }
                    }
                }
            } catch (e) {
                console.error('Error al procesar estado:', e);
            }
        }
        
        // Filtrar por solicitud de factura
        let cumpleSolicitud = true;
        if (solicitud) {
            try {
                const estadoCell = celdas[13]; // Celda "Estado Factura"
                if (estadoCell) {
                    const estadoSpan = estadoCell.querySelector('span');
                    if (estadoSpan) {
                        const estadoTexto = estadoSpan.textContent;
                        const facturaCreada = estadoTexto.includes('Factura creada');
                        const solicitaFactura = estadoTexto.includes('Pendiente');
                        const noSolicitaFactura = estadoTexto.includes('No solicitada');
                        
                        if (solicitud === '1') {
                            cumpleSolicitud = solicitaFactura || facturaCreada;
                        } else if (solicitud === '0') {
                            cumpleSolicitud = noSolicitaFactura;
                        }
                    }
                }
            } catch (e) {
                console.error('Error al procesar solicitud:', e);
            }
        }
        
        // Aplicar todos los filtros
        if (cumpleTipo && cumpleFecha && cumpleEstado && cumpleSolicitud) {
            fila.style.display = '';
            contadorVisibles++;
        } else {
            fila.style.display = 'none';
        }
    });
    
    console.log(`Filas filtradas. Visibles: ${contadorVisibles}, Total: ${filas.length - 1}`);
    
    return contadorVisibles;
}

// Función para mostrar alertas en modal
function mostrarAlerta(tipo, mensaje) {
    // Crear el modal si no existe
    let modalAlerta = document.getElementById('modalAlerta');
    if (!modalAlerta) {
        const modalHTML = `
            <div class="modal fade" id="modalAlerta" tabindex="-1" aria-labelledby="modalAlertaLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="modalAlertaLabel">Notificación</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="modalAlertaContenido"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Aceptar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modalAlerta = document.getElementById('modalAlerta');
    }

    // Configurar el contenido del modal según el tipo de alerta
    const modalContenido = document.getElementById('modalAlertaContenido');
    modalContenido.className = `alert alert-${tipo} mb-0`;
    modalContenido.innerHTML = mensaje;

    // Mostrar el modal
    const modal = new bootstrap.Modal(modalAlerta);
    modal.show();

    // Auto-cerrar después de 5 segundos solo si no es un error
    if (tipo !== 'danger') {
        setTimeout(() => {
            modal.hide();
        }, 5000);
    }
}

// Función para descargar archivo Excel
async function descargarArchivoExcel() {
    try {
        console.log('Iniciando descarga de archivo Excel...');
        
        // Obtener fechas de los filtros
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        
        if (!fechaInicio || !fechaFin) {
            mostrarAlerta('warning', 'Por favor seleccione un rango de fechas válido');
            return;
        }

        // Validar que la fecha inicial no sea mayor que la final
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            mostrarAlerta('warning', 'La fecha inicial no puede ser mayor que la fecha final');
            return;
        }
        
        // Mostrar indicador de carga
        document.getElementById('loadingIndicator').style.display = 'flex';
        
        // Realizar petición al servidor
        const response = await fetch(`/facturasExcel/descargar?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`);
        
        // Verificar si la respuesta es exitosa
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.mensaje || `Error del servidor: ${response.status}`);
        }
        
        // Verificar el tipo de contenido
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(errorData.mensaje || 'Error al generar el archivo Excel');
        }
        
        // Obtener el nombre del archivo del header
        const contentDisposition = response.headers.get('content-disposition');
        const nombreArchivo = contentDisposition
            ? contentDisposition.split('filename=')[1].replace(/"/g, '')
            : `facturas_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Descargar archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('Archivo Excel descargado exitosamente');
        mostrarAlerta('success', 'Archivo Excel descargado exitosamente');
        
    } catch (error) {
        console.error('Error al descargar archivo Excel:', error);
        mostrarAlerta('danger', `Error al descargar archivo Excel: ${error.message}`);
    } finally {
        // Ocultar indicador de carga
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Función para cargar resultados desde Excel
async function cargarResultados() {
    try {
        console.log('Iniciando carga de resultados desde Excel...');
        
        // Verificar si hay un archivo seleccionado
        const archivoInput = document.getElementById('archivoResultado');
        if (!archivoInput.files || archivoInput.files.length === 0) {
            mostrarAlerta('warning', 'Por favor seleccione un archivo Excel');
            return;
        }
        
        const archivo = archivoInput.files[0];
        
        // Verificar extensión del archivo
        if (!archivo.name.match(/\.(xlsx|xls)$/i)) {
            mostrarAlerta('warning', 'Por favor seleccione un archivo Excel válido (.xlsx o .xls)');
            return;
        }
        
        // Verificar tamaño del archivo (máximo 10MB)
        if (archivo.size > 10 * 1024 * 1024) {
            mostrarAlerta('warning', 'El archivo es demasiado grande. El tamaño máximo permitido es 10MB');
            return;
        }
        
        // Mostrar indicador de carga
        document.getElementById('loadingIndicator').style.display = 'flex';
        
        // Crear FormData y agregar archivo
        const formData = new FormData();
        formData.append('archivo', archivo);
        
        // Realizar petición al servidor
        const response = await fetch('/facturasExcel/cargar', {
            method: 'POST',
            body: formData
        });
        
        const resultado = await response.json();
        
        if (!resultado.success) {
            throw new Error(resultado.mensaje || 'Error al procesar archivo');
        }
        
        console.log('Resultados cargados exitosamente:', resultado);
        mostrarAlerta('success', resultado.mensaje);
        
        // Limpiar input de archivo
        archivoInput.value = '';
        
        // Recargar página para mostrar cambios
        setTimeout(() => {
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('Error al cargar resultados:', error);
        mostrarAlerta('danger', `Error al cargar resultados: ${error.message}`);
    } finally {
        // Ocultar indicador de carga
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Inicializar los filtros cuando el documento esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando filtros en tiempo real...');
    const filtrosEstadoFactura = document.querySelectorAll('input[name="filtroEstadoFactura"]');
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    const filtrosTipo = document.querySelectorAll('input[name="filtroTipo"]');
    const filtrosSolicitud = document.querySelectorAll('input[name="filtroSolicitud"]');
    const btnFiltrar = document.getElementById('btnFiltrar');
    
    // Ocultar el botón de filtrar ya que ahora aplicamos los filtros automáticamente
    if (btnFiltrar) {
        btnFiltrar.style.display = 'none';
    }
    
    // Agregar listeners a todos los radio buttons de estado factura
    if (filtrosEstadoFactura && filtrosEstadoFactura.length > 0) {
        console.log(`Encontrados ${filtrosEstadoFactura.length} botones de estado factura`);
        filtrosEstadoFactura.forEach(radio => {
            radio.addEventListener('change', function() {
                console.log('Filtro estado factura cambiado:', this.value);
                aplicarFiltros(true);
            });
        });
    } else {
        console.error('No se encontraron botones de estado factura');
    }
    
    // Agregar listeners a las fechas
    if (fechaInicio) {
        console.log('Agregando listener a fechaInicio');
        fechaInicio.addEventListener('change', function() {
            console.log('Fecha inicio cambiada:', this.value);
            aplicarFiltros(true);
        });
    }
    
    if (fechaFin) {
        console.log('Agregando listener a fechaFin');
        fechaFin.addEventListener('change', function() {
            console.log('Fecha fin cambiada:', this.value);
            aplicarFiltros(true);
        });
    }
    
    // Agregar listeners a todos los radio buttons de tipo
    if (filtrosTipo && filtrosTipo.length > 0) {
        console.log(`Encontrados ${filtrosTipo.length} botones de tipo`);
        filtrosTipo.forEach(radio => {
            radio.addEventListener('change', function() {
                console.log('Filtro tipo cambiado:', this.value);
                aplicarFiltros(true);
            });
        });
    } else {
        console.error('No se encontraron botones de tipo');
    }
    
    // Agregar listeners a todos los radio buttons de solicitud
    if (filtrosSolicitud && filtrosSolicitud.length > 0) {
        console.log(`Encontrados ${filtrosSolicitud.length} botones de solicitud`);
        filtrosSolicitud.forEach(radio => {
            radio.addEventListener('change', function() {
                console.log('Filtro solicitud cambiado:', this.value);
                aplicarFiltros(true);
            });
        });
    } else {
        console.error('No se encontraron botones de solicitud');
    }
    
    // Event listener para el botón de descargar Excel
    const btnDescargarExcel = document.getElementById('btnDescargarExcel');
    if (btnDescargarExcel) {
        btnDescargarExcel.addEventListener('click', descargarArchivoExcel);
    }
    
    // Event listener para el botón de cargar resultados
    const btnCargarResultado = document.getElementById('btnCargarResultado');
    if (btnCargarResultado) {
        btnCargarResultado.addEventListener('click', cargarResultados);
    }
    
    // Aplicar filtros iniciales
    console.log('Aplicando filtros iniciales...');
    setTimeout(function() {
        aplicarFiltros(false);
    }, 500);
}); 