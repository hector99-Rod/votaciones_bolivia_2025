// ====================================================================
// CONFIGURACIÓN DE DATOS Y VARIABLES GLOBALES
// ====================================================================

// Mapa de colores y nombres para los partidos de la Primera Vuelta
const candidatosPrimera = [
    { clave: "v_POPULAR", nombre: "Alianza Popular", color: '#00f7ff' }, 
    { clave: "v_ADN", nombre: "Lib. y Progreso", color: '#f3bad4' },     
    { clave: "v_SUMATE", nombre: "SUMATE", color: '#a86af3' },           
    { clave: "v_LIBRE", nombre: "LIBRE", color: '#d02d25' },             
    { clave: "v_UCS", nombre: "Fuerza del Pueblo", color: '#212121' },   
    { clave: "v_MAS", nombre: "MAS", color: '#4575b4' },                 
    { clave: "v_UNIDAD", nombre: "UNIDAD", color: '#f3e442' },           
    { clave: "v_PDC", nombre: "PDC", color: '#1a9850' }                  
];

// Mapa de colores y nombres para los partidos de la Segunda Vuelta
const candidatosSegunda = [
    { clave: "v_LIBRE", nombre: "LIBRE", color: '#d02d25' }, 
    { clave: "v_PDC", nombre: "PDC", color: '#1a9850' }       
];

// Rutas de los archivos GeoJSON
const geojsonUrlPrimera = "municipios_votacion.geojson"; 
// 🚨 ESTA ES LA RUTA QUE SE CARGARÁ PARA LA SEGUNDA VUELTA
const geojsonUrlSegunda = "municipios_votacion_segunda_vuelta.geojson"; 

// Variables de estado global
let allData = null; 
let geojsonLayer = null; 
let turnoActual = "primera"; 
let candidatosActuales = candidatosPrimera; 

// Referencias a elementos del DOM
const departamentoFiltro = document.getElementById('departamentoFiltro');
const resumenBarras = document.getElementById('resumenBarras');
const resumenContainer = document.getElementById('resumenContainer');
const btnFiltro = document.getElementById('btnFiltro');
const btnSegundaVuelta = document.getElementById('btnSegundaVuelta');
const resumenTitulo = resumenContainer.querySelector('h3');
const resumenDesc = resumenContainer.querySelector('p');


// ====================================================================
// INICIALIZACIÓN DE LEAFLET
// ====================================================================

const map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true
}).setView([-17.0, -64.0], 6); // Centrado en Bolivia, Zoom 6

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// ====================================================================
// FUNCIONES DE UTILIDAD
// ====================================================================

/**
 * Obtiene el color del partido ganador basado en la clave.
 * @param {string} ganador - La clave del partido ganador (e.g., 'v_MAS').
 * @returns {string} El código de color o gris por defecto.
 */
function getColor(ganador) {
    const partido = candidatosActuales.find(c => c.clave === ganador);
    return partido ? partido.color : "lightgray";
}

/**
 * Normaliza y calcula los resultados de votación (votos y porcentaje) 
 * para el conjunto de candidatos activos.
 * @param {object} props - Propiedades del feature GeoJSON o un objeto de totales.
 * @param {boolean} esNacional - Indica si se está calculando el total nacional/departamental.
 * @returns {Array<object>} Lista de resultados ordenada por porcentaje.
 */
function calcularResultados(props, esNacional = false) {
    let votosTotales = 0;
    
    if (!esNacional) {
         // Suma de votos de candidatos actuales para el total del municipio
         votosTotales = candidatosActuales.reduce((sum, c) => sum + (props[c.clave] || 0), 0);
    } else {
        // Usa el total general pre-calculado para el resumen nacional/departamental
        votosTotales = props.totalGeneral;
    }

    const resultados = candidatosActuales.map(c => {
        // Obtiene los votos del lugar correspondiente (feature o totales)
        const votos = esNacional ? (props.totalVotos[c.clave] || 0) : (props[c.clave] || 0);
        
        // El GeoJSON de la primera vuelta puede tener el porcentaje precalculado (si aplica)
        // Pero siempre es más seguro recalcular con el totalGeneral/votosTotales
        const porcentaje = votosTotales > 0 ? (votos / votosTotales) * 100 : 0;
            
        return {
            ...c,
            votos: votos,
            // Usamos el porcentaje calculado para consistencia
            porcentaje: porcentaje
        };
    }).sort((a, b) => b.porcentaje - a.porcentaje);

    return resultados;
}

// ====================================================================
// FUNCIONES DE CARGA Y VISUALIZACIÓN
// ====================================================================

/**
 * Carga el archivo GeoJSON desde la URL proporcionada.
 * Se llama al inicio y cada vez que se cambia de turno.
 * @param {string} url - La URL del archivo GeoJSON a cargar.
 */
