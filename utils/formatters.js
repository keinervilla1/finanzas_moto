/**
 * UTILIDADES DE FORMATEO
 * 
 * Funciones para formatear datos de forma consistente
 */

const MONEDA_COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(valor) {
  const num = Number(valor) || 0;
  return MONEDA_COP.format(num);
}

export function formatPorcentaje(valor, decimales = 1) {
  return `${(Number(valor) || 0).toFixed(decimales)}%`;
}

export function formatHora(hhmm) {
  if (!hhmm) return '—';
  const [hh, mm] = hhmm.split(':');
  const h = parseInt(hh);
  const periodo = h >= 12 ? 'p. m.' : 'a. m.';
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${periodo}`;
}

export function formatFecha(dateKey) {
  if (!dateKey) return '—';
  const [year, month, day] = dateKey.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function formatFechaLarga(dateKey) {
  if (!dateKey) return '—';
  const [year, month, day] = dateKey.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}