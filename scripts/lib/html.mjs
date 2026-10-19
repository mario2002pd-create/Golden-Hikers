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

/** Icono de Instagram (trazo propio en SVG, hereda el color del texto). */
export const ICONO_INSTAGRAM =
  '<svg class="icono" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>';

const FLECHA = '<svg class="icono" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Enlace a Instagram para la cabecera. */
export function instagramCabecera(textos) {
  return `<a class="red-social" href="${esc(textos.enlaces.instagram)}" rel="noopener" target="_blank" aria-label="${NOMBRE} en Instagram">${ICONO_INSTAGRAM}</a>`;
}

/** Bloque final «¿Te vienes a la próxima?». */
export function bloqueUnete(textos) {
  const u = textos.unete;
  const e = textos.enlaces;
  return `<section class="unete" aria-labelledby="titulo-unete">
      <div class="unete-sol" aria-hidden="true"></div>
      <h2 id="titulo-unete">${esc(u.titulo)}</h2>
      <p class="unete-texto">${esc(u.texto)}</p>
      <div class="unete-acciones">
        <a class="boton" href="${esc(e.instagram)}" rel="noopener" target="_blank">${ICONO_INSTAGRAM}<span>${esc(u.boton)}</span></a>
        <a class="enlace-flecha" href="${esc(e.wikiloc)}" rel="noopener" target="_blank"><span>${esc(u.wikiloc)}</span>${FLECHA}</a>
      </div>
    </section>`;
}
