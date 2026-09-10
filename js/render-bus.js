/* =========================================================================
   DOMI — Puente de render
   Rompe la dependencia circular entre la capa de datos (que necesita pedir un
   repintado cuando llegan snapshots) y la de render (que necesita la de datos
   para cargar/borrar). Los datos llaman a solicitarRenderTodo(); los módulos
   de render registran su función con registrarRender().
   ========================================================================= */

const tareas = new Set();

/** Cada módulo que pinta algo se registra una vez, al cargar. */
export function registrarRender(fn) {
  tareas.add(fn);
}

/** Junta varias llamadas seguidas (p. ej. cuando llegan varios snapshots casi
 *  a la vez al iniciar sesión) en un solo repintado. */
let pendiente = false;
export function solicitarRenderTodo() {
  if (pendiente) return;
  pendiente = true;
  queueMicrotask(() => { pendiente = false; tareas.forEach(fn => fn()); });
}
