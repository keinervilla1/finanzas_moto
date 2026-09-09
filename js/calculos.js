/* =========================================================================
   DOMI — Cálculos derivados del estado
   Funciones que leen `state` y devuelven datos ya masticados para el render.
   No tocan el DOM ni Firestore.
   ========================================================================= */

import { state } from './state.js';
import { DIAS_SEMANA } from './config.js';
import { toDateKey, addDays, tiempoCreacion } from './utils.js';

/** Domicilios de una fecha en orden cronológico real (el primero realizado va
 *  primero). Se ordena por hora y, si dos quedaron con la misma hora, se
 *  desempata por el instante real de guardado — así el orden refleja el
 *  recorrido del día tal como ocurrió. */
export function entregasRealizadasEn(fechaKey) {
  return state.entregas
    .filter(e => e.fecha === fechaKey)
    .sort((a, b) => {
      const porHora = (a.hora || '').localeCompare(b.hora || '');
      return porHora !== 0 ? porHora : tiempoCreacion(a) - tiempoCreacion(b);
    });
}

export function entregasPagadasEl(fechaKey) {
  return state.entregas.filter(e => e.pagado && e.fechaPago === fechaKey);
}

export function gastosDe(fechaKey) {
  return state.gastos.filter(g => g.fecha === fechaKey);
}

export function totalDe(lista) {
  return lista.reduce((sum, e) => sum + Number(e.valor), 0);
}

/** Los 7 días de la semana que empieza en `monday`, con los ingresos (pagos)
 *  de cada uno. */
export function totalesPorDia(monday) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = addDays(monday, i);
    const fechaKey = toDateKey(fecha);
    const ingresos = totalDe(entregasPagadasEl(fechaKey));
    dias.push({ fecha, fechaKey, nombre: DIAS_SEMANA[i], total: ingresos });
  }
  return dias;
}
