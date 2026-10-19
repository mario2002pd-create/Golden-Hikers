// Sección «Golden hour»: cifras y gráficos SVG generados en el build (sin librerías).

import { esc, num, fecha, horaLocal } from './formato.mjs';

const MIN = 60000;
const ms = (iso) => Date.parse(iso);

/** "43 min antes de la puesta de sol", "1 h 24 min después de la puesta de sol"… */
export function respectoOcaso(min) {
  if (min === 0) return 'justo al ponerse el sol';
  const a = Math.abs(min);
  const t = a >= 60 ? `${Math.floor(a / 60)} h${a % 60 ? ` ${a % 60} min` : ''}` : `${a} min`;
  return `${t} ${min < 0 ? 'antes' : 'después'} de la puesta de sol`;
}

const duracion = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`);

/** Minutos desde la medianoche local (Europe/Madrid). */
function minutosDelDia(iso) {
  const [h, m] = horaLocal(iso).split(':').map(Number);
  return h * 60 + m;
}

const mmss = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/**
 * Un gráfico de filas: cada ruta es una barra de la salida a la llegada.
 * `x(ruta)` devuelve { inicio, fin, cima, tramos: [{desde, hasta, clase}] } en la unidad del eje.
 */
function graficoFilas({ rutas, dominio, ticks, guia, banda, valores, x, enlace, ancho, estrecho, etiquetaEje }) {
  const etiquetaAncho = estrecho ? 0 : 230;
  const valorAncho = estrecho ? 0 : 150;
  const izq = estrecho ? 6 : etiquetaAncho + 16;
  const der = ancho - (estrecho ? 6 : valorAncho + 12);
  const filaAlto = estrecho ? 50 : 34;
  const arriba = 44;
  const alto = arriba + rutas.length * filaAlto + 12;
  const px = (v) => izq + ((v - dominio[0]) / (dominio[1] - dominio[0])) * (der - izq);

  let svg = `<svg class="gh-grafico${estrecho ? ' gh-estrecho' : ' gh-ancho'}" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${esc(etiquetaEje)}">`;
  if (banda) {
    svg += `<rect class="gh-banda" x="${px(banda.desde).toFixed(1)}" y="${arriba - 8}" width="${(px(banda.hasta) - px(banda.desde)).toFixed(1)}" height="${alto - arriba}" />`;
    svg += `<text class="gh-eje gh-eje-dorado" x="${((px(banda.desde) + px(banda.hasta)) / 2).toFixed(1)}" y="${arriba - 14}" text-anchor="middle">${esc(banda.texto)}</text>`;
  }
  for (const t of ticks) {
    const xx = px(t.v).toFixed(1);
    svg += `<line class="gh-rejilla" x1="${xx}" x2="${xx}" y1="${arriba - 6}" y2="${alto - 8}" />`;
    if (!t.oculta) svg += `<text class="gh-eje" x="${xx}" y="${arriba - (banda ? 30 : 14)}" text-anchor="middle">${esc(t.texto)}</text>`;
  }
  if (guia) {
    const xx = px(guia.v).toFixed(1);
    svg += `<line class="gh-guia" x1="${xx}" x2="${xx}" y1="${arriba - 6}" y2="${alto - 8}" />`;
  }

  rutas.forEach((r, i) => {
    const y0 = arriba + i * filaAlto;
    const yb = estrecho ? y0 + 32 : y0 + filaAlto / 2;
    const d = x(r);
    const titulo = valores.titulo(r);
    let fila = `<g class="gh-fila"><title>${esc(titulo)}</title>`;
    fila += `<rect class="gh-impacto" x="0" y="${y0}" width="${ancho}" height="${filaAlto}" />`;
    if (estrecho) {
      // En estrecho no cabe todo en una línea: fecha sin año y valor sin «cima».
      const diaMes = fecha(r.fecha).replace(/ \d{4}$/, '');
      fila += `<text class="gh-nombre" x="${izq}" y="${y0 + 16}">${esc(r.nombre)} <tspan class="gh-fecha">${esc(diaMes)}</tspan></text>`;
      fila += `<text class="gh-valor" x="${der}" y="${y0 + 16}" text-anchor="end">${esc(valores.corto(r).replace(/^cima /, ''))}</text>`;
    } else {
      fila += `<text class="gh-nombre" x="${etiquetaAncho}" y="${yb - 2}" text-anchor="end">${esc(r.nombre)}</text>`;
      fila += `<text class="gh-fecha" x="${etiquetaAncho}" y="${yb + 11}" text-anchor="end">${esc(fecha(r.fecha))}</text>`;
      fila += `<text class="gh-valor" x="${ancho - 4}" y="${yb + 4}" text-anchor="end">${esc(valores.corto(r))}</text>`;
    }
    fila += `<line class="gh-barra" x1="${px(d.inicio).toFixed(1)}" x2="${px(d.fin).toFixed(1)}" y1="${yb}" y2="${yb}" />`;
    for (const t of d.tramos) {
      if (t.hasta > t.desde) fila += `<line class="${t.clase}" x1="${px(t.desde).toFixed(1)}" x2="${px(t.hasta).toFixed(1)}" y1="${yb}" y2="${yb}" />`;
    }
    fila += `<circle class="gh-cima" cx="${px(d.cima).toFixed(1)}" cy="${yb}" r="${estrecho ? 5.5 : 6}" />`;
    fila += '</g>';
    const url = enlace?.(r);
    svg += url ? `<a href="${esc(url)}">${fila}</a>` : fila;
  });
  return svg + '</svg>';
}

