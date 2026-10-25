// Ficha de cada ruta: página estática generada en el build (ruta/NN-nombre/index.html).
// Las URL de la web se escriben con %BASE%, que el plugin de Vite cambia por la base del sitio.

import { esc, num, fecha, fechaLarga, horaLocal } from './formato.mjs';
import { metaOG, ICONO_INSTAGRAM, bloqueUnete } from './html.mjs';
import { respectoOcaso } from './golden.mjs';
import { NOMBRE } from './sitio.mjs';

/** "Castillo de Garoña" → "castillo-de-garona". */
export const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "ruta/14-atardecer-en-el-perdon/" a partir del id y del nombre del archivo (o del nombre de la ruta). */
export function rutaUrl(id, archivo, nombre) {
  const base = archivo.replace(/\.gpx(\.gz)?$/i, '').replace(/^\d{4}-\d{2}-\d{2}_/, '');
  return `ruta/${String(id).padStart(2, '0')}-${slug(base) || slug(nombre) || 'ruta'}/`;
}

/**
 * Muestras del perfil cada pocos metros: distancia (km), altitud (m), posición y minutos desde la salida.
 * La posición va a null en los primeros y últimos `recorte` metros (privacidad).
 */
export function muestrasPerfil(puntos, dist, { recorte = 200, dorado = () => false, maximo = 400 } = {}) {
  const total = dist[dist.length - 1];
  const n = Math.max(2, Math.min(maximo, Math.ceil(total / 15)));
  const conEle = [];
  for (let i = 0; i < puntos.length; i++) if (Number.isFinite(puntos[i].ele)) conEle.push(i);
  const t0 = puntos[0].t ? Date.parse(puntos[0].t) : null;
  const salida = { d: [], e: [], p: [], m: [], o: [] };
  let i = 0;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1)) * total;
    while (i < puntos.length - 2 && dist[i + 1] < x) i++;
    const span = dist[i + 1] - dist[i];
    const f = span > 0 ? Math.min(1, Math.max(0, (x - dist[i]) / span)) : 0;
    const a = puntos[i];
    const b = puntos[i + 1] ?? a;
    while (j < conEle.length - 2 && dist[conEle[j + 1]] < x) j++;
    let ele = null;
    if (conEle.length) {
      const ea = puntos[conEle[j]];
      const eb = puntos[conEle[Math.min(j + 1, conEle.length - 1)]];
      const s = dist[conEle[Math.min(j + 1, conEle.length - 1)]] - dist[conEle[j]];
      const g = s > 0 ? Math.min(1, Math.max(0, (x - dist[conEle[j]]) / s)) : 0;
      ele = ea.ele + g * (eb.ele - ea.ele);
    }
    const t = a.t && b.t ? Date.parse(a.t) + f * (Date.parse(b.t) - Date.parse(a.t)) : null;
    const visible = x >= recorte && x <= total - recorte;
    salida.d.push(+(x / 1000).toFixed(3));
    salida.e.push(ele == null ? null : Math.round(ele));
    salida.p.push(visible ? [+(a.lon + f * (b.lon - a.lon)).toFixed(5), +(a.lat + f * (b.lat - a.lat)).toFixed(5)] : null);
    salida.m.push(t != null && t0 != null ? Math.round((t - t0) / 60000) : null);
    salida.o.push(t != null && dorado({ t: new Date(t).toISOString() }) ? 1 : 0);
  }
  return salida;
}

