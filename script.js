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
const toggleResumenBtn = document.getElementById('toggleResumen'); 


// ====================================================================
// INICIALIZACIÓN DE LEAFLET
// ====================================================================

const map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true
}).setView([-17.0, -64.0], 6); 

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// ====================================================================
// FUNCIONES DE UTILIDAD Y CÁLCULO
// ====================================================================

function getColor(ganador) {
    const partido = candidatosActuales.find(c => c.clave === ganador);
    return partido ? partido.color : "lightgray";
}

function calcularResultados(props, esNacional = false) {
    let votosTotales = 0;
    
    // Si es cálculo nacional, el total general ya está precalculado
    if (!esNacional) {
        votosTotales = candidatosActuales.reduce((sum, c) => sum + (props[c.clave] || 0), 0);
    } else {
        votosTotales = props.totalGeneral;
    }

    const resultados = candidatosActuales.map(c => {
        const votos = esNacional ? (props.totalVotos[c.clave] || 0) : (props[c.clave] || 0);
        // Aseguramos que el porcentaje sea 0 si no hay votos totales para evitar NaN/Infinity
        const porcentaje = votosTotales > 0 ? (votos / votosTotales) * 100 : 0;
            
        return {
            ...c,
            votos: votos,
            porcentaje: porcentaje
        };
    }).sort((a, b) => b.porcentaje - a.porcentaje);

    return resultados;
}

