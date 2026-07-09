/**
 * UTILIDADES DE FECHAS
 * 
 * Funciones para trabajar con fechas de forma consistente
 */

/**
 * Convierte una Date a string clave YYYY-MM-DD
 */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Obtiene el lunes de la semana de una fecha
 */
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Suma días a una fecha
 */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Obtiene rango de semana
 */
export function getWeekRange(date) {
  const monday = getMonday(date);
  const sunday = addDays(monday, 6);
  return { monday, sunday };
}

/**
 * Obtiene rango de mes
 */
export function getMonthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
  };
}

/**
 * Calcula diferencia en días entre dos fechas
 */
export function diasDiferencia(fecha1, fecha2) {
  const ms = Math.abs(new Date(fecha2) - new Date(fecha1));
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Obtiene días desde hoy
 */
export function diasDesdeHoy(dateKey) {
  const hoy = new Date();
  const fecha = new Date(dateKey);
  return diasDiferencia(fecha, hoy);
}