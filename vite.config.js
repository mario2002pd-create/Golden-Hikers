import fs from 'node:fs';
import { defineConfig } from 'vite';
import { SITIO } from './scripts/lib/sitio.mjs';
import { esc } from './scripts/lib/formato.mjs';
import { cifrasPortada, instagramCabecera, bloqueUnete } from './scripts/lib/html.mjs';
import { seccionGolden } from './scripts/lib/golden.mjs';

const MANIFIESTO = 'public/fotos/fotos.json';
const TEXTOS = 'content/textos.json';
const DATOS = 'public/rutas.json';
const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

let base = '/';
const srcset = (f) => `${base}fotos/${f.pequena.archivo} ${f.pequena.ancho}w, ${base}fotos/${f.grande.archivo} ${f.grande.ancho}w`;
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
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      // Cifras, Open Graph y «Golden hour», sacados de public/rutas.json (lo genera `npm run datos`).
      const datos = fs.existsSync(DATOS) ? JSON.parse(fs.readFileSync(DATOS, 'utf8')) : null;
      if (datos) html = cifrasPortada(html, datos);

      let lista = [];
      try {
        lista = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8')).fotos ?? [];
      } catch {
        // Sin fotos: la portada usa el cielo dibujado en CSS.
      }
      const textos = JSON.parse(fs.readFileSync(TEXTOS, 'utf8'));
      html = html.replace(/<!--texto:([\w.]+)-->/g, (_, clave) => esc(clave.split('.').reduce((o, k) => o?.[k], textos) ?? ''));
      html = html.replace('<!--instagram-cabecera-->', instagramCabecera(textos)).replace('<!--unete-->', bloqueUnete(textos));
      if (datos) html = html.replace('<!--golden-hour-->', seccionGolden(datos, textos, { numero: '03' }));

      const con = (papel) => lista.filter((f) => f.papel === papel);
      const [portada] = con('portada');
      const [movil] = con('portada-movil');
      const [corte] = con('corte');
      const qs = textos.quienesSomos;
      const fotoGrupo = lista.find((f) => qs?.foto && f.grande.archivo.startsWith(qs.foto));
      // La foto de «Quiénes somos» no se repite en la franja.
      const galeria = con('galeria').filter((f) => f !== fotoGrupo);

      if (qs) {
        const foto = fotoGrupo
          ? `<figure class="quienes-foto"><img src="${base}fotos/${fotoGrupo.pequena.archivo}" srcset="${srcset(fotoGrupo)}" sizes="(min-width: 960px) 50vw, 100vw" width="${fotoGrupo.grande.ancho}" height="${fotoGrupo.grande.alto}" alt="${esc(fotoGrupo.alt)}" loading="lazy" decoding="async" /></figure>`
          : '';
        html = html.replace(
          '<!--quienes-somos-->',
          `<section class="quienes" aria-labelledby="titulo-quienes"><div class="quienes-texto"><p class="antetitulo">${esc(qs.antetitulo)}</p><h2 id="titulo-quienes">${esc(qs.titulo)}</h2>${qs.parrafos.map((p) => `<p>${esc(p)}</p>`).join('')}</div>${foto}</section>`,
        );
      }

      if (portada || movil) {
        const foto = portada ?? movil;
        const fuenteMovil = portada && movil
          ? `<source media="(orientation: portrait)" srcset="${srcset(movil)}" sizes="max(100vw, ${Math.round(100 * aspecto(movil))}svh)" width="${movil.grande.ancho}" height="${movil.grande.alto}" />`
          : '';
        html = html.replace('class="portada"', 'class="portada con-foto"').replace(
          '<!--foto-portada-->',
          `<picture class="portada-foto">${fuenteMovil}<img src="${base}fotos/${foto.grande.archivo}" srcset="${srcset(foto)}" sizes="max(100vw, ${Math.round(100 * aspecto(foto))}vh)" width="${foto.grande.ancho}" height="${foto.grande.alto}" alt="${esc(foto.alt)}" fetchpriority="high" decoding="async" /></picture>`,
        );
      }

      if (corte) {
        html = html.replace(
          '<!--foto-corte-->',
          `<figure class="corte"><img src="${base}fotos/${corte.grande.archivo}" srcset="${srcset(corte)}" sizes="max(100vw, ${Math.round(100 * aspecto(corte))}svh)" width="${corte.grande.ancho}" height="${corte.grande.alto}" alt="${esc(corte.alt)}" loading="lazy" decoding="async" /><figcaption><span class="corte-frase">${esc(textos.corte?.frase ?? '')}</span><span class="corte-pie">${esc(corte.alt)}</span></figcaption></figure>`,
        );
      }

      if (galeria.length) {
        const items = galeria
          .map((f) => {
            const horizontal = aspecto(f) >= 1;
            const sizes = horizontal ? '(min-width: 960px) 740px, 86vw' : '(min-width: 960px) 240px, 36vw';
            const pie = pieDeFoto(f);
            return `<li class="${horizontal ? 'horizontal' : 'vertical'}"><figure><img src="${base}fotos/${f.pequena.archivo}" srcset="${srcset(f)}" sizes="${sizes}" width="${f.grande.ancho}" height="${f.grande.alto}" alt="${esc(f.alt)}" loading="lazy" decoding="async" />${pie ? `<figcaption>${esc(pie)}</figcaption>` : ''}</figure></li>`;
          })
          .join('');
        html = html.replace(
          '<!--franja-fotos-->',
          `<section class="franja" aria-labelledby="titulo-franja"><div class="franja-cabecera"><h2 id="titulo-franja"><span class="seccion-n">04</span>Por el camino</h2><p class="franja-pista">Desliza para ver más</p></div><ul class="franja-lista">${items}</ul></section>`,
        );
      }
      return html;
    },
  };
}

export default defineConfig(({ command }) => ({
  // En el build, la dirección pública absoluta (hace falta para Open Graph).
  // Para probar dist/ en local: BASE=/ npm run build && npm run preview
  base: process.env.BASE ?? (command === 'build' ? SITIO : '/'),
  plugins: [fotos()],
}));
