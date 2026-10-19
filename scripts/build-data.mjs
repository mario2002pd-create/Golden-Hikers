// Lee todos los GPX de data/gpx/ y genera public/rutas.json para la web.
//   node scripts/build-data.mjs              → genera los datos
//   node scripts/build-data.mjs --comprobar  → además compara con docs/referencia.json (solo avisa)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  parseGpx,
  quitarSaltos,
  suavizarPosicion,
  distanciaFiltrada,
  desnivelPositivo,
  altitudMaxima,
  recortar,
  simplificar,
  fechaLocal,
  perfilAltitud,
} from './lib/gpx.mjs';
import { tarjetaOG } from './lib/og.mjs';
import { analizarSol, enHoraDorada, tramos } from './lib/sol.mjs';
import { rutaUrl, muestrasPerfil, paginaFicha } from './lib/ficha.mjs';
import { dibujoTrack } from './lib/og.mjs';
import { fecha as fechaCorta } from './lib/formato.mjs';
import { num } from './lib/formato.mjs';
import { EVEREST, NOMBRE } from './lib/sitio.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_GPX = path.join(RAIZ, 'data/gpx');
const OVERRIDES = path.join(RAIZ, 'data/overrides.json');
const REFERENCIA = path.join(RAIZ, 'docs/referencia.json');
const SALIDA = path.join(RAIZ, 'public/rutas.json');
const FOTOS = path.join(RAIZ, 'public/fotos/fotos.json');
const DIR_OG = path.join(RAIZ, 'public/og');
const TEXTOS = path.join(RAIZ, 'content/textos.json');
const DIR_FICHAS = path.join(RAIZ, 'ruta'); // generado: una carpeta por ficha (no va a git)

// Parámetros calibrados con las 3 rutas de prueba contra las cifras de Strava (ver README).
export const PARAMETROS = {
  saltos: { vmax: 4 }, // m/s: más rápido que esto andando es un salto del GPS
  posicion: { radio: 2 }, // media móvil de 5 puntos (±2 s con grabación cada segundo)
  distancia: { minimo: 1 }, // m: movimientos menores no suman (temblor estando parados)
  desnivel: { paso: 10, ventana: 0, umbral: 1.5 }, // remuestreo cada 10 m, sin media móvil, histéresis 1,5 m
  recorte: 200, // m que se quitan al principio y al final antes de publicar el track
  simplificacion: 4, // m de tolerancia Douglas-Peucker para el track publicado
  perfil: 64, // muestras del perfil de altitud (dibujo de la portada)
};

const nfc = (s) => s.normalize('NFC');
const redondear = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

function leerJson(ruta, porDefecto) {
  if (!fs.existsSync(ruta)) return porDefecto;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    console.error(`No se puede leer ${path.relative(RAIZ, ruta)}: ${e.message}`);
    process.exit(1);
  }
}