function cargarDatos(url) { 
    fetch(url) 
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}. Asegúrese que el archivo ${url} existe.`);
            return res.json();
        })
        .then(data => { 
            allData = data; 
            if (url === geojsonUrlPrimera) {
                cargarOpcionesDepartamentos(data); 
            }
            mostrarDatos(data); 
            // 💡 CORRECCIÓN 2: Llamar actualizarResumen con TODOS los datos para incluir el exterior
            actualizarResumen(allData.features); 
            departamentoFiltro.value = 'todos';
            map.setView([-17.0, -64.0], 6);
        })
        .catch(error => {
            console.error("Error al cargar o parsear el GeoJSON:", error);
            alert(`Error al cargar los datos de ${turnoActual} vuelta. Revise la consola para detalles.`);
        }); 
}

function cargarOpcionesDepartamentos(data) {
    const departamentos = new Set(data.features.map(f => f.properties.departamen));
    departamentoFiltro.innerHTML = '<option value="todos">Todos los Departamentos</option>';
    [...departamentos].sort().forEach(dep => {
        // Excluir departamentos sin nombre si es que existen
        if (dep && dep !== '') {
            const option = document.createElement('option');
            option.value = dep;
            option.textContent = dep;
            departamentoFiltro.appendChild(option);
        }
    });
}

function mostrarDatos(data) {
    if (geojsonLayer) map.removeLayer(geojsonLayer);

    // Filtrar features solo con geometría (municipios) para el mapa,
    // ignorando features sin geometría (como el total del exterior)
    const featuresMapeables = data.features.filter(f => f.geometry);


    featuresMapeables.forEach(f => {
        const props = f.properties;
        let maxVotos = -1;
        let ganadorKey = null;
        let votosTotales = 0; // Inicializar la suma de votos totales

        candidatosActuales.forEach(c => {
            const votos = props[c.clave] || 0;
            votosTotales += votos; // Acumular los votos

            if (votos > maxVotos) {
                maxVotos = votos;
                ganadorKey = c.clave;
            }
        });

        // 💡 CORRECCIÓN 1: Determinar el ganador. Si votosTotales es 0, usar clave especial para gris plomo.
        props.ganador = (votosTotales === 0) ? "VOTOS_CERO" : ganadorKey;
    });

    geojsonLayer = L.geoJSON({ ...data, features: featuresMapeables }, {
        style: feature => {
            let fillColor;
            // 💡 CORRECCIÓN 1: Aplicación del Gris Plomo
            if (feature.properties.ganador === "VOTOS_CERO") {
                fillColor = '#808080'; // Gris Plomo
            } else {
                fillColor = getColor(feature.properties.ganador);
            }

            return {
                fillColor: fillColor,
                weight: 1,
                color: 'white',
                fillOpacity: 0.4, 
                dashArray: '3'
            };
        },
        onEachFeature: onEachFeatureHandler
    }).addTo(map);
}

function onEachFeatureHandler(feature, layer) {
    const props = feature.properties;
    const resultados = calcularResultados(props, false);

    const barrasSVG = resultados.map((r, i) => {
        // Lógica de renderizado SVG para el tooltip (permanece sin cambios)
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

function actualizarResumen(features) {
    const totalVotos = {};
    candidatosActuales.forEach(c => totalVotos[c.clave] = 0);

    // 💡 CORRECCIÓN 2: Si el filtro es "Todos", usamos allData.features (que incluye el exterior).
    // Si se aplicó un filtro, las features filtradas ya contienen los datos a sumar para la vista.
    const dataForSummary = (departamentoFiltro.value === 'todos' && allData) ? allData.features : features;
    
    // Sumar votos de todas las features consideradas (municipios + exterior)
    dataForSummary.forEach(f => {
        candidatosActuales.forEach(c => {
            const votos = f.properties[c.clave] || 0;
            totalVotos[c.clave] += votos;
        });
    });
    
    const totalGeneral = Object.values(totalVotos).reduce((a, b) => a + b, 0);
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
    const filtroNombre = departamentoFiltro.value === 'todos' ? 'Nacional' : departamentoFiltro.value;
    resumenTitulo.textContent = `Resumen ${filtroNombre} - ${turnoActual === "primera" ? "Primera Vuelta" : "Segunda Vuelta"}`;
    
    resumenDesc.innerHTML = `
        <span style="display: block; margin-bottom: 5px;">
            Elecciones presidenciales Bolivia 2025. Los datos de segunda vuelta fueron acutalizados a hrs 14:26 del 20/10/2025, cargados al 58,57%.
        </span>
        <span style="display: block; font-weight: 600;">
            Total General: <strong>${totalGeneral.toLocaleString('es-ES')}</strong>.
        </span>
        
        <span style="display: block; margin-top: 10px; font-size: 11px; color: #777;">
            Fuente de Datos: 
            <a href="https://computo.oep.org.bo/" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 700;">
                Cómputo Oficial OEP
            </a>
        </span>
    `;
}

/**
 * Función que alterna la visibilidad del panel de resumen y ajusta el botón.
 */
function toggleResumenPanel() {
    const esOculto = resumenContainer.classList.toggle('oculto');
    const icono = toggleResumenBtn.querySelector('i');
    
    if (esOculto) {
        // Panel ahora oculto: Muestra el ícono de flecha (abrir)
        icono.className = 'fas fa-chevron-right';
        toggleResumenBtn.classList.add('oculto-mode');
        toggleResumenBtn.setAttribute('aria-label', 'Mostrar Resumen');
    } else {
        // Panel ahora visible: Muestra el ícono de flecha izquierda (cerrar)
        icono.className = 'fas fa-chevron-left';
        toggleResumenBtn.classList.remove('oculto-mode');
        toggleResumenBtn.setAttribute('aria-label', 'Ocultar Resumen');
    }
}


// ====================================================================
// MANEJO DE EVENTOS Y ARRANQUE
// ====================================================================

toggleResumenBtn.addEventListener('click', toggleResumenPanel);

departamentoFiltro.addEventListener('change', () => {
    const val = departamentoFiltro.value;
    
    const aplicarFiltro = (depValue) => {
        if (depValue === 'todos') {
            map.setView([-17.0, -64.0], 6);
            mostrarDatos(allData);
            // Pasar todos los datos (incluyendo exterior)
            actualizarResumen(allData.features); 
        } else {
            // Filtrar solo las features con el departamento seleccionado y la feature del exterior si existe
            // Nota: Aquí se asume que los datos del exterior tienen un valor de 'departamen' distinto al del filtro.
            const featuresFiltradas = allData.features.filter(f => f.properties.departamen === depValue || f.geometry === null);

            // Filtra las features visibles para el mapa (solo las que tienen geometría)
            const featuresMapeables = featuresFiltradas.filter(f => f.geometry);
            
            const filtrado = { ...allData, features: featuresMapeables };

            const tempLayer = L.geoJSON(filtrado);
            if (tempLayer.getLayers().length > 0) {
                 map.fitBounds(tempLayer.getBounds(), { padding: [20, 20] });
            }
            mostrarDatos(filtrado);
            // 💡 CORRECCIÓN 2: Pasar las features filtradas (que pueden incluir la feature del exterior sin geometría)
            actualizarResumen(featuresFiltradas);
        }
    };
    
    aplicarFiltro(val);
});

btnFiltro.addEventListener('click', () => {
    departamentoFiltro.value = 'todos'; 
    departamentoFiltro.dispatchEvent(new Event('change')); 
});

btnSegundaVuelta.addEventListener('click', () => { 
    let nuevaURL;
    
    if (turnoActual === "primera") { 
        turnoActual = "segunda"; 
        candidatosActuales = candidatosSegunda; 
        nuevaURL = geojsonUrlSegunda; 
        btnSegundaVuelta.textContent = "Primera Vuelta";
        resumenContainer.style.borderColor = '#d02d25';
    } else { 
        turnoActual = "primera"; 
        candidatosActuales = candidatosPrimera; 
        nuevaURL = geojsonUrlPrimera; 
        btnSegundaVuelta.textContent = "Segunda Vuelta";
        resumenContainer.style.borderColor = 'transparent';
    } 

    cargarDatos(nuevaURL);
}); 


document.addEventListener('DOMContentLoaded', () => {
    // Configuración inicial para móvil/escritorio
    if (window.innerWidth <= 768) {
        // Móvil: Oculta el panel e inicializa el botón como "Mostrar"
        resumenContainer.classList.add('oculto');
        toggleResumenBtn.classList.add('oculto-mode');
        toggleResumenBtn.querySelector('i').className = 'fas fa-chevron-right'; 
        toggleResumenBtn.setAttribute('aria-label', 'Mostrar Resumen');
    } else {
        // Escritorio: Muestra el panel e inicializa el botón como "Cerrar"
        resumenContainer.classList.remove('oculto');
        toggleResumenBtn.classList.remove('oculto-mode');
        toggleResumenBtn.querySelector('i').className = 'fas fa-chevron-left'; 
        toggleResumenBtn.setAttribute('aria-label', 'Ocultar Resumen');
    }
    
    cargarDatos(geojsonUrlPrimera); 
});