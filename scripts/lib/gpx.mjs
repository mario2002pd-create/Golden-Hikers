// Utilidades para leer GPX y calcular las cifras de cada ruta. Sin dependencias.

const R = 6371008.8; // radio medio de la Tierra (m)
const rad = (g) => (g * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .trim();

/** Devuelve { nombre, puntos: [{lat, lon, ele, t}] } con todos los segmentos seguidos. */
export function parseGpx(xml) {
  const trk = xml.match(/<trk>([\s\S]*?)<\/trk>/);
  const cuerpo = trk ? trk[1] : xml;
  const nombre = decode((cuerpo.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '');
  const puntos = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? m[3];
    const inner = m[2] ?? '';
    const lat = parseFloat((attrs.match(/lat="([^"]+)"/) || [])[1]);
    const lon = parseFloat((attrs.match(/lon="([^"]+)"/) || [])[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleM = inner.match(/<ele>([^<]+)<\/ele>/);
    const tM = inner.match(/<time>([^<]+)<\/time>/);
    puntos.push({
      lat,
      lon,
      ele: eleM ? parseFloat(eleM[1]) : null,
      t: tM ? tM[1].trim() : null,
    });
  }
  return { nombre, puntos };
}

/** Distancia acumulada (m) en cada punto. */
export function distanciaAcumulada(puntos) {
  const d = new Float64Array(puntos.length);
  for (let i = 1; i < puntos.length; i++) d[i] = d[i - 1] + haversine(puntos[i - 1], puntos[i]);
  return d;
}

/**
 * Desnivel positivo parecido al de Strava:
 * 1) remuestrea la altitud cada `paso` metros recorridos,
 * 2) la suaviza con una media móvil de `ventana` metros,
 * 3) suma subidas con histéresis de `umbral` metros (ignora el ruido pequeño).
 */
export function desnivelPositivo(puntos, dist, { paso = 10, ventana = 100, umbral = 2 } = {}) {
  const idx = [];
  for (let i = 0; i < puntos.length; i++) if (puntos[i].ele != null && Number.isFinite(puntos[i].ele)) idx.push(i);
  if (idx.length < 2) return 0;

  const total = dist[idx[idx.length - 1]] - dist[idx[0]];
  const n = Math.max(2, Math.floor(total / paso) + 1);
  const ele = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const x = dist[idx[0]] + k * paso;
    while (j < idx.length - 2 && dist[idx[j + 1]] < x) j++;
    const a = idx[j];
    const b = idx[j + 1];
    const span = dist[b] - dist[a];
    const f = span > 0 ? Math.min(1, Math.max(0, (x - dist[a]) / span)) : 0;
    ele[k] = puntos[a].ele + f * (puntos[b].ele - puntos[a].ele);
  }

  const w = Math.max(0, Math.round(ventana / paso / 2));
  const suave = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    let c = 0;
    for (let q = Math.max(0, k - w); q <= Math.min(n - 1, k + w); q++) {
      s += ele[q];
      c++;
    }
    suave[k] = s / c;
  }

  let gain = 0;
  let ancla = suave[0];
  for (let k = 1; k < n; k++) {
    const v = suave[k];
    if (v - ancla >= umbral) {
      gain += v - ancla;
      ancla = v;
    } else if (ancla - v >= umbral) {
      ancla = v;
    }
  }
  return gain;
}

/** Altitud máxima con un suavizado mínimo para no coger picos sueltos del GPS. */
export function altitudMaxima(puntos) {
  const e = puntos.map((p) => p.ele).filter((v) => v != null && Number.isFinite(v));
  if (!e.length) return null;
  let max = -Infinity;
  for (let i = 0; i < e.length; i++) {
    const a = e[Math.max(0, i - 2)];
    const b = e[Math.min(e.length - 1, i + 2)];
    const v = (a + e[i] + b) / 3;
    if (v > max) max = v;
  }
  return max;
}

/** Quita los primeros y últimos `metros` del recorrido (privacidad). */
export function recortar(puntos, dist, metros = 200) {
  const total = dist[dist.length - 1];
  if (total <= metros * 2 + 50) return [];
  const salida = [];
  for (let i = 0; i < puntos.length; i++) {
    if (dist[i] >= metros && dist[i] <= total - metros) salida.push(puntos[i]);
  }
  return salida;
}

/** Douglas-Peucker en metros (proyección equirectangular local). Devuelve [[lon, lat], ...]. */
export function simplificar(puntos, tolerancia = 6) {
  if (puntos.length < 3) return puntos.map((p) => [p.lon, p.lat]);
  const lat0 = rad(puntos[0].lat);
  const xy = puntos.map((p) => [rad(p.lon) * Math.cos(lat0) * R, rad(p.lat) * R]);
  const keep = new Uint8Array(puntos.length);
  keep[0] = keep[puntos.length - 1] = 1;
  const tol2 = tolerancia * tolerancia;
  const pila = [[0, puntos.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) {
        maxD = d2;
        maxI = i;
      }
    }
    if (maxD > tol2 && maxI > 0) {
      keep[maxI] = 1;
      pila.push([a, maxI], [maxI, b]);
    }
  }
  const out = [];
  for (let i = 0; i < puntos.length; i++) {
    if (keep[i]) out.push([+puntos[i].lon.toFixed(5), +puntos[i].lat.toFixed(5)]);
  }
  return out;
}

/** Fecha local (Europe/Madrid) en formato AAAA-MM-DD. */
export function fechaLocal(iso) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(new Date(iso));
}
