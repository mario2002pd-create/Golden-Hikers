// Trozos de HTML que se generan en el build (sin JavaScript en el navegador).

import { esc, num, rango, fechaLarga, vecesEverest } from './formato.mjs';
import { SITIO, NOMBRE, EVEREST } from './sitio.mjs';

/** Metadatos Open Graph y Twitter. `url` e `imagen` relativos a SITIO. */
export function metaOG({ titulo, descripcion, url = '', imagen, alt, tipo = 'website' }) {
  const abs = (p) => new URL(p, SITIO).href;
  return [
    `<link rel="canonical" href="${abs(url)}" />`,
    `<meta property="og:type" content="${tipo}" />`,
    `<meta property="og:site_name" content="${NOMBRE}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${esc(titulo)}" />`,
    `<meta property="og:description" content="${esc(descripcion)}" />`,
    `<meta property="og:url" content="${abs(url)}" />`,
    `<meta property="og:image" content="${abs(imagen)}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
}

/** Rellena en el HTML de la portada las cifras que antes ponía el JavaScript. */
export function cifrasPortada(html, datos) {
  const t = datos.totales;
  const valores = {
    rutas: num(t.rutas),
    km: num(t.km, 1),
    desnivel: num(t.desnivel),
    everest: vecesEverest(t.desnivel, EVEREST),
  };
  for (const [clave, v] of Object.entries(valores)) {
    html = html.replace(`data-cifra="${clave}">–<`, `data-cifra="${clave}">${v}<`);
  }
  const descripcion = `${num(t.rutas)} rutas, ${num(t.km, 1)} km y ${num(t.desnivel)} m de desnivel positivo por Navarra: el mapa, la lista y las cifras de cada salida.`;
  return html
    .replace('<span id="rango"></span>', `<span id="rango">${rango(datos.rutas.map((r) => r.fecha))}</span>`)
    .replace('<p class="media" id="media"></p>', `<p class="media" id="media">Media: ${num(t.mediaKm, 1)} km · ${num(t.mediaDesnivel)} m D+</p>`)
    .replace('<p id="actualizado"></p>', `<p id="actualizado">Última actualización: ${fechaLarga(datos.generado)}</p>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(descripcion)}" />`)
    .replace(
      '<!--og-->',
      metaOG({
        titulo: `${NOMBRE} · Senderismo en Navarra`,
        descripcion,
        imagen: 'og/portada.jpg',
        alt: `${NOMBRE}: ${num(t.rutas)} rutas, ${num(t.km, 1)} km y ${num(t.desnivel)} m de desnivel`,
      }),
    );
}
