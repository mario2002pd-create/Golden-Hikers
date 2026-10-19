import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Mete las fotos (generadas por scripts/lib/fotos.mjs) directamente en el HTML,
// para que la portada se pinte a la primera sin esperar al JavaScript.
function fotos() {
  let salida = 'dist';
  return {
    name: 'golden-hikers-fotos',
    configResolved(config) {
      salida = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      let datos = { portada: null, franja: [] };
      try {
        datos = JSON.parse(fs.readFileSync('public/fotos.json', 'utf8'));
      } catch {
        // Sin fotos: la portada usa el cielo dibujado en CSS.
      }
      const { portada, franja } = datos;
      if (portada) {
        html = html
          .replace('class="portada"', 'class="portada con-foto"')
          .replace(
            '<!--foto-portada-->',
            `<img class="portada-foto" src="${portada.src}" srcset="${portada.srcset}" sizes="max(100vw, ${Math.round((100 * portada.ancho) / portada.alto)}vh)" width="${portada.ancho}" height="${portada.alto}" alt="" fetchpriority="high" decoding="async" style="background-image:url(${portada.lqip})" />`,
          );
      }
      if (franja.length) {
        const items = franja
          .map(
            (f) =>
              `<li><img src="${f.src}" srcset="${f.srcset}" sizes="(min-width: 960px) 560px, 80vw" width="${f.ancho}" height="${f.alto}" alt="${esc(f.archivo.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))}" loading="lazy" decoding="async" style="aspect-ratio:${f.ancho}/${f.alto};background-image:url(${f.lqip})" /></li>`,
          )
          .join('');
        html = html.replace(
          '<!--franja-fotos-->',
          `<section class="franja" aria-label="Fotos de las rutas"><div class="franja-cabecera"><h2><span class="seccion-n">03</span>Por el camino</h2><p class="franja-pista">Desliza para ver más</p></div><ul class="franja-lista">${items}</ul></section>`,
        );
      }
      return html;
    },
    closeBundle() {
      // Las fotos originales pesan mucho y llevan la posición GPS en el EXIF: no se publican.
      fs.rmSync(path.join(salida, 'fotos'), { recursive: true, force: true });
      fs.rmSync(path.join(salida, 'fotos.json'), { force: true });
    },
  };
}

export default defineConfig({
  // Rutas relativas: la web funciona igual en GitHub Pages (/Golden-Hikers/) que en cualquier otra carpeta.
  base: './',
  plugins: [fotos()],
});