function cargarDatos(url) { 
    fetch(url) 
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}. Asegúrese que el archivo ${url} existe.`);
            return res.json();
        })
        .then(data => { 
            allData = data; 
            
            // Solo cargar las opciones de departamento si estamos en la primera vuelta, 
            // ya que se asume que la estructura geográfica es la misma.
            if (url === geojsonUrlPrimera) {
                cargarOpcionesDepartamentos(data); 
            }
            
            // Visualizar y resumir con los datos nuevos
            mostrarDatos(data); 
            actualizarResumen(data.features); 
            
            // Restablecer el filtro visualmente
            departamentoFiltro.value = 'todos';
            map.setView([-17.0, -64.0], 6); // Re-centrar el mapa
        })
        .catch(error => {
            console.error("Error al cargar o parsear el GeoJSON:", error);
            alert(`Error al cargar los datos de ${turnoActual} vuelta. Revise la consola para detalles.`);
        }); 
}

/**
 * Llena el selector de departamentos. Solo se ejecuta una vez.
 * @param {object} data - El objeto GeoJSON completo.
 */
function cargarOpcionesDepartamentos(data) {
    const departamentos = new Set(data.features.map(f => f.properties.departamen));
    departamentoFiltro.innerHTML = '<option value="todos">Todos los Departamentos</option>';
    
    [...departamentos].sort().forEach(dep => {
        const option = document.createElement('option');
        option.value = dep;
        option.textContent = dep;
        departamentoFiltro.appendChild(option);
    });
}

/**
 * Dibuja o redibuja la capa GeoJSON en el mapa.
 * @param {object} data - El objeto GeoJSON (filtrado o completo).
 */
function mostrarDatos(data) {
    if (geojsonLayer) map.removeLayer(geojsonLayer);

    // Determinar el ganador dinámicamente según los candidatos del turno actual
    data.features.forEach(f => {
        const props = f.properties;
        let maxVotos = -1;
        let ganadorKey = null;

        candidatosActuales.forEach(c => {
            const votos = props[c.clave] || 0;
            if (votos > maxVotos) {
                maxVotos = votos;
                ganadorKey = c.clave;
            }
        });
        props.ganador = ganadorKey;
    });

    geojsonLayer = L.geoJSON(data, {
        style: feature => ({
            fillColor: getColor(feature.properties.ganador),
            weight: 1,
            color: 'white',
            fillOpacity: 0.4, // Nivel de transparencia (Opacidad del relleno)
            dashArray: '3'
        }),
        onEachFeature: onEachFeatureHandler
    }).addTo(map);
}

/**
 * Función que se ejecuta por cada feature para añadir interactividad y Tooltip.
 */
function onEachFeatureHandler(feature, layer) {
    const props = feature.properties;

    // Calcular resultados usando los datos del feature (municipio)
    const resultados = calcularResultados(props, false);

    // Generar el SVG para el Tooltip (mini-gráfico de barras)
    const barrasSVG = resultados.map((r, i) => {
        const y = i * 30;
        const barWidth = Math.min(r.porcentaje * 1.8, 140); 
        const imgUrl = `img/${r.clave}.png`;

        return ` 
            <g transform="translate(0, ${y})">
                <circle cx="10" cy="10" r="10" fill="white" stroke="#ccc" stroke-width="1"/>
                <image href="${imgUrl}" x="0" y="0" width="20" height="20" clip-path="circle(10px at 10px 10px)" /> 
                
                <text x="25" y="14" font-size="11" fill="#222" font-family="Nunito, sans-serif" font-weight="600">${r.nombre}</text> 

                <text x="120" y="7" font-size="9" fill="#000" fill-opacity="0.6" font-family="Nunito, sans-serif"> 
                    ${r.porcentaje.toFixed(1)}% 
                </text> 

                <rect x="120" y="10" width="140" height="10" fill="#e9ecef" rx="3" /> 
                <rect x="120" y="10" width="${barWidth}" height="10" fill="${r.color}" rx="3" /> 

                <text x="275" y="18" font-size="10" fill="#222" font-family="Nunito, sans-serif" text-anchor="end" font-weight="700"> 
                    ${r.votos.toLocaleString('es-ES')} 
                </text> 
            </g> 
        `;
    }).join("");

    const alto = resultados.length * 30;

    const popupContent = ` 
        <div style="font-family: 'Nunito', sans-serif; font-size: 13px; color: #333;"> 
            <strong>${props.NombreMunicipio}</strong><br/>
            <small>(${props.departamen})</small>
            <hr style="margin: 5px 0; border-color: #eee;">
            <svg width="280" height="${alto}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Resultados de votación"> 
                ${barrasSVG} 
            </svg> 
        </div> 
    `;

    layer.bindTooltip(popupContent, {
        sticky: true,
        direction: 'auto',
        offset: [0, -10],
        opacity: 0.98,
        className: 'custom-tooltip'
    });

    layer.on('click', e => {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
    });
}


// ====================================================================
// FUNCIONES DEL RESUMEN (PANEL FLOTANTE)
// ====================================================================

/**
 * Actualiza el panel de resumen con los totales de votos del conjunto de features proporcionado.
 * @param {Array<object>} features - Array de features GeoJSON (filtrados o completos).
 */
function actualizarResumen(features) {
    const totalVotos = {};
    candidatosActuales.forEach(c => totalVotos[c.clave] = 0);
    let totalGeneral = 0;

    // 1. Sumar todos los votos para el conjunto de features
    features.forEach(f => {
        candidatosActuales.forEach(c => {
            const votos = f.properties[c.clave] || 0;
            totalVotos[c.clave] += votos;
            totalGeneral += votos;
        });
    });

    // 2. Calcular porcentajes y ordenar
    const resumenOrdenado = calcularResultados({ totalVotos, totalGeneral }, true);

    // 3. Generar y actualizar el HTML de las barras
    resumenBarras.innerHTML = resumenOrdenado.map(c => ` 
        <div class="barra-partido"> 
            <div class="barra-nombre-container">
                <img src="img/${c.clave}.png" alt="${c.nombre}" /> 
                <span class="barra-nombre">${c.nombre}</span>
            </div>
            <div class="barra-votos-porcentaje">
                <span class="barra-votos">${c.votos.toLocaleString('es-ES')}</span> 
                <span class="barra-porcentaje">${c.porcentaje.toFixed(2)}%</span>
            </div>
            <div class="barra-progreso-wrap"> 
                <div class="barra-progreso-fill" style="width:${c.porcentaje.toFixed(2)}%; background-color:${c.color};"></div> 
            </div> 
        </div> 
    `).join("");

    // 4. Actualizar título y descripción
    resumenTitulo.textContent = `Resumen Nacional - ${turnoActual === "primera" ? "Primera Vuelta" : "Segunda Vuelta"}`;
    resumenDesc.innerHTML = `Votos totales por partido. Total General: <strong>${totalGeneral.toLocaleString('es-ES')}</strong>.`;
}


// ====================================================================
// MANEJO DE EVENTOS
// ====================================================================

// Evento: Cambio en el filtro de departamento
departamentoFiltro.addEventListener('change', () => {
    const val = departamentoFiltro.value;
    
    const aplicarFiltro = (depValue) => {
        if (depValue === 'todos') {
            map.setView([-17.0, -64.0], 6);
            mostrarDatos(allData);
            actualizarResumen(allData.features);
        } else {
            const featuresFiltradas = allData.features.filter(f => f.properties.departamen === depValue);
            const filtrado = { ...allData, features: featuresFiltradas };

            const tempLayer = L.geoJSON(filtrado);
            if (tempLayer.getLayers().length > 0) {
                 map.fitBounds(tempLayer.getBounds(), { padding: [20, 20] });
            }
            mostrarDatos(filtrado);
            actualizarResumen(featuresFiltradas);
        }
    };
    
    aplicarFiltro(val);
});

// Evento: Botón "Mostrar Todos" (reinicia el filtro)
btnFiltro.addEventListener('click', () => {
    departamentoFiltro.value = 'todos'; 
    // Usamos el 'change' event para reutilizar la lógica de filtrado 'todos'
    departamentoFiltro.dispatchEvent(new Event('change')); 
});

// Evento: Botón "Segunda Vuelta" (alterna el estado y recarga el GeoJSON)
btnSegundaVuelta.addEventListener('click', () => { 
    let nuevaURL;
    
    if (turnoActual === "primera") { 
        turnoActual = "segunda"; 
        candidatosActuales = candidatosSegunda; 
        nuevaURL = geojsonUrlSegunda; // 👈 Carga el GeoJSON de la segunda vuelta
        btnSegundaVuelta.textContent = "Primera Vuelta";
        resumenContainer.style.borderColor = '#d02d25';
    } else { 
        turnoActual = "primera"; 
        candidatosActuales = candidatosPrimera; 
        nuevaURL = geojsonUrlPrimera; // 👈 Vuelve a cargar el GeoJSON de la primera vuelta
        btnSegundaVuelta.textContent = "Segunda Vuelta";
        resumenContainer.style.borderColor = 'transparent';
    } 

    // 📢 Llama a cargarDatos con la URL del turno correspondiente
    cargarDatos(nuevaURL);
}); 


// ====================================================================
// ARRANQUE DE LA APLICACIÓN
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Inicia la carga con el GeoJSON de la Primera Vuelta
    cargarDatos(geojsonUrlPrimera); 
});