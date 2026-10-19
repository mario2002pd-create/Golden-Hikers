import '@fontsource/anton/400.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';
import { num, fecha, esc } from '../scripts/lib/formato.mjs';

const ESTILO = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const BASE = import.meta.env.BASE_URL;
const ICONO_MAPA =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const COLOR = { ambar: '#ffb627', naranja: '#ff7a1a', dorado: '#ff5a00', claro: '#fff1d6' };

const anio = (r) => (r.fecha ? Number(r.fecha.slice(0, 4)) : null);


// ---------- estado ----------

const estado = {
  rutas: [],
  porId: new Map(),
  anio: 'todos',
  orden: 'fecha',
  modo: 'rutas',
  seleccionada: null,
  maxDesnivel: 1,
  masLarga: null,
  masDesnivel: null,
};

let maplibregl;
let mapa;
let popup;
let mapaListo = false;

// ---------- portada: sierras dibujadas con los perfiles reales ----------

function pintarSierras(rutas) {
  const svg = document.getElementById('sierras');
  const perfiles = rutas.map((r) => r.perfil ?? []).filter((p) => p.length > 1);
  if (!perfiles.length) return;
  // Tres capas: al fondo los perfiles al revés, en medio en orden y delante desplazados.
  const capas = [
    { valores: perfiles.slice().reverse().flatMap((p) => p.slice().reverse()), arriba: 118, abajo: 236, relleno: 'url(#sierra-lejos)' },
    { valores: perfiles.flat(), arriba: 176, abajo: 280, relleno: 'url(#sierra-medio)' },
    { valores: (() => { const v = perfiles.flat(); const k = Math.floor(v.length * 0.4); return v.slice(k).concat(v.slice(0, k)); })(), arriba: 236, abajo: 312, relleno: '#0b0907' },
  ];
  const caminos = capas.map(({ valores, arriba, abajo, relleno }) => {
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const n = valores.length;
    const pts = valores.map((v, i) => {
      const x = (i / (n - 1)) * 1000;
      const y = abajo - ((v - min) / (max - min || 1)) * (abajo - arriba);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<path d="M0,320 L${pts.join(' L')} L1000,320 Z" fill="${relleno}" />`;
  });
  svg.innerHTML = `
    <defs>
      <linearGradient id="sierra-lejos" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7a1d17" /><stop offset="1" stop-color="#2a0f0b" />
      </linearGradient>
      <linearGradient id="sierra-medio" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a140e" /><stop offset="1" stop-color="#140c09" />
      </linearGradient>
    </defs>
    ${caminos.join('')}`;
}

// ---------- lista ----------

function pintarFiltroAnio() {
  const anios = [...new Set(estado.rutas.map(anio).filter(Boolean))].sort();
  const cont = document.getElementById('filtro-anio');
  const opciones = [['todos', 'Todos'], ...anios.map((a) => [String(a), String(a)])];
  cont.innerHTML = opciones
    .map(([v, t]) => `<button type="button" data-anio="${v}" aria-pressed="${v === estado.anio}">${t}</button>`)
    .join('');
}

function rutasVisibles() {
  return estado.rutas.filter((r) => estado.anio === 'todos' || String(anio(r)) === estado.anio);
}

function ordenar(rutas) {
  const copia = [...rutas];
  if (estado.orden === 'km') copia.sort((a, b) => b.km - a.km || a.id - b.id);
  else if (estado.orden === 'desnivel') copia.sort((a, b) => b.desnivel - a.desnivel || a.id - b.id);
  else copia.sort((a, b) => a.id - b.id);
  return copia;
}

function filaRuta(r) {
  const etiquetas = [];
  if (r.id === estado.masLarga) etiquetas.push('La más larga');
  if (r.id === estado.masDesnivel) etiquetas.push('Más desnivel');
  const ancho = Math.max(3, Math.round((r.desnivel / estado.maxDesnivel) * 100));
  return `
    <li class="ruta${r.id === estado.seleccionada ? ' activa' : ''}" data-id="${r.id}">
      <a class="ruta-enlace" href="${BASE}${r.url}">
        <span class="ruta-n">${r.id}</span>
        <span class="ruta-texto">
          <span class="ruta-nombre">${esc(r.nombre)}${etiquetas.map((e) => ` <em class="etiqueta">${e}</em>`).join('')}</span>
          <span class="ruta-fecha">${fecha(r.fecha)}</span>
        </span>
        <span class="ruta-datos">
          <span class="ruta-km">${num(r.km, 2)} km</span>
          <span class="ruta-desnivel"><i class="barra" aria-hidden="true"><b style="width:${ancho}%"></b></i>${num(r.desnivel)} m</span>
        </span>
      </a>
      <button type="button" class="ruta-mapa" data-id="${r.id}" aria-pressed="${r.id === estado.seleccionada}" aria-label="Ver ${esc(r.nombre)} en el mapa" title="Ver en el mapa">${ICONO_MAPA}</button>
    </li>`;
}

function pintarLista() {
  const grupos = new Map();
  for (const r of ordenar(rutasVisibles())) {
    const a = anio(r) ?? 'Sin fecha';
    if (!grupos.has(a)) grupos.set(a, []);
    grupos.get(a).push(r);
  }
  const claves = [...grupos.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  const html = claves
    .map((a) => {
      const rutas = grupos.get(a);
      return `
        <section class="grupo">
          <h3 class="grupo-titulo">${a} <span>· ${rutas.length} ${rutas.length === 1 ? 'ruta' : 'rutas'}</span></h3>
          <ol class="rutas">${rutas.map(filaRuta).join('')}</ol>
        </section>`;
    })
    .join('');
  document.getElementById('lista').innerHTML = html || '<p class="vacio">Todavía no hay rutas.</p>';
}

function marcarBotones(cont, atributo, valor) {
  for (const b of cont.querySelectorAll(`[${atributo}]`)) b.setAttribute('aria-pressed', String(b.getAttribute(atributo) === valor));
}

// ---------- mapa ----------

/** Puntos repartidos cada `paso` metros por cada track, para el mapa de calor. */
function puntosCalor(rutas, paso = 40) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const features = [];
  for (const r of rutas) {
    const t = r.track;
    let resto = 0;
    for (let i = 1; i < t.length; i++) {
      const [lon1, lat1] = t[i - 1];
      const [lon2, lat2] = t[i];
      const dx = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad) * R;
      const dy = (lat2 - lat1) * rad * R;
      const largo = Math.hypot(dx, dy);
      let d = resto;
      while (d < largo) {
        const f = d / largo;
        features.push({
          type: 'Feature',
          properties: { anio: anio(r) },
          geometry: { type: 'Point', coordinates: [lon1 + f * (lon2 - lon1), lat1 + f * (lat2 - lat1)] },
        });
        d += paso;
      }
      resto = d - largo;
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Tramos andados en hora dorada (ya vienen recortados del build). */
function tramosDorados(rutas) {
  return {
    type: 'FeatureCollection',
    features: rutas
      .filter((r) => r.dorado?.length)
      .map((r) => ({
        type: 'Feature',
        properties: { id: r.id, anio: anio(r) },
        geometry: { type: 'MultiLineString', coordinates: r.dorado },
      })),
  };
}

function lineasRutas(rutas) {
  return {
    type: 'FeatureCollection',
    features: rutas
      .filter((r) => r.track.length > 1)
      .map((r) => ({
        type: 'Feature',
        id: r.id,
        properties: { id: r.id, anio: anio(r) },
        geometry: { type: 'LineString', coordinates: r.track },
      })),
  };
}

function limites(rutas) {
  const conBbox = rutas.filter((r) => r.bbox);
  if (!conBbox.length) return null;
  return [
    [Math.min(...conBbox.map((r) => r.bbox[0])), Math.min(...conBbox.map((r) => r.bbox[1]))],
    [Math.max(...conBbox.map((r) => r.bbox[2])), Math.max(...conBbox.map((r) => r.bbox[3]))],
  ];
}

const relleno = () => (window.innerWidth < 640 ? 32 : 56);

function encuadrar(rutas, animar = true) {
  const b = limites(rutas);
  if (b && mapa) mapa.fitBounds(b, { padding: relleno(), maxZoom: 14, duration: animar ? 800 : 0 });
}

function contenidoPopup(r) {
  return `
    <strong>${esc(r.nombre)}</strong>
    <span class="popup-fecha">${fecha(r.fecha)}</span>
    <span class="popup-datos">${num(r.km, 2)} km · ${num(r.desnivel)} m D+</span>
    <a class="popup-enlace" href="${BASE}${r.url}">Ver la ficha →</a>`;
}

function resaltar(id) {
  if (!mapaListo) return;
  mapa.setFilter('rutas-resaltada', ['==', ['get', 'id'], id ?? -1]);
  mapa.setFilter('rutas-resaltada-halo', ['==', ['get', 'id'], id ?? -1]);
}

function mostrarPopup(r, lngLat) {
  popup.setLngLat(lngLat).setHTML(contenidoPopup(r)).addTo(mapa);
}

function quitarResalte() {
  resaltar(estado.seleccionada);
  if (estado.seleccionada == null) popup.remove();
  else {
    const r = estado.porId.get(estado.seleccionada);
    mostrarPopup(r, puntoMedio(r));
  }
}

function puntoMedio(r) {
  return r.track[Math.floor(r.track.length / 2)];
}

function filtroAnio() {
  return estado.anio === 'todos' ? null : ['==', ['get', 'anio'], Number(estado.anio)];
}

function aplicarFiltroMapa() {
  if (!mapaListo) return;
  for (const capa of ['rutas-halo', 'rutas-linea', 'dorado-halo', 'dorado-linea', 'rutas-impacto', 'calor']) mapa.setFilter(capa, filtroAnio());
}

function aplicarModo() {
  if (!mapaListo) return;
  const rutas = estado.modo === 'rutas' ? 'visible' : 'none';
  mapa.setLayoutProperty('rutas-halo', 'visibility', rutas);
  mapa.setLayoutProperty('rutas-linea', 'visibility', rutas);
  mapa.setLayoutProperty('dorado-halo', 'visibility', rutas);
  mapa.setLayoutProperty('dorado-linea', 'visibility', rutas);
  mapa.setLayoutProperty('calor', 'visibility', estado.modo === 'calor' ? 'visible' : 'none');
  document.querySelector('.mapa-marco').classList.toggle('modo-calor', estado.modo === 'calor');
}

async function iniciarMapa() {
  // MapLibre pesa: se carga aparte para que la portada salga a la primera.
  const [lib, { default: urlWorker }] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
  ]);
  maplibregl = lib;
  maplibregl.setWorkerUrl(urlWorker);
  const tactil = window.matchMedia('(pointer: coarse)').matches;
  mapa = new maplibregl.Map({
    container: 'mapa',
    style: ESTILO,
    center: [-1.65, 42.8],
    zoom: 8,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: tactil,
    locale: {
      'NavigationControl.ZoomIn': 'Acercar',
      'NavigationControl.ZoomOut': 'Alejar',
      'NavigationControl.ResetBearing': 'Orientar al norte',
      'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
      'AttributionControl.MapFeedback': 'Sugerir mejoras del mapa',
      'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para hacer zoom en el mapa',
      'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para hacer zoom en el mapa',
      'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
    },
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '240px', className: 'popup-ruta' });

  const b = limites(estado.rutas);
  if (b) mapa.fitBounds(b, { padding: relleno(), maxZoom: 14, duration: 0 });

  mapa.on('load', () => {
    // Etiquetas del mapa base más apagadas: el protagonismo es de los tracks.
    for (const capa of mapa.getStyle().layers) {
      if (capa.type === 'symbol') mapa.setPaintProperty(capa.id, 'text-opacity', 0.55);
    }
    mapa.addSource('rutas', { type: 'geojson', data: lineasRutas(estado.rutas) });
    mapa.addSource('calor', { type: 'geojson', data: puntosCalor(estado.rutas) });
    mapa.addSource('dorado', { type: 'geojson', data: tramosDorados(estado.rutas) });

    mapa.addLayer({
      id: 'calor',
      type: 'heatmap',
      source: 'calor',
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 1.2, 15, 2],
        'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 7, 4, 11, 10, 14, 22, 17, 60],
        'heatmap-opacity': 0.9,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(255,182,39,0)',
          0.1, 'rgba(255,182,39,0.35)',
          0.3, '#ffb627',
          0.55, '#ff7a1a',
          0.8, '#e2421b',
          1, '#c81d25',
        ],
      },
    });
    mapa.addLayer({
      id: 'rutas-halo',
      type: 'line',
      source: 'rutas',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COLOR.naranja,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 7, 14, 16],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 12],
        'line-opacity': 0.5,
      },
    });
    mapa.addLayer({
      id: 'rutas-linea',
      type: 'line',
      source: 'rutas',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COLOR.ambar,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 3.5],
        'line-opacity': 0.95,
      },
    });
    // Hora dorada: los tramos andados entre goldenHour y la puesta, en naranja intenso.
    mapa.addLayer({
      id: 'dorado-halo',
      type: 'line',
      source: 'dorado',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COLOR.dorado,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 22],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 14],
        'line-opacity': 0.6,
      },
    });
    mapa.addLayer({
      id: 'dorado-linea',
      type: 'line',
      source: 'dorado',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COLOR.dorado,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 5],
      },
    });
    mapa.addLayer({
      id: 'rutas-resaltada-halo',
      type: 'line',
      source: 'rutas',
      filter: ['==', ['get', 'id'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR.naranja, 'line-width': 14, 'line-blur': 8, 'line-opacity': 0.7 },
    });
    mapa.addLayer({
      id: 'rutas-resaltada',
      type: 'line',
      source: 'rutas',
      filter: ['==', ['get', 'id'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR.claro, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 5] },
    });
    // Capa invisible y ancha para que sea fácil acertar con el dedo o el ratón.
    mapa.addLayer({
      id: 'rutas-impacto',
      type: 'line',
      source: 'rutas',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000', 'line-width': tactil ? 28 : 16, 'line-opacity': 0.01 },
    });

    // Los tramos dorados, por encima del resalte: así se ve en qué parte de la ruta se puso el sol.
    mapa.moveLayer('dorado-halo', 'rutas-impacto');
    mapa.moveLayer('dorado-linea', 'rutas-impacto');

    mapaListo = true;
    aplicarFiltroMapa();
    aplicarModo();
    resaltar(estado.seleccionada);

    let encima = null;
    mapa.on('mousemove', 'rutas-impacto', (e) => {
      const id = e.features[0]?.properties.id;
      if (id == null) return;
      mapa.getCanvas().style.cursor = 'pointer';
      if (id !== encima) {
        encima = id;
        resaltar(id);
      }
      mostrarPopup(estado.porId.get(id), e.lngLat);
    });
    mapa.on('mouseleave', 'rutas-impacto', () => {
      encima = null;
      mapa.getCanvas().style.cursor = '';
      quitarResalte();
    });
    mapa.on('click', (e) => {
      const f = mapa.queryRenderedFeatures(e.point, { layers: ['rutas-impacto'] })[0];
      if (f) {
        seleccionar(f.properties.id, { encuadrar: false, lngLat: e.lngLat, desplazar: true });
      } else {
        seleccionar(null);
      }
    });
  });
}

function seleccionar(id, { encuadrar: zoom = false, lngLat = null, desplazar = false } = {}) {
  estado.seleccionada = id;
  for (const fila of document.querySelectorAll('.ruta')) {
    const activa = Number(fila.dataset.id) === id;
    fila.classList.toggle('activa', activa);
    fila.querySelector('.ruta-mapa')?.setAttribute('aria-pressed', String(activa));
  }
  if (!mapa) return;
  resaltar(id);
  if (id == null) {
    popup.remove();
    return;
  }
  const r = estado.porId.get(id);
  if (zoom && r.bbox) {
    mapa.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: relleno() + 16, maxZoom: 15, duration: 900 });
  }
  if (r.track.length) mostrarPopup(r, lngLat ?? puntoMedio(r));
  if (desplazar) {
    const fila = document.querySelector(`.ruta[data-id="${id}"]`);
    if (fila && window.matchMedia('(min-width: 960px)').matches) fila.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ---------- eventos ----------

function enlazar() {
  document.querySelector('.bloque-mapa .conmutador').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    estado.modo = b.dataset.modo;
    marcarBotones(e.currentTarget, 'data-modo', estado.modo);
    aplicarModo();
  });
  document.getElementById('filtro-anio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-anio]');
    if (!b) return;
    estado.anio = b.dataset.anio;
    marcarBotones(e.currentTarget, 'data-anio', estado.anio);
    const sel = estado.porId.get(estado.seleccionada);
    if (sel && estado.anio !== 'todos' && String(anio(sel)) !== estado.anio) seleccionar(null);
    pintarLista();
    aplicarFiltroMapa();
    encuadrar(rutasVisibles());
  });
  document.getElementById('filtro-orden').addEventListener('click', (e) => {
    const b = e.target.closest('[data-orden]');
    if (!b) return;
    estado.orden = b.dataset.orden;
    marcarBotones(e.currentTarget, 'data-orden', estado.orden);
    pintarLista();
  });
  // La fila enlaza a la ficha; el botón de la diana lleva la ruta al mapa.
  document.getElementById('lista').addEventListener('click', (e) => {
    const b = e.target.closest('.ruta-mapa');
    if (!b) return;
    const id = Number(b.dataset.id);
    seleccionar(id, { encuadrar: true });
    // En el móvil el mapa queda arriba: lo traemos a la vista.
    if (!window.matchMedia('(min-width: 960px)').matches) {
      document.querySelector('.bloque-mapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// ---------- arranque ----------

async function arrancar() {
  let datos;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}rutas.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.statusText);
    datos = await res.json();
  } catch {
    document.getElementById('lista').innerHTML =
      '<p class="vacio">No se han podido cargar las rutas. Si estás en local, ejecuta <code>npm run datos</code>.</p>';
    return;
  }
  estado.rutas = datos.rutas;
  estado.porId = new Map(datos.rutas.map((r) => [r.id, r]));
  estado.maxDesnivel = Math.max(1, ...datos.rutas.map((r) => r.desnivel));
  if (datos.rutas.length > 1) {
    estado.masLarga = datos.rutas.reduce((a, b) => (b.km > a.km ? b : a)).id;
    estado.masDesnivel = datos.rutas.reduce((a, b) => (b.desnivel > a.desnivel ? b : a)).id;
  }

  // Las cifras, el rango de fechas y la fecha de actualización ya vienen en el HTML (build).
  pintarSierras(datos.rutas);
  pintarFiltroAnio();
  pintarLista();
  enlazar();
  iniciarMapa();
}

arrancar();
