/* =========================================================================
   DOMI — Capa de datos
   Escrituras genéricas a Firestore, indicador de "sincronizando",
   suscripciones en tiempo real de la vista activa y guardado del perfil.
   ========================================================================= */

import {
  refPerfil, coleccion, refDocumento,
  setDoc, updateDoc, deleteDoc, deleteField, addDoc,
  onSnapshot, query, where, orderBy, serverTimestamp
} from './firebase.js';
import { el, mostrarToast, ocultarLoaderInicial } from './dom.js';
import {
  state, unsubs, currentUid, migracionHecha, setMigracionHecha,
  reemplazarGrupoEntregas, limpiarGruposEntregasSemana
} from './state.js';
import { META_SEMANAL_DEFAULT } from './config.js';
import { toDateKey, getMonday, addDays, frecuentesPorDefecto } from './utils.js';
import { solicitarRenderTodo } from './render-bus.js';

/* ---------------- Indicador "Sincronizando…" + escrituras --------------- */

let escriturasEnCurso = 0;
function marcarEscrituraInicio() {
  escriturasEnCurso++;
  el.syncBar.classList.add('show');
}
function marcarEscrituraFin() {
  escriturasEnCurso = Math.max(0, escriturasEnCurso - 1);
  if (escriturasEnCurso === 0) el.syncBar.classList.remove('show');
}

/* ---------------- Helpers genéricos de escritura ----------------------- */
/* El mismo conjunto sirve para "entregas" y "gastos": no duplicar la lógica
   de crear/actualizar/eliminar. */

export async function crearDocumento(nombreColeccion, datos) {
  marcarEscrituraInicio();
  try {
    return await addDoc(coleccion(currentUid, nombreColeccion), { ...datos, creadoEn: serverTimestamp() });
  } finally { marcarEscrituraFin(); }
}
export async function actualizarDocumento(nombreColeccion, id, cambios) {
  marcarEscrituraInicio();
  try {
    return await updateDoc(refDocumento(currentUid, nombreColeccion, id), cambios);
  } finally { marcarEscrituraFin(); }
}
export async function eliminarDocumento(nombreColeccion, id) {
  marcarEscrituraInicio();
  try {
    return await deleteDoc(refDocumento(currentUid, nombreColeccion, id));
  } finally { marcarEscrituraFin(); }
}

export function mapDoc(d) { return { id: d.id, ...d.data() }; }

/* ---------------- Suscripciones en tiempo real (vista activa) ---------- */

export function detenerSuscripciones() {
  Object.values(unsubs).forEach(fn => fn && fn());
  for (const k in unsubs) delete unsubs[k];
}

/** Perfil (frecuentes + meta) — y migración de datos antiguos si hace falta. */
function suscribirsePerfil(uid) {
  unsubs.perfil = onSnapshot(refPerfil(uid), async (snap) => {
    if (!snap.exists()) {
      await setDoc(refPerfil(uid), { frecuentes: frecuentesPorDefecto(), meta: META_SEMANAL_DEFAULT });
      return;
    }
    const data = snap.data();
    state.frecuentes = data.frecuentes || [];
    state.meta = data.meta || META_SEMANAL_DEFAULT;

    // Migración única: si quedó el arreglo "entregas" antiguo dentro del perfil,
    // lo movemos a la subcolección "entregas" y lo borramos del perfil.
    if (!migracionHecha && Array.isArray(data.entregas) && data.entregas.length > 0) {
      setMigracionHecha(true);
      mostrarToast('Actualizando tus datos a la nueva versión…');
      for (const e of data.entregas) {
        await crearDocumento('entregas', {
          nombre: e.nombre, valor: Number(e.valor), hora: e.hora, fecha: e.fecha,
          tipo: 'normal', medioPago: 'efectivo', pagado: true, fechaPago: e.fecha, descripcion: ''
        });
      }
      await updateDoc(refPerfil(uid), { entregas: deleteField() });
      mostrarToast('¡Listo! Tus domicilios anteriores ya están migrados ✅');
    }
    setMigracionHecha(true);

    solicitarRenderTodo();
    ocultarLoaderInicial();
  }, (err) => { console.error(err); mostrarToast('Error al cargar tu perfil'); ocultarLoaderInicial(); });
}

