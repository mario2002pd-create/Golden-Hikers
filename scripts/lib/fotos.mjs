// Optimiza las fotos de public/fotos/ para el móvil y escribe public/fotos.json.
// - Genera WebP de 640, 1280 y 1920 px de ancho en public/fotos-web/ (no se sube a git).
// - Gira según la orientación EXIF y quita TODOS los metadatos (incluida la posición GPS).
// - La foto cuyo nombre empiece por "portada" va a la portada; si no hay, la primera por orden alfabético.
// Las originales no se publican: vite.config.js las quita de dist/ al terminar el build.

import fs from 'node:fs';
import path from 'node:path';

const ANCHOS = [640, 1280, 1920];
const EXTENSIONES = /\.(jpe?g|png|webp|avif|tiff?)$/i;

export async function procesarFotos(raiz) {
  const dirOrigen = path.join(raiz, 'public/fotos');
  const dirSalida = path.join(raiz, 'public/fotos-web');
  const manifiesto = path.join(raiz, 'public/fotos.json');

  const todas = fs.existsSync(dirOrigen) ? fs.readdirSync(dirOrigen).filter((f) => !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'es')) : [];
  for (const f of todas.filter((f) => !EXTENSIONES.test(f))) {
    console.warn(`AVISO  public/fotos/${f}: formato no admitido (usa JPG, PNG o WebP; las HEIC del iPhone hay que convertirlas).`);
  }
  const archivos = todas.filter((f) => EXTENSIONES.test(f));
  if (!archivos.length) {
    fs.writeFileSync(manifiesto, JSON.stringify({ portada: null, franja: [] }));
    fs.rmSync(dirSalida, { recursive: true, force: true });
    return;
  }

  const { default: sharp } = await import('sharp');
  fs.mkdirSync(dirSalida, { recursive: true });
  const usados = new Set();
  const fotos = [];

  for (const archivo of archivos) {
    const origen = path.join(dirOrigen, archivo);
    const base = archivo
      .replace(EXTENSIONES, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'foto';
    const meta = await sharp(origen).rotate().toBuffer({ resolveWithObject: true }).then((r) => r.info);
    const anchos = ANCHOS.filter((a) => a < meta.width).concat(meta.width < ANCHOS[ANCHOS.length - 1] ? [meta.width] : []);
    const variantes = [];
    for (const ancho of [...new Set(anchos)]) {
      const nombre = `${base}-${ancho}.webp`;
      const destino = path.join(dirSalida, nombre);
      usados.add(nombre);
      if (!fs.existsSync(destino) || fs.statSync(destino).mtimeMs < fs.statSync(origen).mtimeMs) {
        await sharp(origen).rotate().resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toFile(destino);
      }
      variantes.push({ ancho, src: `fotos-web/${nombre}` });
    }
    // Miniatura borrosa para que el hueco no salga negro mientras carga.
    const lqip = await sharp(origen).rotate().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
    fotos.push({
      archivo,
      ancho: meta.width,
      alto: meta.height,
      srcset: variantes.map((v) => `${v.src} ${v.ancho}w`).join(', '),
      src: (variantes.find((v) => v.ancho >= 1280) ?? variantes[variantes.length - 1]).src,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    });
  }

  for (const f of fs.readdirSync(dirSalida)) if (!usados.has(f)) fs.rmSync(path.join(dirSalida, f));

  const iPortada = Math.max(0, fotos.findIndex((f) => /^portada/i.test(f.archivo)));
  const portada = fotos[iPortada];
  const franja = fotos.filter((_, i) => i !== iPortada);
  fs.writeFileSync(manifiesto, JSON.stringify({ portada, franja }));
  const kb = fs.readdirSync(dirSalida).reduce((s, f) => s + fs.statSync(path.join(dirSalida, f)).size, 0) / 1024;
  console.log(`public/fotos-web: ${fotos.length} fotos optimizadas (${kb.toFixed(0)} KB en total; portada: ${portada.archivo})`);
}