function leerGpx(archivo) {
  const buf = fs.readFileSync(path.join(DIR_GPX, archivo));
  return (archivo.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');
}

/** Busca el override de una ruta: primero por nombre de archivo, después por fecha. */
function overrideDe(overrides, archivo, fecha) {
  const porArchivo = Object.entries(overrides).find(([k]) => nfc(k) === nfc(archivo));
  if (porArchivo) return { clave: porArchivo[0], ...porArchivo[1] };
  if (fecha && overrides[fecha]) return { clave: fecha, ...overrides[fecha] };
  return null;
}

function procesar(archivo) {
  const { nombre, tipo, inicio, puntos } = parseGpx(leerGpx(archivo));
  if (puntos.length < 2) {
    console.warn(`AVISO  ${archivo}: no tiene puntos de track, se ignora.`);
    return null;
  }
  const limpios = suavizarPosicion(quitarSaltos(puntos, PARAMETROS.saltos), PARAMETROS.posicion);
  const dist = distanciaFiltrada(limpios, PARAMETROS.distancia);
  const tiempo = puntos.find((p) => p.t)?.t ?? inicio;
  const recortados = recortar(limpios, dist, PARAMETROS.recorte);
  const publico = simplificar(recortados, PARAMETROS.simplificacion);
  // El sol se calcula con el GPX entero; los tramos dorados, sobre el track ya recortado.
  const sol = analizarSol(puntos);
  const dorado = sol
    ? tramos(recortados, (p) => enHoraDorada(p, sol)).map((t) => simplificar(t, PARAMETROS.simplificacion))
    : [];

  let bbox = null;
  if (publico.length) {
    const lons = publico.map((p) => p[0]);
    const lats = publico.map((p) => p[1]);
    bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }

  return {
    archivo,
    tipo,
    nombre: nombre || archivo.replace(/\.gpx(\.gz)?$/i, ''),
    fecha: tiempo ? fechaLocal(tiempo) : null,
    hora: tiempo,
    km: redondear(dist[dist.length - 1] / 1000, 2),
    desnivel: redondear(desnivelPositivo(limpios, dist, PARAMETROS.desnivel)),
    altitudMaxima: redondear(altitudMaxima(puntos)),
    bbox,
    perfil: perfilAltitud(limpios, dist, PARAMETROS.perfil),
    sol,
    dorado,
    track: publico,
    // Para la ficha (no van a rutas.json):
    limpios,
    dist,
  };
}

function generar() {
  const overrides = leerJson(OVERRIDES, {});
  const archivos = fs.existsSync(DIR_GPX)
    ? fs.readdirSync(DIR_GPX).filter((f) => /\.gpx(\.gz)?$/i.test(f)).sort()
    : [];

  const rutas = [];
  for (const archivo of archivos) {
    const r = procesar(archivo);
    if (!r) continue;
    const ov = overrideDe(overrides, archivo, r.fecha);
    r.fijado = [];
    if (ov) {
      if (ov.excluir) {
        console.log(`Excluida por overrides.json (${ov.clave}): ${archivo}`);
        continue;
      }
      for (const campo of ['nombre', 'fecha', 'km', 'desnivel', 'altitudMaxima']) {
        if (ov[campo] != null) {
          r[campo] = ov[campo];
          if (campo !== 'nombre') r.fijado.push(campo);
        }
      }
    }
    if (r.tipo && !/hik|walk|senderismo|caminata|trek/i.test(r.tipo)) {
      console.warn(`AVISO  ${archivo}: el GPX dice que es de tipo "${r.tipo}". Si no es una ruta a pie, exclúyela en overrides.json.`);
    }
    if (!r.fecha) console.warn(`AVISO  ${archivo}: no tiene fecha; ponla en overrides.json.`);
    if (!r.sol) console.warn(`AVISO  ${archivo}: el GPX no tiene horas; se queda fuera de la sección «Golden hour».`);
    if (!r.track.length) console.warn(`AVISO  ${archivo}: es demasiado corta para publicar el track recortado.`);
    rutas.push(r);
  }

  rutas.sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || (a.hora ?? '').localeCompare(b.hora ?? ''));
  rutas.forEach((r, i) => {
    r.id = i + 1;
    r.url = rutaUrl(r.id, r.archivo, r.nombre);
  });

  const km = rutas.reduce((s, r) => s + r.km, 0);
  const desnivel = rutas.reduce((s, r) => s + r.desnivel, 0);
  const n = rutas.length;
  const datos = {
    generado: new Date().toISOString(),
    totales: {
      rutas: n,
      km: redondear(km, 1),
      desnivel,
      vecesEverest: redondear(desnivel / EVEREST, 2),
      mediaKm: n ? redondear(km / n, 1) : 0,
      mediaDesnivel: n ? redondear(desnivel / n) : 0,
    },
    rutas: rutas.map(({ id, url, nombre, fecha, km, desnivel, altitudMaxima, bbox, perfil, sol, dorado, track }) => ({
      id,
      url,
      nombre,
      fecha,
      km,
      desnivel,
      altitudMaxima,
      bbox,
      perfil,
      sol,
      dorado,
      track,
    })),
  };

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(datos));
  const kb = (fs.statSync(SALIDA).size / 1024).toFixed(0);
  console.log(`public/rutas.json: ${n} rutas, ${datos.totales.km} km, ${desnivel} m D+ (${kb} KB)`);
  return { datos, rutas };
}