/** Perfil de altitud en SVG (se estira a lo ancho; los rótulos van en HTML). */
export function perfilSVG(m) {
  const eles = m.e.filter((v) => v != null);
  if (!eles.length) return { svg: '', rotulos: '', min: 0, max: 0 };
  const min = Math.min(...eles);
  const max = Math.max(...eles);
  const margen = Math.max(10, (max - min) * 0.12);
  const y0 = min - margen;
  const y1 = max + margen * 0.6;
  const total = m.d[m.d.length - 1] || 1;
  const X = (d) => ((d / total) * 1000).toFixed(1);
  const Y = (e) => (200 - ((e - y0) / (y1 - y0)) * 200).toFixed(1);
  const pts = m.d.map((d, k) => (m.e[k] == null ? null : `${X(d)},${Y(m.e[k])}`)).filter(Boolean);
  const linea = `M${pts.join('L')}`;
  const area = `M${X(0)},200L${pts.join('L')}L${X(total)},200Z`;

  // Tramos en hora dorada: misma área, en naranja intenso.
  let dorado = '';
  let tramo = [];
  const cerrar = () => {
    if (tramo.length > 1) {
      const p = tramo.map((k) => `${X(m.d[k])},${Y(m.e[k])}`);
      dorado += `<path class="perfil-dorado-area" d="M${X(m.d[tramo[0]])},200L${p.join('L')}L${X(m.d[tramo[tramo.length - 1]])},200Z" />`;
      dorado += `<path class="perfil-dorado-linea" d="M${p.join('L')}" vector-effect="non-scaling-stroke" />`;
    }
    tramo = [];
  };
  m.o.forEach((o, k) => (o && m.e[k] != null ? tramo.push(k) : cerrar()));
  cerrar();

  const paso = total > 12 ? 2 : total > 5 ? 1 : 0.5;
  let rotulos = '';
  for (let d = paso; d < total - paso * 0.4; d += paso) {
    rotulos += `<span class="perfil-km" style="left:${((d / total) * 100).toFixed(2)}%">${num(d, paso < 1 ? 1 : 0)}</span>`;
  }
  rotulos += `<span class="perfil-km perfil-km-unidad" style="left:100%">km</span>`;
  rotulos += `<span class="perfil-alt" style="top:${((1 - (max - y0) / (y1 - y0)) * 100).toFixed(2)}%">${num(max)} m</span>`;
  rotulos += `<span class="perfil-alt" style="top:${((1 - (min - y0) / (y1 - y0)) * 100).toFixed(2)}%">${num(min)} m</span>`;

  const svg = `<svg class="perfil-svg" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="perfil-relleno" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb627" stop-opacity="0.38" /><stop offset="1" stop-color="#ffb627" stop-opacity="0.02" /></linearGradient></defs>
      <path class="perfil-area" d="${area}" />
      ${dorado}
      <path class="perfil-linea" d="${linea}" vector-effect="non-scaling-stroke" />
    </svg>`;
  return { svg, rotulos, min, max, y0, y1, area };
}

