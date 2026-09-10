/* =========================================================================
   DOMI — Estado en memoria compartido entre módulos
   Objetos vivos (se mutan en el sitio) y flags de sesión con setter, para que
   varios módulos vean el mismo estado sin variables globales sueltas.
   ========================================================================= */

import { META_SEMANAL_DEFAULT } from './config.js';

/** Datos "activos" (en tiempo real): semana actual + deudas pendientes + perfil. */
export const state = {
  entregas: [],   // domicilios de la semana actual (+ pagos de deudas antiguas cobradas esta semana)
  gastos: [],     // gastos de la semana actual
  deudas: [],     // TODOS los domicilios con pagado:false (sin importar la semana)
  frecuentes: [],
  clientes: [],   // personas/negocios registrados para agrupar cobros
  meta: META_SEMANAL_DEFAULT
};

/** Datos "bajo demanda" para las pantallas Registros, Gastos e Historial. */
export const registros = { items: [], cursor: null, hasMore: true, rango: 'semana', cargando: false };
export const gastosVista = { items: [], rango: 'hoy' };
export const historialSemanas = { cargado: false, semanas: [] };

/** Listeners de Firestore activos: { perfil, entregasSemana, ... }. */
export const unsubs = {};

export let currentUid = null;
export function setCurrentUid(v) { currentUid = v; }

export let migracionHecha = false;
export function setMigracionHecha(v) { migracionHecha = v; }

/* -------------------------------------------------------------------------
   state.entregas se arma juntando dos consultas (realizadas esta semana +
   pagadas esta semana). Cada consulta guarda su propio grupo y en cada
   snapshot lo reemplaza COMPLETO: así, si un domicilio se borra o se edita
   desde otro dispositivo y deja de cumplir el filtro, desaparece de verdad
   en vez de quedar como registro fantasma sumando en los totales.
   ------------------------------------------------------------------------- */
const grupos = { realizadasSemana: [], pagadasSemana: [] };

export function reemplazarGrupoEntregas(grupo, items) {
  grupos[grupo] = items;
  const m = new Map();
  grupos.realizadasSemana.forEach(e => m.set(e.id, e));
  grupos.pagadasSemana.forEach(e => m.set(e.id, e));
  state.entregas = [...m.values()];
}

export function olvidarEntregaLocal(id) {
  grupos.realizadasSemana = grupos.realizadasSemana.filter(e => e.id !== id);
  grupos.pagadasSemana = grupos.pagadasSemana.filter(e => e.id !== id);
  state.entregas = state.entregas.filter(e => e.id !== id);
}

export function limpiarGruposEntregasSemana() {
  grupos.realizadasSemana = [];
  grupos.pagadasSemana = [];
}