// ---------- comprobación contra el PDF ----------

const pct = (v, ref) => ((v - ref) / ref) * 100;
const conSigno = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const padI = (s, n) => String(s).padStart(n);

function comprobar({ datos, rutas }) {
  const ref = leerJson(REFERENCIA, null);
  if (!ref) {
    console.warn('AVISO  No existe docs/referencia.json; no se compara nada.');
    return;
  }
  const picos = Object.fromEntries((ref.picos ?? []).map((p) => [p.nombre, p.altitud]));
  const usadas = new Set();
  let avisos = 0;

  console.log('\nComprobación contra docs/referencia.json (solo avisa, no rompe el build)\n');
  console.log(`${pad('Fecha', 11)}${pad('Ruta', 26)}${padI('km', 7)}${padI('ref', 7)}${padI('Δ%', 7)}${padI('D+', 6)}${padI('ref', 6)}${padI('Δ%', 7)}${padI('alt', 6)}${padI('ref', 6)}`);
  for (const r of rutas) {
    const candidatas = ref.rutas.filter((x) => x.fecha === r.fecha && !usadas.has(x.n));
    // Si hay dos rutas el mismo día, la de km más parecidos.
    const x = candidatas.sort((a, b) => Math.abs(a.km - r.km) - Math.abs(b.km - r.km))[0];
    if (!x) {
      console.log(`${pad(r.fecha, 11)}${pad(r.nombre, 26)}${padI(r.km.toFixed(2), 7)}   nueva: no está en el PDF`);
      continue;
    }
    usadas.add(x.n);
    const dKm = pct(r.km, x.km);
    const dD = pct(r.desnivel, x.desnivel);
    const altRef = x.altitudMaxima ?? picos[x.nombre] ?? null;
    const notas = [];
    if (Math.abs(dKm) > 3 && !r.fijado.includes('km')) notas.push('km');
    if (Math.abs(dD) > 10 && Math.abs(r.desnivel - x.desnivel) > 20 && !r.fijado.includes('desnivel')) notas.push('desnivel');
    if (altRef != null && r.altitudMaxima != null && !r.fijado.includes('altitudMaxima')) {
      // Para nombres repetidos el PDF solo da la altitud de la más alta: basta con no pasarse.
      const fuera = x.altitudMaxima != null ? Math.abs(r.altitudMaxima - altRef) > 15 : r.altitudMaxima - altRef > 15;
      if (fuera) notas.push('altitud');
    }
    if (r.fijado.length) notas.push(`fijado a mano: ${r.fijado.join(', ')}`);
    if (notas.some((s) => !s.startsWith('fijado'))) avisos++;
    console.log(
      `${pad(r.fecha, 11)}${pad(r.nombre, 26)}${padI(r.km.toFixed(2), 7)}${padI(x.km.toFixed(2), 7)}${padI(conSigno(dKm), 7)}` +
        `${padI(r.desnivel, 6)}${padI(x.desnivel, 6)}${padI(conSigno(dD), 7)}${padI(r.altitudMaxima ?? '–', 6)}${padI(altRef != null ? (x.altitudMaxima != null ? altRef : '≤' + altRef) : '–', 6)}` +
        (notas.length ? `  ${notas.some((s) => !s.startsWith('fijado')) ? 'AVISO ' : ''}${notas.join('; ')}` : ''),
    );
  }

  const faltan = ref.rutas.filter((x) => !usadas.has(x.n));
  if (faltan.length) {
    console.log(`\nFaltan ${faltan.length} de las ${ref.rutas.length} rutas del PDF (no hay GPX para esas fechas):`);
    console.log('  ' + faltan.map((x) => `${x.n}. ${x.nombre} (${x.fecha})`).join(' · '));
  }

  const t = datos.totales;
  const rt = ref.totales;
  console.log('\nTotales            web      PDF');
  console.log(`  rutas     ${padI(t.rutas, 10)}${padI(rt.rutas, 9)}`);
  console.log(`  km        ${padI(t.km.toFixed(1), 10)}${padI(rt.km.toFixed(1), 9)}  (${conSigno(pct(t.km, rt.km))} %)`);
  console.log(`  D+ (m)    ${padI(t.desnivel, 10)}${padI(rt.desnivel, 9)}  (${conSigno(pct(t.desnivel, rt.desnivel))} %)`);
  console.log(`  media     ${padI(`${t.mediaKm} km · ${t.mediaDesnivel} m`, 18)}  PDF: ${rt.mediaKm} km · ${rt.mediaDesnivel} m`);
  if (t.rutas !== rt.rutas) {
    console.log(`  Los totales no se pueden comparar todavía: hay ${t.rutas} rutas y el PDF tiene ${rt.rutas}.`);
  } else if (Math.abs(pct(t.km, rt.km)) > 2 || Math.abs(pct(t.desnivel, rt.desnivel)) > 5) {
    console.log('  AVISO  Los totales se desvían bastante del PDF.');
    avisos++;
  }
  console.log(avisos ? `\n${avisos} aviso(s). Revisa las rutas marcadas o fíjalas en data/overrides.json.` : '\nSin desviaciones grandes.');
}