/** Domicilios realizados esta semana (por fecha de creación). */
function suscribirseEntregasSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'entregas'), where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha'));
  unsubs.entregasSemana = onSnapshot(q, (snap) => {
    reemplazarGrupoEntregas('realizadasSemana', snap.docs.map(mapDoc));
    solicitarRenderTodo();
    ocultarLoaderInicial();
  }, (err) => console.error(err));
}

/** Domicilios pagados esta semana aunque se hayan realizado antes (deudas cobradas). */
function suscribirseEntregasPagadasEnSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'entregas'), where('pagado', '==', true), where('fechaPago', '>=', inicio), where('fechaPago', '<=', fin));
  unsubs.entregasPagadasSemana = onSnapshot(q, (snap) => {
    reemplazarGrupoEntregas('pagadasSemana', snap.docs.map(mapDoc));
    solicitarRenderTodo();
  }, (err) => avisarFaltaIndice('pagos de la semana', err));
}

/** Gastos de la semana actual. */
function suscribirseGastosSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'gastos'), where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha'));
  unsubs.gastosSemana = onSnapshot(q, (snap) => {
    state.gastos = snap.docs.map(mapDoc);
    solicitarRenderTodo();
  }, (err) => console.error(err));
}

/** Todas las deudas pendientes (pagado:false), sin importar cuándo se crearon. */
function suscribirseDeudas(uid) {
  const q = query(coleccion(uid, 'entregas'), where('pagado', '==', false));
  unsubs.deudas = onSnapshot(q, (snap) => {
    state.deudas = snap.docs.map(mapDoc).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    solicitarRenderTodo();
  }, (err) => console.error(err));
}

export function iniciarSuscripciones(uid) {
  detenerSuscripciones();
  limpiarGruposEntregasSemana();
  const monday = getMonday(new Date());
  suscribirsePerfil(uid);
  suscribirseEntregasSemana(uid, monday);
  suscribirseEntregasPagadasEnSemana(uid, monday);
  suscribirseGastosSemana(uid, monday);
  suscribirseDeudas(uid);
}

/** Aviso amigable (una sola vez) cuando Firestore todavía está construyendo un
 *  índice que la consulta necesita, en lugar de fallar en silencio. */
let indiceAvisado = false;
export function avisarFaltaIndice(queDato, err) {
  console.warn(`Consulta "${queDato}":`, err && err.message);
  if (err && err.code === 'failed-precondition' && !indiceAvisado) {
    indiceAvisado = true;
    mostrarToast('Firestore está preparando un índice. Los históricos pueden tardar unos minutos en aparecer.');
  }
}

/* ---------------- Guardar perfil (frecuentes / meta) ------------------- */

let guardarPerfilTimeout = null;
let guardadoPerfilPendiente = false;
export function guardarPerfilEnNube() {
  if (!currentUid) return;
  clearTimeout(guardarPerfilTimeout);
  // Marcamos "sincronizando" una sola vez por ráfaga de cambios. Antes, al
  // llamar a esto varias veces seguidas (editar la meta rápido, crear 2
  // frecuentes), el clearTimeout descartaba el marcarEscrituraFin() pendiente
  // y la barra "Sincronizando…" se quedaba pegada para siempre.
  if (!guardadoPerfilPendiente) {
    guardadoPerfilPendiente = true;
    marcarEscrituraInicio();
  }
  guardarPerfilTimeout = setTimeout(async () => {
    guardadoPerfilPendiente = false;
    try {
      await setDoc(refPerfil(currentUid), { frecuentes: state.frecuentes, meta: state.meta }, { merge: true });
    } catch (err) {
      console.error(err);
      mostrarToast('Sin conexión: se guardará cuando vuelva el internet');
    } finally { marcarEscrituraFin(); }
  }, 250);
}