/** HTML de la sección. `enlace(ruta)` devuelve la URL de la ficha (opcional). */
export function seccionGolden(datos, textos, { numero = '03', enlace } = {}) {
  const conSol = datos.rutas.filter((r) => r.sol);
  const tarde = conSol.filter((r) => !r.sol.deManana);
  const manana = conSol.filter((r) => r.sol.deManana);
  if (!conSol.length) return '';
  const g = textos.goldenHour ?? {};

  const vieron = tarde.filter((r) => r.sol.vioOcaso).length;
  const ajustada = tarde.reduce((a, b) => (Math.abs(b.sol.minCimaOcaso) < Math.abs(a.sol.minCimaOcaso) ? b : a), tarde[0]);
  const dorados = conSol.reduce((s, r) => s + r.sol.minutosDorados, 0);

  // ----- tarde: minutos respecto a la puesta de sol -----
  let graficoTarde = '';
  if (tarde.length) {
    const rel = (r, iso) => (ms(iso) - ms(r.sol.ocaso)) / MIN;
    const minX = Math.floor(Math.min(...tarde.map((r) => rel(r, r.sol.inicio))) / 60) * 60;
    const maxX = Math.ceil(Math.max(...tarde.map((r) => rel(r, r.sol.fin)), 30) / 30) * 30;
    const ticks = [];
    for (let v = minX; v <= maxX; v += 60) ticks.push({ v, texto: v === 0 ? '' : `${v > 0 ? '+' : '−'}${Math.abs(v / 60)} h` });
    const mediaDorada = tarde.reduce((s, r) => s + rel(r, r.sol.horaDorada), 0) / tarde.length;
    const opciones = {
      rutas: tarde,
      dominio: [minX, maxX],
      ticks,
      guia: { v: 0 },
      banda: { desde: mediaDorada, hasta: 0, texto: 'hora dorada · puesta' },
      etiquetaEje: 'Cada ruta de tarde respecto a la puesta de sol: de la salida a la llegada, con la cima marcada',
      enlace,
      valores: {
        corto: (r) => (r.sol.minCimaOcaso === 0 ? 'cima: 0 min' : `cima ${r.sol.minCimaOcaso > 0 ? '+' : '−'}${Math.abs(r.sol.minCimaOcaso)} min`),
        titulo: (r) =>
          `${r.nombre} · ${fecha(r.fecha)} — salida ${horaLocal(r.sol.inicio)}, cima ${horaLocal(r.sol.cima)}, llegada ${horaLocal(r.sol.fin)}; puesta de sol ${horaLocal(r.sol.ocaso)}. Cima ${respectoOcaso(r.sol.minCimaOcaso)}; ${r.sol.minutosDorados} min andados en hora dorada.`,
      },
      x: (r) => ({
        inicio: rel(r, r.sol.inicio),
        fin: rel(r, r.sol.fin),
        cima: rel(r, r.sol.cima),
        tramos: [
          { desde: Math.max(rel(r, r.sol.inicio), rel(r, r.sol.horaDorada)), hasta: Math.min(rel(r, r.sol.fin), 0), clase: 'gh-dorado' },
          { desde: Math.max(rel(r, r.sol.inicio), 0), hasta: rel(r, r.sol.fin), clase: 'gh-noche' },
        ],
      }),
    };
    graficoTarde =
      graficoFilas({ ...opciones, ancho: 1000, estrecho: false }) +
      graficoFilas({ ...opciones, ancho: 360, estrecho: true, ticks: ticks.map((t) => ({ ...t, oculta: t.v % 120 !== 0 && t.v !== 0 })) });
  }

  // ----- mañana: hora del reloj -----
  let graficoManana = '';
  if (manana.length) {
    const minX = Math.floor(Math.min(...manana.map((r) => minutosDelDia(r.sol.inicio))) / 60) * 60;
    const maxX = Math.ceil(Math.max(...manana.map((r) => minutosDelDia(r.sol.fin))) / 60) * 60;
    const ticks = [];
    for (let v = minX; v <= maxX; v += 60) ticks.push({ v, texto: mmss(v) });
    const opciones = {
      rutas: manana,
      dominio: [minX, maxX],
      ticks,
      etiquetaEje: 'Cada ruta de mañana en hora del reloj: de la salida a la llegada, con la cima marcada',
      enlace,
      valores: {
        corto: (r) => `cima ${horaLocal(r.sol.cima)}`,
        titulo: (r) => `${r.nombre} · ${fecha(r.fecha)} — salida ${horaLocal(r.sol.inicio)}, cima ${horaLocal(r.sol.cima)}, llegada ${horaLocal(r.sol.fin)}.`,
      },
      x: (r) => ({
        inicio: minutosDelDia(r.sol.inicio),
        fin: minutosDelDia(r.sol.fin),
        cima: minutosDelDia(r.sol.cima),
        tramos: [],
      }),
    };
    graficoManana =
      graficoFilas({ ...opciones, ancho: 1000, estrecho: false }) +
      graficoFilas({ ...opciones, ancho: 360, estrecho: true, ticks: ticks.map((t) => ({ ...t, oculta: (t.v / 60) % 2 !== 0 })) });
  }

  const cifra = (valor, unidad, texto) =>
    `<div class="gh-cifra"><dd>${valor}${unidad ? `<small>${unidad}</small>` : ''}</dd><dt>${texto}</dt></div>`;

  return `<section class="golden" id="golden-hour" aria-labelledby="titulo-golden">
      <div class="golden-cielo" aria-hidden="true"></div>
      <div class="bloque-cabecera">
        <h2 id="titulo-golden"><span class="seccion-n">${numero}</span>${esc(g.titulo ?? 'Golden hour')}</h2>
      </div>
      <p class="golden-entradilla">${esc(g.entradilla ?? '')}</p>
      <dl class="gh-cifras">
        ${cifra(`${num(vieron)}<span class="gh-de">/${num(tarde.length)}</span>`, '', `rutas de tarde vieron ponerse el sol desde el monte`)}
        ${ajustada ? cifra(`${ajustada.sol.minCimaOcaso > 0 ? '+' : ajustada.sol.minCimaOcaso < 0 ? '−' : ''}${num(Math.abs(ajustada.sol.minCimaOcaso))}`, 'min', `la cima más ajustada al ocaso: ${esc(ajustada.nombre)}, ${esc(fecha(ajustada.fecha))} (${esc(respectoOcaso(ajustada.sol.minCimaOcaso))})`) : ''}
        ${cifra(esc(duracion(dorados)), '', 'andadas en hora dorada, sumando todas las rutas')}
      </dl>
      ${
        graficoTarde
          ? `<figure class="gh-figura">
        <figcaption>
          <h3>Las de tarde, frente a la puesta de sol</h3>
          <ul class="gh-leyenda" aria-label="Leyenda">
            <li><i class="gh-l-barra"></i>andando</li>
            <li><i class="gh-l-dorado"></i>en hora dorada</li>
            <li><i class="gh-l-noche"></i>después de la puesta</li>
            <li><i class="gh-l-cima"></i>cima</li>
          </ul>
        </figcaption>
        ${graficoTarde}
      </figure>`
          : ''
      }
      ${
        graficoManana
          ? `<figure class="gh-figura gh-manana">
        <figcaption>
          <h3>Las de mañana</h3>
          <p>${esc(g.manana ?? '')}</p>
        </figcaption>
        ${graficoManana}
      </figure>`
          : ''
      }
    </section>`;
}
