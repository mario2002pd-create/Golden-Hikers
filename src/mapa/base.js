// Mapa base de la portada y de las fichas: estilo oscuro propio (estilo.json) sobre
// OpenFreeMap, relieve y curvas de nivel de Mapterhorn. Todo sin claves de API.
import estilo from './estilo.json';

// Relieve: teselas terrarium WebP de 512 px. En España salen del MDT02/MDT05 del CNIG.
const DEM = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const DEM_MAXZOOM = 12;
const ATRIBUCION_DEM =
  'Relieve: <a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">Mapterhorn</a> (MDT <a href="https://www.scne.es/" target="_blank" rel="noopener">© CNIG</a>, CC BY 4.0)';

// Las etiquetas empiezan aquí: el brillo de los tracks va debajo y la línea, encima.
export const PRIMERA_ETIQUETA = 'nombres-rios';
// Curvas de nivel solo desde este zoom (y nunca con «ahorro de datos»).
const ZOOM_CURVAS = 13;

const LOCALE = {
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'NavigationControl.ResetBearing': 'Orientar al norte',
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
  'AttributionControl.MapFeedback': 'Sugerir mejoras del mapa',
  'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para hacer zoom en el mapa',
  'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para hacer zoom en el mapa',
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
};

export const tactil = () => window.matchMedia('(pointer: coarse)').matches;
const ahorroDatos = () => navigator.connection?.saveData === true || /2g/.test(navigator.connection?.effectiveType ?? '');

/** Llama a `fn` una sola vez, cuando `el` está a punto de entrar en pantalla. */
export function cuandoVisible(el, fn, margen = '400px') {
  if (!('IntersectionObserver' in window)) return fn();
  const obs = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) {
      obs.disconnect();
      fn();
    }
  }, { rootMargin: margen });
  obs.observe(el);
}

/** MapLibre pesa: se carga aparte, solo cuando el mapa va a verse. */
export async function cargarMaplibre() {
  const [lib, { default: urlWorker }] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
  ]);
  lib.setWorkerUrl(urlWorker);
  return lib;
}

/** Triángulo ámbar pequeño para las cimas (sin sprite: se dibuja aquí). */
function iconoCima() {
  const r = 2;
  const w = 10 * r;
  const h = 9 * r;
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(w / 2, r);
  ctx.lineTo(w - r, h - r);
  ctx.lineTo(r, h - r);
  ctx.closePath();
  ctx.fillStyle = '#ffb627';
  ctx.strokeStyle = '#0c0a08';
  ctx.lineWidth = 1.5 * r;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  return { imagen: ctx.getImageData(0, 0, w, h), pixelRatio: r };
}

/** Miles con punto, como en el resto de la web (1.289). */
const miles = (e) => [
  'case',
  ['>=', e, 1000],
  ['concat', ['to-string', ['floor', ['/', e, 1000]]], '.', ['slice', ['to-string', ['+', 1000, ['%', e, 1000]]], 1]],
  ['to-string', e],
];

/**
 * Relieve (hillshade) y curvas de nivel sobre el mismo DEM. Se piden cuando el mapa
 * base ya se ha pintado, para no competir con él; maplibre-contour guarda las teselas
 * del DEM y las comparten las dos capas.
 */
async function anadirRelieve(mapa, maplibregl) {
  const { default: mlcontour } = await import('maplibre-contour');
  const dem = new mlcontour.DemSource({ url: DEM, encoding: 'terrarium', maxzoom: DEM_MAXZOOM, worker: true, cacheSize: 64, timeoutMs: 15000 });
  dem.setupMaplibre(maplibregl);

  mapa.addSource('dem', { type: 'raster-dem', tiles: [dem.sharedDemProtocolUrl], tileSize: 512, maxzoom: DEM_MAXZOOM, encoding: 'terrarium', attribution: ATRIBUCION_DEM });
  // Sombras negras y luces cálidas, muy suaves: se leen las sierras sin quitarle sitio a los tracks.
  mapa.addLayer(
    {
      id: 'relieve',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-method': 'standard',
        'hillshade-illumination-anchor': 'map',
        'hillshade-illumination-direction': 315,
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 12, 0.4, 15, 0.32],
        'hillshade-shadow-color': 'rgba(0, 0, 0, 0.7)',
        'hillshade-highlight-color': 'rgba(255, 160, 80, 0.09)',
        'hillshade-accent-color': 'rgba(30, 16, 8, 0.4)',
      },
    },
    'edificios',
  );

  if (ahorroDatos()) return;
  mapa.addSource('curvas', {
    type: 'vector',
    tiles: [
      dem.contourProtocolUrl({
        // zoom de la tesela: [cada cuánto una curva, cada cuánto una maestra]
        thresholds: { 12: [25, 100], 13: [20, 100], 14: [10, 100] },
        elevationKey: 'ele',
        levelKey: 'nivel',
        contourLayer: 'curvas',
      }),
    ],
    minzoom: ZOOM_CURVAS - 1,
    maxzoom: 15,
  });
  mapa.addLayer(
    {
      id: 'curvas',
      type: 'line',
      source: 'curvas',
      'source-layer': 'curvas',
      minzoom: ZOOM_CURVAS,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#3a2c20',
        'line-width': ['match', ['get', 'nivel'], 1, 0.9, 0.45],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_CURVAS, 0, ZOOM_CURVAS + 0.5, ['match', ['get', 'nivel'], 1, 0.8, 0.5]],
      },
    },
    'carreteras-menores',
  );
  mapa.addLayer(
    {
      id: 'curvas-cotas',
      type: 'symbol',
      source: 'curvas',
      'source-layer': 'curvas',
      minzoom: ZOOM_CURVAS + 0.5,
      filter: ['==', ['get', 'nivel'], 1],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': miles(['round', ['get', 'ele']]),
        'text-font': ['JetBrains Mono'],
        'text-size': 9,
        'text-padding': 6,
      },
      paint: { 'text-color': '#6a5440', 'text-halo-color': '#0c0a08', 'text-halo-width': 1.2 },
    },
    PRIMERA_ETIQUETA,
  );
}

/** Crea el mapa con el estilo propio. `opciones` se pasan tal cual a maplibregl.Map. */
export function crearMapa(maplibregl, opciones) {
  const mapa = new maplibregl.Map({
    style: estilo,
    attributionControl: { compact: window.innerWidth < 640 },
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: tactil(),
    locale: LOCALE,
    ...opciones,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const cima = iconoCima();
  mapa.setMissingStyleImageResolver((id) => {
    if (id === 'cima' && !mapa.hasImage('cima')) mapa.addImage('cima', cima.imagen, { pixelRatio: cima.pixelRatio });
  });
  mapa.once('load', () => mapa.once('idle', () => anadirRelieve(mapa, maplibregl).catch((err) => console.warn('Sin relieve:', err))));
  return mapa;
}
