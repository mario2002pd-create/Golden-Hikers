// La ruta frente al sol: puesta de sol y hora dorada en la cima, con SunCalc.
// Hora dorada = de `goldenHour` (el sol a 6° sobre el horizonte) a `sunset`.

import * as SunCalc from 'suncalc';

const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const MIN = 60000;

/** Índice del punto más alto (mediana de 3 para no coger un pico suelto del GPS). */
export function indiceCima(puntos) {
  // Solo los puntos con altitud (algunos GPX de Strava la traen en uno de cada pocos puntos).
  const idx = [];
  for (let i = 0; i < puntos.length; i++) if (Number.isFinite(puntos[i].ele)) idx.push(i);
  let mejor = -1;
  let max = -Infinity;
  for (let k = 0; k < idx.length; k++) {
    const a = puntos[idx[Math.max(0, k - 1)]].ele;
    const b = puntos[idx[k]].ele;
    const c = puntos[idx[Math.min(idx.length - 1, k + 1)]].ele;
    const v = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    if (v > max) {
      max = v;
      mejor = idx[k];
    }
  }
  return mejor;
}

/**
 * Datos de sol de una ruta. Devuelve null si el GPX no tiene horas.
 * - deManana: empezó antes del mediodía solar (no iba a por el atardecer).
 * - vioOcaso: estábamos andando en el momento de la puesta de sol.
 * - minCimaOcaso: minutos de la cima respecto a la puesta (negativo = antes).
 * - minutosDorados: tiempo andado dentro de la hora dorada.
 */
export function analizarSol(puntos) {
  const conHora = puntos.filter((p) => p.t);
  if (conHora.length < 2) return null;
  const iCima = indiceCima(conHora);
  const cima = conHora[iCima >= 0 ? iCima : 0];
  const t = SunCalc.getTimes(new Date(cima.t), cima.lat, cima.lon);
  const inicio = ms(conHora[0].t);
  const fin = ms(conHora[conHora.length - 1].t);
  const ocaso = t.sunset.getTime();
  const dorada = t.goldenHour.getTime();

  let minutosDorados = 0;
  for (let i = 1; i < conHora.length; i++) {
    const a = Math.max(ms(conHora[i - 1].t), dorada);
    const b = Math.min(ms(conHora[i].t), ocaso);
    if (b > a) minutosDorados += (b - a) / MIN;
  }

  return {
    inicio: conHora[0].t,
    fin: conHora[conHora.length - 1].t,
    cima: cima.t,
    ocaso: t.sunset.toISOString(),
    horaDorada: t.goldenHour.toISOString(),
    amanecer: t.sunrise.toISOString(),
    mediodia: t.solarNoon.toISOString(),
    deManana: inicio < t.solarNoon.getTime(),
    vioOcaso: inicio <= ocaso && ocaso <= fin,
    minCimaOcaso: Math.round((ms(cima.t) - ocaso) / MIN),
    minutosDorados: Math.round(minutosDorados),
  };
}

/** ¿Este punto se anduvo en hora dorada? */
export const enHoraDorada = (p, sol) => {
  if (!sol || !p.t) return false;
  const x = ms(p.t);
  return x >= ms(sol.horaDorada) && x <= ms(sol.ocaso);
};

/** Tramos seguidos de puntos que cumplen `cond` (cada tramo con al menos 2 puntos). */
export function tramos(puntos, cond) {
  const salida = [];
  let actual = null;
  for (const p of puntos) {
    if (cond(p)) {
      if (!actual) salida.push((actual = []));
      actual.push(p);
    } else {
      actual = null;
    }
  }
  return salida.filter((t) => t.length > 1);
}