// ---------- imágenes para compartir (Open Graph) ----------

async function imagenesOG({ datos }) {
  const fotos = leerJson(FOTOS, { fotos: [] }).fotos ?? [];
  const portada = fotos.find((f) => f.papel === 'portada');
  const t = datos.totales;
  await tarjetaOG({
    raiz: RAIZ,
    salida: path.join(DIR_OG, 'portada.jpg'),
    fondo: portada ? path.join(RAIZ, 'public/fotos', portada.grande.archivo) : null,
    antetitulo: 'Senderismo en Navarra',
    titulo: NOMBRE,
    pie: `${num(t.rutas)} rutas · ${num(t.km, 1)} km · ${num(t.desnivel)} m D+`,
    anchoTitulo: 900,
  });
}

// ---------- fichas de ruta ----------

/** Fecha de una ruta para emparejar fotos: la del nombre del GPX (AAAA-MM-DD_…) o la calculada. */
const fechaArchivo = (r) => (r.archivo.match(/^(\d{4}-\d{2}-\d{2})_/) || [])[1] ?? r.fecha;

async function fichas({ datos, rutas }) {
  const textos = leerJson(TEXTOS, {});
  const fotos = leerJson(FOTOS, { fotos: [] }).fotos ?? [];
  fs.rmSync(DIR_FICHAS, { recursive: true, force: true });
  for (const [i, r] of rutas.entries()) {
    const publica = datos.rutas[i];
    const muestras = muestrasPerfil(r.limpios, r.dist, {
      recorte: PARAMETROS.recorte,
      dorado: (p) => enHoraDorada(p, r.sol),
    });
    // Fotos asignadas por la fecha del nombre del archivo.
    const suyas = fotos.filter((f) => f.grande.archivo.startsWith(`${fechaArchivo(r)}_`));
    const html = paginaFicha({
      ruta: publica,
      muestras,
      fotos: suyas,
      anterior: datos.rutas[i - 1],
      siguiente: datos.rutas[i + 1],
      textos,
      total: datos.rutas.length,
    });
    fs.mkdirSync(path.join(RAIZ, r.url), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, r.url, 'index.html'), html);

    const n2 = String(r.id).padStart(2, '0');
    await tarjetaOG({
      raiz: RAIZ,
      salida: path.join(DIR_OG, `ruta-${n2}.jpg`),
      antetitulo: `${NOMBRE} · ruta ${r.id} · ${fechaCorta(r.fecha)}`,
      titulo: r.nombre,
      pie: `${num(r.km, 2)} km · ${num(r.desnivel)} m D+ · cima ${num(r.altitudMaxima)} m`,
      extra: dibujoTrack(r.track, { x: 760, y: 120, ancho: 380, alto: 360 }),
      anchoTitulo: 640,
    });
  }
  console.log(`ruta/: ${rutas.length} fichas generadas`);
}

const resultado = generar();
if (process.argv.includes('--comprobar')) comprobar(resultado);
await imagenesOG(resultado);
await fichas(resultado);