const ICONO_FLECHA = (dir) =>
  `<svg class="icono" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="${dir === 'izq' ? 'M19 12H6M11 6l-6 6 6 6' : 'M5 12h13M13 6l6 6-6 6'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const srcset = (f) => `%BASE%fotos/${f.pequena.archivo} ${f.pequena.ancho}w, %BASE%fotos/${f.grande.archivo} ${f.grande.ancho}w`;

/** HTML completo de la ficha. */
export function paginaFicha({ ruta, muestras, fotos, anterior, siguiente, textos, total }) {
  const p = perfilSVG(muestras);
  const s = ruta.sol;
  const lineaSol = !s
    ? ''
    : s.deManana
      ? `Salida de mañana: en la cima a las ${horaLocal(s.cima)}`
      : `En la cima ${respectoOcaso(s.minCimaOcaso)}${s.minutosDorados ? ` · ${s.minutosDorados} min andados en hora dorada` : ''}`;
  const descripcion = `${ruta.nombre}, ${fechaLarga(ruta.fecha)}: ${num(ruta.km, 2)} km y ${num(ruta.desnivel)} m de desnivel positivo, con la cima a ${num(ruta.altitudMaxima)} m.${s && !s.deManana ? ` Arriba ${respectoOcaso(s.minCimaOcaso)}.` : ''}`;
  const n2 = String(ruta.id).padStart(2, '0');
  const enlaceRuta = (r, dir) =>
    r
      ? `<a class="ficha-nav-${dir}" href="%BASE%${r.url}">${dir === 'ant' ? ICONO_FLECHA('izq') : ''}<span><small>${dir === 'ant' ? 'Anterior' : 'Siguiente'} · ${r.id}</small>${esc(r.nombre)}</span>${dir === 'sig' ? ICONO_FLECHA('der') : ''}</a>`
      : '<span></span>';

  const galeria = fotos.length
    ? `<section class="ficha-fotos" aria-labelledby="titulo-fotos">
        <div class="bloque-cabecera"><h2 id="titulo-fotos"><span class="seccion-n">Fotos</span>Ese día</h2></div>
        <ul class="ficha-fotos-lista">${fotos
          .map(
            (f) =>
              `<li class="${f.grande.ancho >= f.grande.alto ? 'horizontal' : 'vertical'}"><figure><img src="%BASE%fotos/${f.pequena.archivo}" srcset="${srcset(f)}" sizes="(min-width: 960px) 50vw, 100vw" width="${f.grande.ancho}" height="${f.grande.alto}" alt="${esc(f.alt)}" loading="lazy" decoding="async" /><figcaption>${esc(f.alt)}</figcaption></figure></li>`,
          )
          .join('')}</ul>
      </section>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0907" />
    <meta name="description" content="${esc(descripcion)}" />
    <title>${esc(ruta.nombre)} · ${esc(fecha(ruta.fecha))} · ${NOMBRE}</title>
    ${metaOG({ titulo: `${ruta.nombre} · ${NOMBRE}`, descripcion, url: ruta.url, imagen: `og/ruta-${n2}.jpg`, alt: `Track de ${ruta.nombre} con sus cifras`, tipo: 'article' })}
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23ffb627'/%3E%3Cstop offset='1' stop-color='%23c81d25'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='6' fill='%230b0907'/%3E%3Ccircle cx='21' cy='13' r='6' fill='url(%23g)'/%3E%3Cpath d='M0 27 L9 15 L15 21 L20 16 L32 27 L32 32 L0 32 Z' fill='%230b0907' stroke='%23ff7a1a' stroke-width='1.5'/%3E%3C/svg%3E" />
  </head>
  <body class="pagina-ficha">
    <nav class="ficha-barra" aria-label="Navegación">
      <a class="ficha-volver" href="%BASE%#seccion-rutas">${ICONO_FLECHA('izq')}<span>Todas las rutas</span></a>
      <a class="ficha-marca" href="%BASE%">${NOMBRE}</a>
      <a class="red-social" href="${esc(textos.enlaces.instagram)}" rel="noopener" target="_blank" aria-label="${NOMBRE} en Instagram">${ICONO_INSTAGRAM}</a>
    </nav>

    <header class="ficha-portada">
      <div class="ficha-cielo" aria-hidden="true"></div>
      <svg class="ficha-sierra" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="${p.area ?? ''}" /></svg>
      <p class="antetitulo"><span>Ruta ${ruta.id} de ${total}</span><span>${esc(fechaLarga(ruta.fecha))}</span></p>
      <h1 class="ficha-titulo">${esc(ruta.nombre)}</h1>
      ${lineaSol ? `<p class="ficha-sol">${esc(lineaSol)}</p>` : ''}
      ${ruta.wikiloc ? `<a class="enlace-flecha ficha-wikiloc" href="${esc(ruta.wikiloc)}" target="_blank" rel="noopener"><span>Ver esta ruta en Wikiloc</span>${ICONO_FLECHA('der')}</a>` : ''}
      <dl class="cifras ficha-cifras">
        <div class="cifra"><dt>kilómetros</dt><dd>${num(ruta.km, 2)}<small>km</small></dd></div>
        <div class="cifra"><dt>desnivel positivo</dt><dd>${num(ruta.desnivel)}<small>m</small></dd></div>
        <div class="cifra"><dt>cota máxima</dt><dd>${num(ruta.altitudMaxima)}<small>m</small></dd></div>
        <div class="cifra"><dt>hora de inicio</dt><dd>${s ? horaLocal(s.inicio) : '–'}</dd></div>
      </dl>
    </header>

    <main class="ficha-cuerpo">
      <section class="ficha-mapa" aria-labelledby="titulo-recorrido">
        <div class="bloque-cabecera">
          <h2 id="titulo-recorrido"><span class="seccion-n">Recorrido</span>Mapa y perfil</h2>
          <p class="media">Recorre el perfil para seguirlo en el mapa</p>
        </div>
        <div class="mapa-marco">
          <div id="mapa" class="mapa mapa-ficha" role="region" aria-label="Mapa del recorrido"></div>
          ${ruta.dorado?.length ? '<div class="leyenda-rutas"><i></i><span>Andado en hora dorada</span></div>' : ''}
        </div>
        <div class="perfil" id="perfil" role="img" aria-label="Perfil de altitud: de ${num(p.min)} m a ${num(p.max)} m en ${num(ruta.km, 2)} km">
          <div class="perfil-lienzo">
            ${p.svg}
            ${p.rotulos}
            <div class="perfil-cursor" hidden><i class="perfil-cursor-linea"></i><i class="perfil-cursor-punto"></i></div>
          </div>
          <p class="perfil-lectura" aria-live="polite"></p>
        </div>
      </section>
      ${galeria}
      <nav class="ficha-nav" aria-label="Otras rutas">
        ${enlaceRuta(anterior, 'ant')}
        ${enlaceRuta(siguiente, 'sig')}
      </nav>
    </main>

    ${bloqueUnete(textos)}

    <footer class="pie">
      <p class="pie-marca">${NOMBRE}</p>
      <div class="pie-datos">
        <p>Datos sacados de Strava</p>
        <p>Los primeros y últimos 200 m de cada track no se publican</p>
      </div>
    </footer>

    <script type="application/json" id="datos-ruta">${JSON.stringify({ id: ruta.id, nombre: ruta.nombre, bbox: ruta.bbox, track: ruta.track, dorado: ruta.dorado, inicio: s?.inicio ?? null, muestras, perfil: { y0: p.y0, y1: p.y1 } }).replace(/</g, '\\u003c')}</script>
    <script type="module" src="/src/ficha.js"></script>
  </body>
</html>
`;
}
