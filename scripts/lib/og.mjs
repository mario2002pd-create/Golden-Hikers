// Imágenes Open Graph (1200×630, JPG) para compartir la web y cada ficha.
// El texto se convierte en trazos con opentype.js, así no depende de las fuentes del sistema.

import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const ANCHO = 1200;
const ALTO = 630;
const MARGEN = 64;

const fuentes = {};
function fuente(raiz, nombre) {
  const archivos = {
    anton: 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff',
    mono: 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff',
  };
  if (!fuentes[nombre]) {
    const buf = fs.readFileSync(path.join(raiz, archivos[nombre]));
    fuentes[nombre] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return fuentes[nombre];
}

function texto(f, cadena, x, y, tamano, relleno, espaciado = 0) {
  const opciones = { letterSpacing: espaciado };
  const d = f.getPath(cadena, x, y, tamano, opciones).toPathData(1);
  return `<path d="${d}" fill="${relleno}" />`;
}

/** Reparte el título en 1 o 2 líneas y elige el tamaño más grande que cabe. */
function encajarTitulo(f, palabras, anchoMax, maximo) {
  const ancho = (s, t) => f.getAdvanceWidth(s, t);
  const tamano1 = Math.min(maximo, (anchoMax / ancho(palabras.join(' '), 100)) * 100);
  if (tamano1 >= maximo * 0.62 || palabras.length < 2) return { lineas: [palabras.join(' ')], tamano: tamano1 };
  let mejor = null;
  for (let i = 1; i < palabras.length; i++) {
    const l = [palabras.slice(0, i).join(' '), palabras.slice(i).join(' ')];
    const t = Math.min(maximo, ...l.map((s) => (anchoMax / ancho(s, 100)) * 100));
    if (!mejor || t > mejor.tamano) mejor = { lineas: l, tamano: t };
  }
  return mejor;
}

/** Dibuja un track (lista de [lon, lat]) dentro de una caja, con brillo naranja. */
export function dibujoTrack(track, caja) {
  if (!track?.length) return '';
  const lat0 = (track.reduce((s, p) => s + p[1], 0) / track.length) * (Math.PI / 180);
  const xy = track.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const escala = Math.min(caja.ancho / (x1 - x0 || 1), caja.alto / (y1 - y0 || 1));
  const dx = caja.x + (caja.ancho - (x1 - x0) * escala) / 2;
  const dy = caja.y + (caja.alto - (y1 - y0) * escala) / 2;
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(dx + (x - x0) * escala).toFixed(1)},${(dy + (y - y0) * escala).toFixed(1)}`).join('');
  return `
    <path d="${d}" fill="none" stroke="#ff7a1a" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" opacity="0.45" filter="url(#brillo)" />
    <path d="${d}" fill="none" stroke="#ffb627" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" />`;
}

/**
 * Genera una tarjeta OG.
 * @param {object} o
 * @param {string} o.raiz        raíz del proyecto
 * @param {string} o.salida      ruta del JPG
 * @param {string} [o.fondo]     foto de fondo (si no hay, cielo de atardecer)
 * @param {string} o.antetitulo  texto pequeño de arriba
 * @param {string} o.titulo      titular (en Anton)
 * @param {string} o.pie         cifras de abajo (monoespaciada)
 * @param {string} [o.extra]     SVG extra (por ejemplo, el track)
 * @param {number} [o.anchoTitulo]
 */
export async function tarjetaOG({ raiz, salida, fondo, antetitulo, titulo, pie, extra = '', anchoTitulo = ANCHO - MARGEN * 2 }) {
  const anton = fuente(raiz, 'anton');
  const mono = fuente(raiz, 'mono');
  const { lineas, tamano } = encajarTitulo(anton, titulo.toUpperCase().split(/\s+/), anchoTitulo, 168);
  const alto = tamano * 0.92;
  const yPrimera = 118 + tamano * 0.86;
  let titulos;
  if (lineas.length === 1 && lineas[0].includes(' ')) {
    // Una sola línea: la primera palabra en dorado y el resto en blanco, como en la web.
    const [primera, ...resto] = lineas[0].split(' ');
    const x2 = MARGEN - 4 + anton.getAdvanceWidth(primera + ' ', tamano);
    titulos = texto(anton, primera, MARGEN - 4, yPrimera, tamano, 'url(#oro)') + texto(anton, resto.join(' '), x2, yPrimera, tamano, '#f4ede3');
  } else {
    titulos = lineas.map((l, i) => texto(anton, l, MARGEN - 4, yPrimera + i * alto, tamano, i === 0 ? 'url(#oro)' : '#f4ede3')).join('');
  }

  const capa = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
      <defs>
        <linearGradient id="oro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd27a" /><stop offset="0.45" stop-color="#ffb627" /><stop offset="1" stop-color="#ff7a1a" />
        </linearGradient>
        <linearGradient id="velo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0b0907" stop-opacity="0.88" /><stop offset="0.55" stop-color="#0b0907" stop-opacity="0.45" /><stop offset="1" stop-color="#0b0907" stop-opacity="0.1" />
        </linearGradient>
        <linearGradient id="suelo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stop-color="#0b0907" stop-opacity="0" /><stop offset="1" stop-color="#0b0907" stop-opacity="0.9" />
        </linearGradient>
        <linearGradient id="raya" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffb627" /><stop offset="0.5" stop-color="#ff7a1a" /><stop offset="1" stop-color="#c81d25" />
        </linearGradient>
        <filter id="brillo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#velo)" />
      <rect width="100%" height="100%" fill="url(#suelo)" />
      ${extra}
      ${texto(mono, antetitulo.toUpperCase(), MARGEN, 92, 22, '#ffb627', 0.12)}
      ${titulos}
      <rect x="${MARGEN}" y="${ALTO - 108}" width="${ANCHO - MARGEN * 2}" height="3" fill="url(#raya)" />
      ${texto(mono, pie, MARGEN, ALTO - 56, 30, '#f4ede3')}
    </svg>`;

  const base = fondo
    ? sharp(fondo).resize(ANCHO, ALTO, { fit: 'cover', position: 'centre' })
    : sharp(
        Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
          <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0b0907" /><stop offset="0.45" stop-color="#2a0f0b" /><stop offset="0.75" stop-color="#7a1d17" /><stop offset="1" stop-color="#d9480f" />
          </linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#c)" /></svg>`),
      );

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  await base
    .composite([{ input: Buffer.from(capa), top: 0, left: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(salida);
}
