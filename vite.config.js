import fs from 'node:fs';
import { defineConfig } from 'vite';

const MANIFIESTO = 'public/fotos/fotos.json';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const srcset = (f) => `fotos/${f.pequena.archivo} ${f.pequena.ancho}w, fotos/${f.grande.archivo} ${f.grande.ancho}w`;
const aspecto = (f) => f.grande.ancho / f.grande.alto;

function pieDeFoto(f) {
  const partes = [];
  if (f.fecha) partes.push(formatoFecha.format(new Date(f.fecha)).replace('.', ''));
  if (f.ruta) partes.push(f.ruta);
  return partes.join(' · ');
}

// Mete las fotos de public/fotos/fotos.json directamente en el HTML,
// para que la portada se pinte a la primera sin esperar al JavaScript.
// Papeles: "portada" (escritorio), "portada-movil" (vertical), "corte" (a sangre
// entre la portada y el mapa) y "galeria" (la franja de fotos).
function fotos() {
  return {
    name: 'golden-hikers-fotos',
    transformIndexHtml(html) {
      let lista = [];
      try {
        lista = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8')).fotos ?? [];
      } catch {
        // Sin fotos: la portada usa el cielo dibujado en CSS.
      }
      const con = (papel) => lista.filter((f) => f.papel === papel);
      const [portada] = con('portada');
      const [movil] = con('portada-movil');
      const [corte] = con('corte');
      const galeria = con('galeria');

      if (portada || movil) {
        const base = portada ?? movil;
        const fuenteMovil = portada && movil
          ? `<source media="(orientation: portrait)" srcset="${srcset(movil)}" sizes="max(100vw, ${Math.round(100 * aspecto(movil))}svh)" width="${movil.grande.ancho}" height="${movil.grande.alto}" />`
          : '';
        html = html.replace('class="portada"', 'class="portada con-foto"').replace(
          '<!--foto-portada-->',
          `<picture class="portada-foto">${fuenteMovil}<img src="fotos/${base.grande.archivo}" srcset="${srcset(base)}" sizes="max(100vw, ${Math.round(100 * aspecto(base))}vh)" width="${base.grande.ancho}" height="${base.grande.alto}" alt="${esc(base.alt)}" fetchpriority="high" decoding="async" /></picture>`,
        );
      }

      if (corte) {
        html = html.replace(
          '<!--foto-corte-->',
          `<figure class="corte"><img src="fotos/${corte.grande.archivo}" srcset="${srcset(corte)}" sizes="max(100vw, ${Math.round(100 * aspecto(corte))}svh)" width="${corte.grande.ancho}" height="${corte.grande.alto}" alt="${esc(corte.alt)}" loading="lazy" decoding="async" /><figcaption><span class="corte-frase">Subir para ver<br />caer el sol</span><span class="corte-pie">${esc(corte.alt)}</span></figcaption></figure>`,
        );
      }

      if (galeria.length) {
        const items = galeria
          .map((f) => {
            const horizontal = aspecto(f) >= 1;
            const sizes = horizontal ? '(min-width: 960px) 740px, 86vw' : '(min-width: 960px) 240px, 36vw';
            const pie = pieDeFoto(f);
            return `<li class="${horizontal ? 'horizontal' : 'vertical'}"><figure><img src="fotos/${f.pequena.archivo}" srcset="${srcset(f)}" sizes="${sizes}" width="${f.grande.ancho}" height="${f.grande.alto}" alt="${esc(f.alt)}" loading="lazy" decoding="async" />${pie ? `<figcaption>${esc(pie)}</figcaption>` : ''}</figure></li>`;
          })
          .join('');
        html = html.replace(
          '<!--franja-fotos-->',
          `<section class="franja" aria-labelledby="titulo-franja"><div class="franja-cabecera"><h2 id="titulo-franja"><span class="seccion-n">03</span>Por el camino</h2><p class="franja-pista">Desliza para ver más</p></div><ul class="franja-lista">${items}</ul></section>`,
        );
      }
      return html;
    },
  };
}

export default defineConfig({
  // Rutas relativas: la web funciona igual en GitHub Pages (/Golden-Hikers/) que en cualquier otra carpeta.
  base: './',
  plugins: [fotos()],
});
