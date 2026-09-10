/* =========================================================================
   DOMI — Acceso al DOM y componentes de UI genéricos
   Cache de referencias por #id (una sola búsqueda al arrancar), más los
   helpers de hojas inferiores, modales, toast y protección contra doble clic.
   No conoce nada de la lógica de negocio.
   ========================================================================= */

export const $ = sel => document.querySelector(sel);

/** Todas las referencias del DOM se capturan una vez aquí. El resto de la app
 *  usa `el.loQueSea` en vez de repetir querySelector. */
export const el = {
  bootLoader: $('#bootLoader'),
  syncBar: $('#syncBar'),

  fechaActual: $('#fechaActual'),
  saludoUsuario: $('#saludoUsuario'),
  gananciaHoy: $('#gananciaHoy'),
  cantidadHoy: $('#cantidadHoy'),
  gastosHoyMini: $('#gastosHoyMini'),
  gananciaSemanaMini: $('#gananciaSemanaMini'),
  totalDebenMini: $('#totalDebenMini'),
  ringHeroFg: $('#ringHeroFg'),
  ringHeroPct: $('#ringHeroPct'),
  ringMiniFg: $('#ringMiniFg'),
  metaMiniPct: $('#metaMiniPct'),
  listaHoy: $('#listaHoy'),
  badgeHoy: $('#badgeHoy'),

  goalBarFill: $('#goalBarFill'),
  goalActual: $('#goalActual'),
  goalMeta: $('#goalMeta'),
  mejorDiaValor: $('#mejorDiaValor'),
  mejorDiaNombre: $('#mejorDiaNombre'),
  promedioDiarioValor: $('#promedioDiarioValor'),
  listaDias: $('#listaDias'),
  totalSemana: $('#totalSemana'),
  totalGastosSemana: $('#totalGastosSemana'),

  listaFrecuentes: $('#listaFrecuentes'),
  listaHistorial: $('#listaHistorial'),

  listaRegistros: $('#listaRegistros'),
  btnCargarMasRegistros: $('#btnCargarMasRegistros'),

  totalDebenHeader: $('#totalDebenHeader'),
  badgeDeben: $('#badgeDeben'),
  listaDeben: $('#listaDeben'),

  listaGastos: $('#listaGastos'),
  totalGastosFiltro: $('#totalGastosFiltro'),

  chipsFrecuentes: $('#chipsFrecuentes'),
  chipsClientes: $('#chipsClientes'),
  bloqueClientes: $('#bloqueClientes'),
  sheetTitulo: $('#sheetTitulo'),
  inputNombre: $('#inputNombre'),
  inputValor: $('#inputValor'),
  inputHora: $('#inputHora'),
  inputDescripcion: $('#inputDescripcion'),
  campoDescripcion: $('#campoDescripcion'),
  bloqueMedioPago: $('#bloqueMedioPago'),

  inputFrecNombre: $('#inputFrecNombre'),
  inputFrecValor: $('#inputFrecValor'),
  sheetFrecuenteTitulo: $('#sheetFrecuenteTitulo'),

  listaClientes: $('#listaClientes'),
  sheetClienteTitulo: $('#sheetClienteTitulo'),
  inputClienteNombre: $('#inputClienteNombre'),
  inputClienteTelefono: $('#inputClienteTelefono'),

  inputGastoValor: $('#inputGastoValor'),
  inputGastoDescripcion: $('#inputGastoDescripcion'),
  inputGastoFecha: $('#inputGastoFecha'),
  sheetGastoTitulo: $('#sheetGastoTitulo'),

  cobroResumen: $('#cobroResumen'),
  cobroDomicilios: $('#cobroDomicilios'),
  cobroTotal: $('#cobroTotal'),
  inputCobroMonto: $('#inputCobroMonto'),
  cobroNota: $('#cobroNota'),

  calcTotal: $('#calcTotal'),
  calcGastos: $('#calcGastos'),
  calcNeta: $('#calcNeta'),
  calcCantidad: $('#calcCantidad'),
  calcPromedio: $('#calcPromedio'),
  calcPrimero: $('#calcPrimero'),
  calcUltimo: $('#calcUltimo'),

  inputMeta: $('#inputMeta'),

  detalleContenido: $('#detalleContenido'),

  confirmIcono: $('#confirmIcono'),
  confirmTitulo: $('#confirmTitulo'),
  confirmSub: $('#confirmSub'),

  toast: $('#toast'),

  authScreen: $('#authScreen'),
  appContainer: $('#appContainer'),
  campoAuthNombre: $('#campoAuthNombre'),
  authNombre: $('#authNombre'),
  authEmail: $('#authEmail'),
  authPassword: $('#authPassword'),
  authError: $('#authError'),
  btnAuthPrincipal: $('#btnAuthPrincipal'),
  btnAuthToggle: $('#btnAuthToggle'),
  cuentaEmail: $('#cuentaEmail'),

  inputCuentaNombre: $('#inputCuentaNombre'),
  inputCuentaNuevoCorreo: $('#inputCuentaNuevoCorreo'),
  inputCuentaPasswordCorreo: $('#inputCuentaPasswordCorreo'),
  inputCuentaNuevaPassword: $('#inputCuentaNuevaPassword'),
  inputCuentaPasswordActual: $('#inputCuentaPasswordActual'),
  cuentaMsg: $('#cuentaMsg')
};

/* --- Protección contra doble envío (reutilizable) ---
   Un solo helper para TODOS los botones que guardan algo (domicilio, gasto,
   frecuente, meta, pago, login, cuenta...). Evita duplicar la misma lógica de
   "deshabilitar → mostrar texto de carga → ejecutar → restaurar" en cada sitio. */
export async function conProteccionDoble(boton, accionAsync, textoCargando = 'Guardando…') {
  if (!boton || boton.disabled) return; // ya está procesando: ignoramos el clic repetido
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoCargando;
  try {
    await accionAsync();
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

/* --- Hojas inferiores (bottom sheets) y modales --- */
export function mostrarSheet(sheetId, backdropId) {
  document.getElementById(backdropId).classList.add('show');
  document.getElementById(sheetId).classList.add('show');
}
export function ocultarSheet(sheetId, backdropId) {
  document.getElementById(backdropId).classList.remove('show');
  document.getElementById(sheetId).classList.remove('show');
}
export function mostrarModal(modalId, backdropId) {
  document.getElementById(backdropId).classList.add('show');
  document.getElementById(modalId).classList.add('show');
}
export function ocultarModal(modalId, backdropId) {
  document.getElementById(backdropId).classList.remove('show');
  document.getElementById(modalId).classList.remove('show');
}

/* --- Toast de confirmación --- */
let toastTimeout = null;
export function mostrarToast(mensaje) {
  el.toast.textContent = mensaje;
  el.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove('show'), 2400);
}

/** Quita el indicador de carga inicial a pantalla completa. */
export function ocultarLoaderInicial() {
  el.bootLoader.style.display = 'none';
}
