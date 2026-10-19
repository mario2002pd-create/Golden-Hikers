import '@fontsource/anton/400.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';

import { num, horaLocal } from '../scripts/lib/formato.mjs';

const ESTILO = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const COLOR = { ambar: '#ffb627', naranja: '#ff7a1a', dorado: '#ff5a00' };

const datos = JSON.parse(document.getElementById('datos-ruta').textContent);
const m = datos.muestras;
const n = m.d.length;
const total = m.d[n - 1] || 1;

const perfil = document.getElementById('perfil');
const lienzo = perfil.querySelector('.perfil-lienzo');
const cursor = perfil.querySelector('.perfil-cursor');
const punto = perfil.querySelector('.perfil-cursor-punto');
const lectura = perfil.querySelector('.perfil-lectura');

let mapa;
let marcador;
let actual = null;

// ---------- perfil ----------

function mostrar(k) {
  if (k == null || k < 0 || k >= n) {
    cursor.hidden = true;
    lectura.textContent = '';
    marcador?.remove();
    actual = null;
    return;
  }
  actual = k;
  const x = (m.d[k] / total) * 100;
  cursor.hidden = false;
  cursor.style.left = `${x}%`;
  if (m.e[k] != null) {
    const y = (1 - (m.e[k] - datos.perfil.y0) / (datos.perfil.y1 - datos.perfil.y0)) * 100;
    punto.style.top = `${y}%`;
  }
  const partes = [`km ${num(m.d[k], 1)}`];
  if (m.e[k] != null) partes.push(`${num(m.e[k])} m`);
  if (m.m[k] != null && datos.inicio) partes.push(horaLocal(new Date(Date.parse(datos.inicio) + m.m[k] * 60000).toISOString()));
  if (m.o[k]) partes.push('en hora dorada');
  lectura.textContent = partes.join(' · ');
  cursor.classList.toggle('dorado', !!m.o[k]);

  // En el mapa solo hay posición fuera de los 200 m recortados al principio y al final.
  if (mapa && m.p[k]) {
    marcador.setLngLat(m.p[k]).addTo(mapa);
  } else {
    marcador?.remove();
  }
}

function indiceDesdeEvento(e) {
  const caja = lienzo.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
  return Math.round(f * (n - 1));
}

lienzo.addEventListener('pointermove', (e) => mostrar(indiceDesdeEvento(e)));
lienzo.addEventListener('pointerdown', (e) => mostrar(indiceDesdeEvento(e)));
lienzo.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') mostrar(null);
});

perfil.tabIndex = 0;
perfil.addEventListener('keydown', (e) => {
  const paso = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowRight') mostrar(Math.min(n - 1, (actual ?? -1) + paso));
  else if (e.key === 'ArrowLeft') mostrar(Math.max(0, (actual ?? n) - paso));
  else if (e.key === 'Escape') mostrar(null);
  else return;
  e.preventDefault();
});

// ---------- mapa ----------

/** Muestra más cercana a un punto del mapa (solo las que tienen posición publicada). */
function masCercana(lng, lat) {
  const c = Math.cos((lat * Math.PI) / 180);
  let mejor = null;
  let dmin = Infinity;
  for (let k = 0; k < n; k++) {
    const p = m.p[k];
    if (!p) continue;
    const dx = (p[0] - lng) * c;
    const dy = p[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < dmin) {
      dmin = d;
      mejor = k;
    }
  }
  return mejor;
}

async function iniciarMapa() {
  const [maplibregl, { default: urlWorker }] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
  ]);
  maplibregl.setWorkerUrl(urlWorker);
  const tactil = window.matchMedia('(pointer: coarse)').matches;
  mapa = new maplibregl.Map({
    container: 'mapa',
    style: ESTILO,
    bounds: datos.bbox ? [[datos.bbox[0], datos.bbox[1]], [datos.bbox[2], datos.bbox[3]]] : undefined,
    fitBoundsOptions: { padding: window.innerWidth < 640 ? 28 : 56 },
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: tactil,
    locale: {
      'NavigationControl.ZoomIn': 'Acercar',
      'NavigationControl.ZoomOut': 'Alejar',
      'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
      'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para hacer zoom en el mapa',
      'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para hacer zoom en el mapa',
      'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
    },
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const el = document.createElement('div');
  el.className = 'marcador-perfil';
  marcador = new maplibregl.Marker({ element: el });

  mapa.on('load', () => {
    for (const capa of mapa.getStyle().layers) {
      if (capa.type === 'symbol') mapa.setPaintProperty(capa.id, 'text-opacity', 0.55);
    }
    mapa.addSource('ruta', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: datos.track } } });
    mapa.addSource('dorado', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: datos.dorado ?? [] } } });
    const linea = (id, source, paint) => mapa.addLayer({ id, type: 'line', source, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
    linea('ruta-halo', 'ruta', { 'line-color': COLOR.naranja, 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.5 });
    linea('ruta-linea', 'ruta', { 'line-color': COLOR.ambar, 'line-width': 3.5 });
    linea('dorado-halo', 'dorado', { 'line-color': COLOR.dorado, 'line-width': 20, 'line-blur': 12, 'line-opacity': 0.6 });
    linea('dorado-linea', 'dorado', { 'line-color': COLOR.dorado, 'line-width': 5 });
    linea('ruta-impacto', 'ruta', { 'line-color': '#000', 'line-width': tactil ? 28 : 18, 'line-opacity': 0.01 });

    const desdeMapa = (e) => mostrar(masCercana(e.lngLat.lng, e.lngLat.lat));
    mapa.on('mousemove', 'ruta-impacto', (e) => {
      mapa.getCanvas().style.cursor = 'crosshair';
      desdeMapa(e);
    });
    mapa.on('mouseleave', 'ruta-impacto', () => {
      mapa.getCanvas().style.cursor = '';
      mostrar(null);
    });
    mapa.on('click', 'ruta-impacto', desdeMapa);
    if (actual != null) mostrar(actual);
  });
}

iniciarMapa();
