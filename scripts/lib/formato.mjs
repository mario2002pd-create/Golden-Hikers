// Formato es-ES compartido por el build (Node) y la web (navegador).

const formatos = new Map();
export function num(v, decimales = 0) {
  if (!formatos.has(decimales)) {
    formatos.set(
      decimales,
      new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
        useGrouping: 'always', // en es-ES, 1249 se queda sin punto si no se fuerza
      }),
    );
  }
  return formatos.get(decimales).format(v);
}

/** "AAAA-MM-DD" como fecha local, sin líos de zona horaria. */
export function fechaLocal(aaaammdd) {
  const [a, m, d] = aaaammdd.split('-').map(Number);
  return new Date(a, m - 1, d);
}

const corta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const larga = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const mes = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export const fecha = (s) => (s ? corta.format(fechaLocal(s)).replace('.', '') : 'sin fecha');
export const fechaLarga = (s) => larga.format(typeof s === 'string' && s.length === 10 ? fechaLocal(s) : new Date(s));
/** Hora local de Navarra (HH:MM) de un instante ISO. */
export const horaLocal = (iso) => (iso ? hora.format(new Date(iso)) : null);

/** "ago 2025 – oct 2026" a partir de las fechas de las rutas. */
export function rango(fechas) {
  const f = fechas.filter(Boolean).sort();
  if (!f.length) return '';
  const a = mes.format(fechaLocal(f[0])).replace('.', '');
  const b = mes.format(fechaLocal(f[f.length - 1])).replace('.', '');
  return a === b ? a : `${a} – ${b}`;
}

/** Veces el Everest: con dos decimales si no llega a uno. */
export const vecesEverest = (desnivel, everest = 8849) => {
  const v = desnivel / everest;
  return num(v, v < 1 ? 2 : 1);
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
