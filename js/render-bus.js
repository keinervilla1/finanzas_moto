/* =========================================================================
   DOMI — Puente de render
   Rompe la dependencia circular entre la capa de datos (que necesita pedir un
   repintado cuando llegan snapshots) y la capa de render (que necesita la capa
   de datos para cargar/borrar). Los datos llaman a solicitarRenderTodo(); el
   módulo de render registra su función real con registrarRenderTodo().
   ========================================================================= */

let _renderTodo = () => {};

/** El módulo de render llama a esto una vez, al cargar. */
export function registrarRenderTodo(fn) {
  _renderTodo = fn;
}

/** Junta varias llamadas seguidas (p. ej. cuando llegan 5 snapshots casi a la
 *  vez al iniciar sesión) en un solo repintado. */
let pendiente = false;
export function solicitarRenderTodo() {
  if (pendiente) return;
  pendiente = true;
  queueMicrotask(() => { pendiente = false; _renderTodo(); });
}
