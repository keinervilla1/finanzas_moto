/* =========================================================================
   DOMI — Utilidades puras
   Funciones sin estado ni efectos secundarios: formato de dinero y fechas,
   escape de HTML, generación de ids. Se pueden usar desde cualquier módulo.
   ========================================================================= */

import { MESES } from './config.js';

/** Formatea un número como pesos colombianos: 12500 → "$12.500". */
export function formatCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

/** "14:05" → "2:05 p. m.". Devuelve "—" si no hay hora. */
export function formatHora12(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const periodo = h >= 12 ? 'p. m.' : 'a. m.';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

/** Date → "YYYY-MM-DD" en hora local (la clave con que se guarda en Firestore). */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Lunes (00:00) de la semana a la que pertenece `date`. */
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatFechaLarga(date) {
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

export function formatFechaCorta(fechaKey) {
  const d = new Date(fechaKey + 'T00:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

export function rangoSemanaTexto(monday) {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} ${MESES[monday.getMonth()].slice(0, 3)} – ${sunday.getDate()} ${MESES[sunday.getMonth()].slice(0, 3)}`;
}

/** Id corto y único para elementos que solo viven en el dispositivo (frecuentes). */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Domicilios frecuentes que se crean automáticamente para un usuario nuevo. */
export function frecuentesPorDefecto() {
  return [
    { id: uid(), nombre: 'Éxito', valor: 6500 },
    { id: uid(), nombre: 'D1', valor: 5000 },
    { id: uid(), nombre: 'Ara', valor: 4800 },
    { id: uid(), nombre: 'Farmatodo', valor: 7000 }
  ];
}

/** Escapa texto del usuario antes de insertarlo con innerHTML. */
export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/** Empate estable al ordenar dos registros con la misma "hora": usa el
 *  instante real de creación en el servidor (Firestore Timestamp). */
export function tiempoCreacion(e) {
  return e.creadoEn && typeof e.creadoEn.toMillis === 'function' ? e.creadoEn.toMillis() : 0;
}
