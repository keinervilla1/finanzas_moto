/* =========================================================================
   DOMI — Control de domicilios para repartidores
   script.js
   Arquitectura de datos (v2):
   - usuarios/{uid}                    → documento pequeño: frecuentes + meta
   - usuarios/{uid}/entregas/{id}       → un documento por domicilio
   - usuarios/{uid}/gastos/{id}         → un documento por gasto
   Se usa esta separación en subcolecciones (en vez de un solo documento con
   arreglos gigantes) para poder pedirle a Firestore solo "lo de esta semana"
   o "lo de este mes" con consultas (where/limit) en lugar de cargar TODO el
   historial cada vez — así la app se mantiene rápida aunque acumules miles
   de domicilios con el tiempo.
   ========================================================================= */

/* ======================= 0. FIREBASE: INICIALIZACIÓN ===================== */

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, addDoc, onSnapshot, getDocs,
  query, where, orderBy, limit, startAfter, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

/* ===================== CONFIGURACIÓN DE AUTENTICACIÓN ===================== */

async function configurarPersistenciaSesion() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("No fue posible configurar la persistencia de la sesión:", error);
  }
}

configurarPersistenciaSesion();
/* ============================ 1. UTILIDADES ============================ */

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const CATEGORIAS_GASTO = {
  gasolina: { emoji: '⛽', label: 'Gasolina' },
  comida: { emoji: '🍽️', label: 'Comida' },
  mantenimiento: { emoji: '🔧', label: 'Mantenimiento' },
  peajes: { emoji: '🛣️', label: 'Peajes' },
  otros: { emoji: '📦', label: 'Otros' }
};

function formatCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

function formatHora12(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const periodo = h >= 12 ? 'p. m.' : 'a. m.';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatFechaLarga(date) {
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatFechaCorta(fechaKey) {
  const d = new Date(fechaKey + 'T00:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

function rangoSemanaTexto(monday) {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} ${MESES[monday.getMonth()].slice(0,3)} – ${sunday.getDate()} ${MESES[sunday.getMonth()].slice(0,3)}`;
}

function frecuentesPorDefecto() {
  return [
    { id: uid(), nombre: 'Éxito', valor: 6500 },
    { id: uid(), nombre: 'D1', valor: 5000 },
    { id: uid(), nombre: 'Ara', valor: 4800 },
    { id: uid(), nombre: 'Farmatodo', valor: 7000 }
  ];
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ==================== 2. ESTADO EN MEMORIA ============== */

/** Datos "activos" (en tiempo real): semana actual + deudas pendientes + perfil */
const state = {
  entregas: [],     // domicilios de la semana actual (más pagos de deudas antiguas cobradas esta semana)
  gastos: [],       // gastos de la semana actual
  deudas: [],       // TODOS los domicilios con pagado:false (sin importar la semana)
  frecuentes: [],
  meta: 800000
};

/** Datos "bajo demanda" para las pantallas Registros y Gastos (con filtro e historial) */
const registros = { items: [], cursor: null, hasMore: true, rango: 'semana', cargando: false };
const gastosVista = { items: [], rango: 'hoy' };
const historialSemanas = { cargado: false, semanas: [] };

let currentUid = null;
let migracionHecha = false;
const unsubs = {}; // listeners activos: { perfil, entregasSemana, entregasPagadasSemana, gastosSemana, deudas }
let escriturasEnCurso = 0;

/* ==================== 3. HELPERS GENÉRICOS DE FIRESTORE =================== */
/* Un mismo conjunto de funciones sirve tanto para "entregas" como "gastos",
   para no duplicar la lógica de crear/actualizar/eliminar (requisito de
   mantenibilidad del proyecto). */

function refPerfil(uid) { return doc(db, 'usuarios', uid); }
function coleccion(uid, nombre) { return collection(db, 'usuarios', uid, nombre); }
function refDocumento(uid, nombreColeccion, id) { return doc(db, 'usuarios', uid, nombreColeccion, id); }

async function crearDocumento(nombreColeccion, datos) {
  marcarEscrituraInicio();
  try {
    return await addDoc(coleccion(currentUid, nombreColeccion), { ...datos, creadoEn: serverTimestamp() });
  } finally { marcarEscrituraFin(); }
}
async function actualizarDocumento(nombreColeccion, id, cambios) {
  marcarEscrituraInicio();
  try {
    return await updateDoc(refDocumento(currentUid, nombreColeccion, id), cambios);
  } finally { marcarEscrituraFin(); }
}
async function eliminarDocumento(nombreColeccion, id) {
  marcarEscrituraInicio();
  try {
    return await deleteDoc(refDocumento(currentUid, nombreColeccion, id));
  } finally { marcarEscrituraFin(); }
}

function marcarEscrituraInicio() {
  escriturasEnCurso++;
  el.syncBar.classList.add('show');
}
function marcarEscrituraFin() {
  escriturasEnCurso = Math.max(0, escriturasEnCurso - 1);
  if (escriturasEnCurso === 0) el.syncBar.classList.remove('show');
}

/* ================= 4. SUSCRIPCIONES EN TIEMPO REAL (VISTA ACTIVA) ========= */

function detenerSuscripciones() {
  Object.values(unsubs).forEach(fn => fn && fn());
  for (const k in unsubs) delete unsubs[k];
}

/** Perfil (frecuentes + meta) — y migración de datos antiguos si hace falta */
function suscribirsePerfil(uid) {
  unsubs.perfil = onSnapshot(refPerfil(uid), async (snap) => {
    if (!snap.exists()) {
      await setDoc(refPerfil(uid), { frecuentes: frecuentesPorDefecto(), meta: 800000 });
      return;
    }
    const data = snap.data();
    state.frecuentes = data.frecuentes || [];
    state.meta = data.meta || 800000;

    // --- Migración única: si quedó el arreglo "entregas" antiguo dentro del perfil,
    //     lo movemos a la subcolección "entregas" y lo borramos del perfil.
    if (!migracionHecha && Array.isArray(data.entregas) && data.entregas.length > 0) {
      migracionHecha = true;
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
    migracionHecha = true;

    renderTodo();
    ocultarLoaderInicial();
  }, (err) => { console.error(err); mostrarToast('Error al cargar tu perfil'); ocultarLoaderInicial(); });
}

/** Domicilios realizados esta semana (por fecha de creación) */
function suscribirseEntregasSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'entregas'), where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha'));
  unsubs.entregasSemana = onSnapshot(q, (snap) => {
    mezclarEntregas(snap.docs.map(mapDoc));
    renderTodo();
    ocultarLoaderInicial();
  }, (err) => console.error(err));
}

/** Domicilios pagados esta semana aunque se hayan realizado antes (deudas cobradas) */
function suscribirseEntregasPagadasEnSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'entregas'), where('pagado', '==', true), where('fechaPago', '>=', inicio), where('fechaPago', '<=', fin));
  unsubs.entregasPagadasSemana = onSnapshot(q, (snap) => {
    mezclarEntregas(snap.docs.map(mapDoc));
    renderTodo();
  }, (err) => {
    // Si Firebase pide crear un índice compuesto la primera vez, lo avisamos
    // de forma amigable en vez de dejar la consola en silencio.
    console.warn('Consulta de pagos cruzados de semana:', err.message);
  });
}

/** Junta los resultados de las dos consultas de arriba en state.entregas, sin duplicar */
const mapaEntregasSemana = new Map();
function mezclarEntregas(items) {
  items.forEach(it => mapaEntregasSemana.set(it.id, it));
  state.entregas = [...mapaEntregasSemana.values()];
}

/** Gastos de la semana actual */
function suscribirseGastosSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(coleccion(uid, 'gastos'), where('fecha', '>=', inicio), where('fecha', '<=', fin), orderBy('fecha'));
  unsubs.gastosSemana = onSnapshot(q, (snap) => {
    state.gastos = snap.docs.map(mapDoc);
    renderTodo();
  }, (err) => console.error(err));
}

/** Todas las deudas pendientes (pagado:false), sin importar cuándo se crearon */
function suscribirseDeudas(uid) {
  const q = query(coleccion(uid, 'entregas'), where('pagado', '==', false));
  unsubs.deudas = onSnapshot(q, (snap) => {
    state.deudas = snap.docs.map(mapDoc).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    renderTodo();
  }, (err) => console.error(err));
}

function mapDoc(d) { return { id: d.id, ...d.data() }; }

function iniciarSuscripciones(uid) {
  detenerSuscripciones();
  mapaEntregasSemana.clear();
  const monday = getMonday(new Date());
  suscribirsePerfil(uid);
  suscribirseEntregasSemana(uid, monday);
  suscribirseEntregasPagadasEnSemana(uid, monday);
  suscribirseGastosSemana(uid, monday);
  suscribirseDeudas(uid);
}

/* ======================= 5. GUARDAR PERFIL (frecuentes/meta) ============== */

let guardarPerfilTimeout = null;
function guardarPerfilEnNube() {
  if (!currentUid) return;
  clearTimeout(guardarPerfilTimeout);
  marcarEscrituraInicio();
  guardarPerfilTimeout = setTimeout(async () => {
    try {
      await setDoc(refPerfil(currentUid), { frecuentes: state.frecuentes, meta: state.meta }, { merge: true });
    } catch (err) {
      console.error(err);
      mostrarToast('Sin conexión: se guardará cuando vuelva el internet');
    } finally { marcarEscrituraFin(); }
  }, 250);
}

/* ========================= 6. CÁLCULOS DERIVADOS ========================= */

function entregasRealizadasEn(fechaKey) {
  return state.entregas.filter(e => e.fecha === fechaKey).sort((a, b) => a.hora.localeCompare(b.hora));
}
function entregasPagadasEl(fechaKey) {
  return state.entregas.filter(e => e.pagado && e.fechaPago === fechaKey);
}
function gastosDe(fechaKey) {
  return state.gastos.filter(g => g.fecha === fechaKey);
}
function totalDe(lista) { return lista.reduce((sum, e) => sum + Number(e.valor), 0); }

function totalesPorDia(monday) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = addDays(monday, i);
    const fechaKey = toDateKey(fecha);
    const ingresos = totalDe(entregasPagadasEl(fechaKey));
    dias.push({ fecha, fechaKey, nombre: DIAS_SEMANA[i], total: ingresos });
  }
  return dias;
}

/* ============================ 7. REFERENCIAS DOM ========================= */

const $ = sel => document.querySelector(sel);

const TITULOS = { inicio: 'Hoy', semana: 'Semana', registros: 'Registros', deben: 'Deben', frecuentes: 'Más' };

document.querySelectorAll('.tabbar__item').forEach(btn => {
  btn.addEventListener('click', () => {
    const screen = btn.dataset.screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + screen).classList.add('active');
    document.querySelectorAll('.tabbar__item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('screens').scrollTop = 0;
    if (screen === 'registros' && registros.items.length === 0) cargarRegistros(true);
    if (screen === 'gastos') cargarGastosVista();
    if (screen === 'semana' && !historialSemanas.cargado) cargarHistorialSemanas();
  });
});

const el = {
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

  inputGastoValor: $('#inputGastoValor'),
  inputGastoDescripcion: $('#inputGastoDescripcion'),
  inputGastoFecha: $('#inputGastoFecha'),
  sheetGastoTitulo: $('#sheetGastoTitulo'),

  pagoResumen: $('#pagoResumen'),

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

/* Estado de edición / selección en curso */
let editingEntregaId = null;
let editingFrecuenteId = null;
let editingGastoId = null;
let selectedFrecuenteId = null;
let confirmCallback = null;
let tipoSeleccionado = 'normal';
let pagadoSeleccionado = 'si';
let medioPagoSeleccionado = 'efectivo';
let categoriaGastoSeleccionada = 'gasolina';
let entregaParaPago = null;
let entregaParaDetalle = null;

/* ============================== 8. RENDERIZADO ============================ */

function renderTodo() {
  const hoy = new Date();
  const hoyKey = toDateKey(hoy);
  const monday = getMonday(hoy);

  el.fechaActual.textContent = formatFechaLarga(hoy);

  const entregasHoy = entregasRealizadasEn(hoyKey);
  const pagadasHoy = entregasPagadasEl(hoyKey);
  const ingresosHoy = totalDe(pagadasHoy);
  const gastosHoy = totalDe(gastosDe(hoyKey));
  const netaHoy = ingresosHoy - gastosHoy;

  const dias = totalesPorDia(monday);
  const totalSemanaVal = totalDe(dias.map(d => ({ valor: d.total })));
  const totalGastosSemanaVal = totalDe(state.gastos);
  const totalDeben = totalDe(state.deudas);
  const pctMeta = state.meta > 0 ? Math.min(totalSemanaVal / state.meta, 1) : 0;

  renderInicio(entregasHoy, netaHoy, gastosHoy, totalSemanaVal, totalDeben, pctMeta);
  renderSemana(dias, totalSemanaVal, totalGastosSemanaVal, pctMeta, hoyKey);
  renderFrecuentes();
  renderDeben(totalDeben);
}

function renderInicio(entregasHoy, netaHoy, gastosHoy, totalSemanaVal, totalDeben, pctMeta) {
  el.gananciaHoy.textContent = formatCOP(netaHoy);
  el.cantidadHoy.textContent = entregasHoy.length;
  el.gastosHoyMini.textContent = formatCOP(gastosHoy);
  el.gananciaSemanaMini.textContent = formatCOP(totalSemanaVal);
  el.totalDebenMini.textContent = formatCOP(totalDeben);
  el.badgeHoy.textContent = entregasHoy.length;

  setAnillo(el.ringHeroFg, 226.2, pctMeta);
  setAnillo(el.ringMiniFg, 100.5, pctMeta);
  const pctTxt = Math.round(pctMeta * 100) + '%';
  el.ringHeroPct.textContent = pctTxt;
  el.metaMiniPct.textContent = pctTxt;

  el.listaHoy.innerHTML = '';
  entregasHoy.forEach(entrega => el.listaHoy.appendChild(crearItemEntrega(entrega)));
}

/** Construye el <li> de un domicilio, reutilizado en Inicio, Deben y Registros */
function crearItemEntrega(entrega, opciones = {}) {
  const li = document.createElement('li');
  li.className = 'entrega-item';

  const badges = [];
  if (entrega.tipo === 'contrata') badges.push('<span class="mini-badge mini-badge--contrata">Contrata</span>');
  if (!entrega.pagado) badges.push('<span class="mini-badge mini-badge--pendiente">Pendiente</span>');
  else badges.push(`<span class="mini-badge">${entrega.medioPago === 'transferencia' ? '💳 Transferencia' : '💵 Efectivo'}</span>`);

  li.innerHTML = `
    <div class="entrega-item__icon">${entrega.tipo === 'contrata' ? '📋' : '🛵'}</div>
    <div class="entrega-item__info">
      <p class="entrega-item__nombre">${escapeHTML(entrega.nombre)}</p>
      <p class="entrega-item__hora">${formatHora12(entrega.hora)} · ${formatFechaCorta(entrega.fecha)}</p>
      <div class="entrega-item__badges">${badges.join('')}</div>
    </div>
    <div class="entrega-item__valor">${formatCOP(entrega.valor)}</div>
    ${opciones.sinBorrar ? '' : '<button class="entrega-item__del" title="Eliminar">✕</button>'}
  `;
  li.addEventListener('click', (ev) => {
    if (ev.target.closest('.entrega-item__del')) return;
    if (opciones.onClick) opciones.onClick(entrega);
    else abrirModalDetalle(entrega);
  });
  const btnDel = li.querySelector('.entrega-item__del');
  if (btnDel) {
    btnDel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      pedirConfirmacion('¿Eliminar este domicilio?', `${entrega.nombre} · ${formatCOP(entrega.valor)}`, async () => {
        await eliminarDocumento('entregas', entrega.id);
        mapaEntregasSemana.delete(entrega.id);
        state.entregas = state.entregas.filter(e => e.id !== entrega.id);
        renderTodo();
        mostrarToast('Domicilio eliminado');
      }, '🗑️');
    });
  }
  return li;
}

function setAnillo(circleEl, circunferencia, pct) {
  circleEl.style.strokeDashoffset = circunferencia - pct * circunferencia;
}

function renderSemana(dias, totalSemanaVal, totalGastosSemanaVal, pctMeta, hoyKey) {
  el.goalBarFill.style.width = (pctMeta * 100) + '%';
  el.goalActual.textContent = formatCOP(totalSemanaVal);
  el.goalMeta.textContent = 'de ' + formatCOP(state.meta);

  const diasConDatos = dias.filter(d => d.total > 0);
  const mejor = dias.reduce((max, d) => d.total > max.total ? d : max, dias[0]);
  el.mejorDiaValor.textContent = mejor.total > 0 ? formatCOP(mejor.total) : '—';
  el.mejorDiaNombre.textContent = mejor.total > 0 ? `Mejor día · ${mejor.nombre}` : 'Mejor día';
  el.promedioDiarioValor.textContent = formatCOP(diasConDatos.length ? totalSemanaVal / diasConDatos.length : 0);

  el.totalSemana.textContent = formatCOP(totalSemanaVal);
  el.totalGastosSemana.textContent = formatCOP(totalGastosSemanaVal);

  el.listaDias.innerHTML = '';
  dias.forEach(d => {
    const li = document.createElement('li');
    const esHoy = d.fechaKey === hoyKey;
    li.className = 'dia-item' + (esHoy ? ' is-today' : '');
    li.innerHTML = `
      <span class="dia-item__nombre">${d.nombre} ${esHoy ? '<span class="dia-item__hoy">HOY</span>' : ''}</span>
      <span class="dia-item__valor ${d.total === 0 ? 'is-zero' : ''}">${formatCOP(d.total)}</span>
    `;
    el.listaDias.appendChild(li);
  });
}

function renderFrecuentes() {
  el.listaFrecuentes.innerHTML = '';
  state.frecuentes.forEach(f => {
    const li = document.createElement('li');
    li.className = 'frecuente-item';
    li.innerHTML = `
      <div class="entrega-item__icon">🏪</div>
      <div class="frecuente-item__info">
        <p class="frecuente-item__nombre">${escapeHTML(f.nombre)}</p>
        <p class="frecuente-item__valor">${formatCOP(f.valor)}</p>
      </div>
      <div class="frecuente-item__actions">
        <button class="icon-btn icon-btn--edit" title="Editar">✎</button>
        <button class="icon-btn icon-btn--del" title="Eliminar">✕</button>
      </div>
    `;
    li.querySelector('.icon-btn--edit').addEventListener('click', () => abrirSheetFrecuente(f));
    li.querySelector('.icon-btn--del').addEventListener('click', () => {
      pedirConfirmacion('¿Eliminar este frecuente?', `${f.nombre} · ${formatCOP(f.valor)}`, () => {
        state.frecuentes = state.frecuentes.filter(x => x.id !== f.id);
        guardarPerfilEnNube();
        renderTodo();
        mostrarToast('Frecuente eliminado');
      });
    });
    el.listaFrecuentes.appendChild(li);
  });
}

function renderDeben(totalDeben) {
  el.totalDebenHeader.textContent = formatCOP(totalDeben);
  el.badgeDeben.textContent = state.deudas.length;
  el.listaDeben.innerHTML = '';
  state.deudas.forEach(deuda => {
    const li = crearItemEntrega(deuda, {
      sinBorrar: false,
      onClick: (d) => abrirSheetPago(d)
    });
    el.listaDeben.appendChild(li);
  });
}

/* ---------- Historial de semanas anteriores (bajo demanda, acotado) ---------- */

async function cargarHistorialSemanas() {
  historialSemanas.cargado = true;
  const cutoff = toDateKey(addDays(new Date(), -120)); // últimos ~4 meses, suficiente y liviano
  const q = query(
    coleccion(currentUid, 'entregas'),
    where('pagado', '==', true),
    where('fechaPago', '>=', cutoff),
    orderBy('fechaPago', 'desc'),
    limit(400)
  );
  try {
    const snap = await getDocs(q);
    const items = snap.docs.map(mapDoc);
    const monday = getMonday(new Date());
    const semanaActualKey = toDateKey(monday);

    const grupos = new Map();
    items.forEach(e => {
      const fecha = new Date(e.fechaPago + 'T00:00:00');
      const mondayItem = getMonday(fecha);
      const key = toDateKey(mondayItem);
      if (key === semanaActualKey) return; // esa ya se ve arriba, no es "anterior"
      if (!grupos.has(key)) grupos.set(key, { monday: mondayItem, lista: [] });
      grupos.get(key).lista.push(e);
    });

    historialSemanas.semanas = [...grupos.values()].sort((a, b) => b.monday - a.monday);
    renderHistorial();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo cargar el historial de semanas');
  }
}

function renderHistorial() {
  el.listaHistorial.innerHTML = '';
  historialSemanas.semanas.forEach(({ monday, lista }) => {
    const total = totalDe(lista);
    const dias = DIAS_SEMANA.map((nombre, i) => {
      const fechaKey = toDateKey(addDays(monday, i));
      return { nombre, total: totalDe(lista.filter(e => e.fechaPago === fechaKey)) };
    });
    const li = document.createElement('li');
    li.className = 'historial-item';
    li.innerHTML = `
      <div class="historial-item__head">
        <span class="historial-item__rango">${rangoSemanaTexto(monday)}</span>
        <span class="historial-item__total">${formatCOP(total)}</span>
      </div>
      <p class="historial-item__meta">${lista.length} domicilios pagados</p>
      <div class="historial-item__dias">
        ${dias.map(d => `<div class="historial-dia-row"><span>${d.nombre}</span><span>${formatCOP(d.total)}</span></div>`).join('')}
      </div>
    `;
    li.addEventListener('click', () => li.classList.toggle('open'));
    el.listaHistorial.appendChild(li);
  });
}

/* ---------- Registros: historial detallado de domicilios con filtros ---------- */

function rangoAFecha(rango) {
  const hoy = new Date();
  if (rango === 'semana') return toDateKey(getMonday(hoy));
  if (rango === 'mes') return toDateKey(addDays(hoy, -30));
  if (rango === '3meses') return toDateKey(addDays(hoy, -90));
  return null; // 'todo'
}

document.querySelectorAll('#filtrosRegistros .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filtrosRegistros .chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    registros.rango = chip.dataset.rango;
    cargarRegistros(true);
  });
});

async function cargarRegistros(reiniciar) {
  if (registros.cargando) return;
  registros.cargando = true;
  if (reiniciar) { registros.items = []; registros.cursor = null; registros.hasMore = true; }

  el.btnCargarMasRegistros.textContent = 'Cargando…';
  const desde = rangoAFecha(registros.rango);

  let restricciones = [orderBy('fecha', 'desc'), limit(30)];
  if (desde) restricciones = [where('fecha', '>=', desde), orderBy('fecha', 'desc'), limit(30)];
  if (registros.cursor) restricciones.push(startAfter(registros.cursor));

  try {
    const snap = await getDocs(query(coleccion(currentUid, 'entregas'), ...restricciones));
    const nuevos = snap.docs.map(mapDoc);
    registros.items.push(...nuevos);
    registros.cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : registros.cursor;
    registros.hasMore = snap.docs.length === 30;
    renderRegistros();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudieron cargar los domicilios');
  } finally {
    registros.cargando = false;
    el.btnCargarMasRegistros.textContent = 'Cargar más';
  }
}

function renderRegistros() {
  el.listaRegistros.innerHTML = '';
  registros.items
    .sort((a, b) => (a.fecha === b.fecha ? b.hora.localeCompare(a.hora) : (a.fecha < b.fecha ? 1 : -1)))
    .forEach(e => el.listaRegistros.appendChild(crearItemEntrega(e, { onClick: abrirModalDetalle })));
  el.btnCargarMasRegistros.style.display = registros.hasMore ? 'block' : 'none';
}
$('#btnCargarMasRegistros').addEventListener('click', () => cargarRegistros(false));

/* ---------- Gastos: listado con filtro ---------- */

document.querySelectorAll('#filtrosGastos .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filtrosGastos .chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    gastosVista.rango = chip.dataset.rango;
    cargarGastosVista();
  });
});

async function cargarGastosVista() {
  const hoyKey = toDateKey(new Date());
  // Hoy y semana ya están disponibles en memoria (sincronizados en vivo) → sin gasto de lectura extra
  if (gastosVista.rango === 'hoy') {
    gastosVista.items = gastosDe(hoyKey);
    return renderGastos();
  }
  if (gastosVista.rango === 'semana') {
    gastosVista.items = state.gastos;
    return renderGastos();
  }
  // Mes / Todo → consulta puntual acotada
  const desde = gastosVista.rango === 'mes' ? toDateKey(addDays(new Date(), -30)) : null;
  let restricciones = [orderBy('fecha', 'desc'), limit(200)];
  if (desde) restricciones = [where('fecha', '>=', desde), orderBy('fecha', 'desc'), limit(200)];
  try {
    const snap = await getDocs(query(coleccion(currentUid, 'gastos'), ...restricciones));
    gastosVista.items = snap.docs.map(mapDoc);
    renderGastos();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudieron cargar los gastos');
  }
}

function renderGastos() {
  el.totalGastosFiltro.textContent = formatCOP(totalDe(gastosVista.items));
  el.listaGastos.innerHTML = '';
  gastosVista.items.forEach(g => {
    const cat = CATEGORIAS_GASTO[g.categoria] || CATEGORIAS_GASTO.otros;
    const li = document.createElement('li');
    li.className = 'entrega-item';
    li.innerHTML = `
      <div class="entrega-item__icon">${cat.emoji}</div>
      <div class="entrega-item__info">
        <p class="entrega-item__nombre">${cat.label}${g.descripcion ? ' · ' + escapeHTML(g.descripcion) : ''}</p>
        <p class="entrega-item__hora">${formatFechaCorta(g.fecha)}</p>
      </div>
      <div class="entrega-item__valor" style="color:var(--rojo)">-${formatCOP(g.valor)}</div>
      <button class="entrega-item__del" title="Eliminar">✕</button>
    `;
    li.addEventListener('click', (ev) => {
      if (ev.target.closest('.entrega-item__del')) return;
      abrirSheetGasto(g);
    });
    li.querySelector('.entrega-item__del').addEventListener('click', (ev) => {
      ev.stopPropagation();
      pedirConfirmacion('¿Eliminar este gasto?', `${cat.label} · ${formatCOP(g.valor)}`, async () => {
        await eliminarDocumento('gastos', g.id);
        gastosVista.items = gastosVista.items.filter(x => x.id !== g.id);
        state.gastos = state.gastos.filter(x => x.id !== g.id);
        renderGastos();
        renderTodo();
        mostrarToast('Gasto eliminado');
      }, '🗑️');
    });
    el.listaGastos.appendChild(li);
  });
}

/* ============================ 9. SHEET: AGREGAR / EDITAR DOMICILIO ========= */

function seleccionarSegmento(contenedorId, valor, variable) {
  document.querySelectorAll(`#${contenedorId} .segmented__opt`).forEach(b => {
    b.classList.toggle('selected', b.dataset.valor === valor);
  });
  return valor;
}

document.querySelectorAll('#segmentoTipo .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => {
    tipoSeleccionado = seleccionarSegmento('segmentoTipo', btn.dataset.valor);
    // Contrata → por defecto no se paga de inmediato (se puede cambiar a mano)
    pagadoSeleccionado = seleccionarSegmento('segmentoPagado', tipoSeleccionado === 'contrata' ? 'no' : 'si');
    actualizarVisibilidadCamposPago();
  });
});
document.querySelectorAll('#segmentoPagado .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => {
    pagadoSeleccionado = seleccionarSegmento('segmentoPagado', btn.dataset.valor);
    actualizarVisibilidadCamposPago();
  });
});
document.querySelectorAll('#segmentoMedioPago .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => { medioPagoSeleccionado = seleccionarSegmento('segmentoMedioPago', btn.dataset.valor); });
});

function actualizarVisibilidadCamposPago() {
  el.bloqueMedioPago.style.display = pagadoSeleccionado === 'si' ? 'block' : 'none';
}

function abrirSheetEntrega(entregaExistente) {
  editingEntregaId = entregaExistente ? entregaExistente.id : null;
  selectedFrecuenteId = null;
  el.sheetTitulo.textContent = entregaExistente ? 'Editar domicilio' : 'Agregar domicilio';

  el.chipsFrecuentes.innerHTML = '';
  if (state.frecuentes.length === 0) {
    el.chipsFrecuentes.innerHTML = '<span class="chip chip--empty">Crea frecuentes en la pestaña "Más"</span>';
  } else {
    state.frecuentes.forEach(f => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = `${f.nombre} · ${formatCOP(f.valor)}`;
      chip.addEventListener('click', () => {
        selectedFrecuenteId = f.id;
        el.inputNombre.value = f.nombre;
        el.inputValor.value = f.valor;
        document.querySelectorAll('#chipsFrecuentes .chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      el.chipsFrecuentes.appendChild(chip);
    });
  }

  if (entregaExistente) {
    el.inputNombre.value = entregaExistente.nombre;
    el.inputValor.value = entregaExistente.valor;
    el.inputHora.value = entregaExistente.hora;
    el.inputDescripcion.value = entregaExistente.descripcion || '';
    tipoSeleccionado = seleccionarSegmento('segmentoTipo', entregaExistente.tipo || 'normal');
    pagadoSeleccionado = seleccionarSegmento('segmentoPagado', entregaExistente.pagado ? 'si' : 'no');
    medioPagoSeleccionado = seleccionarSegmento('segmentoMedioPago', entregaExistente.medioPago || 'efectivo');
  } else {
    el.inputNombre.value = '';
    el.inputValor.value = '';
    el.inputDescripcion.value = '';
    const ahora = new Date();
    el.inputHora.value = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    tipoSeleccionado = seleccionarSegmento('segmentoTipo', 'normal');
    pagadoSeleccionado = seleccionarSegmento('segmentoPagado', 'si');
    medioPagoSeleccionado = seleccionarSegmento('segmentoMedioPago', 'efectivo');
  }
  actualizarVisibilidadCamposPago();
  mostrarSheet('sheetDomicilio', 'sheetBackdrop');
}

$('#btnAgregarDomicilio').addEventListener('click', () => abrirSheetEntrega(null));
$('#btnCancelarDomicilio').addEventListener('click', () => ocultarSheet('sheetDomicilio', 'sheetBackdrop'));
$('#sheetBackdrop').addEventListener('click', () => ocultarSheet('sheetDomicilio', 'sheetBackdrop'));

$('#btnGuardarDomicilio').addEventListener('click', async () => {
  const nombre = el.inputNombre.value.trim();
  const valor = Number(el.inputValor.value);
  const hora = el.inputHora.value;
  const descripcion = el.inputDescripcion.value.trim();

  if (!nombre) { mostrarToast('Escribe el nombre del domicilio'); return; }
  if (!valor || valor <= 0) { mostrarToast('Ingresa un valor válido'); return; }
  if (!hora) { mostrarToast('Selecciona la hora'); return; }

  const hoyKey = toDateKey(new Date());
  const pagado = pagadoSeleccionado === 'si';

  const datos = {
    nombre, valor, hora, descripcion,
    tipo: tipoSeleccionado,
    pagado,
    medioPago: pagado ? medioPagoSeleccionado : null,
    fechaPago: pagado ? hoyKey : null
  };

  try {
    if (editingEntregaId) {
      await actualizarDocumento('entregas', editingEntregaId, datos);
      mostrarToast('Domicilio actualizado');
    } else {
      datos.fecha = hoyKey;
      await crearDocumento('entregas', datos);
      mostrarToast(pagado ? 'Domicilio agregado 🎉' : 'Domicilio agregado, quedó pendiente de pago');
      animarHero();
    }
    ocultarSheet('sheetDomicilio', 'sheetBackdrop');
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo guardar. Revisa tu conexión.');
  }
});

function animarHero() {
  el.gananciaHoy.classList.remove('bump');
  void el.gananciaHoy.offsetWidth;
  el.gananciaHoy.classList.add('bump');
}

/* ==================== 10. SHEET: NUEVO / EDITAR FRECUENTE =================== */

function abrirSheetFrecuente(frecuenteExistente) {
  editingFrecuenteId = frecuenteExistente ? frecuenteExistente.id : null;
  el.sheetFrecuenteTitulo.textContent = frecuenteExistente ? 'Editar frecuente' : 'Nuevo domicilio frecuente';
  el.inputFrecNombre.value = frecuenteExistente ? frecuenteExistente.nombre : '';
  el.inputFrecValor.value = frecuenteExistente ? frecuenteExistente.valor : '';
  mostrarSheet('sheetFrecuente', 'sheetBackdropFrecuente');
}
$('#btnNuevoFrecuente').addEventListener('click', () => abrirSheetFrecuente(null));
$('#btnCancelarFrecuente').addEventListener('click', () => ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente'));
$('#sheetBackdropFrecuente').addEventListener('click', () => ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente'));

$('#btnGuardarFrecuente').addEventListener('click', () => {
  const nombre = el.inputFrecNombre.value.trim();
  const valor = Number(el.inputFrecValor.value);
  if (!nombre) { mostrarToast('Escribe el nombre'); return; }
  if (!valor || valor <= 0) { mostrarToast('Ingresa un valor válido'); return; }

  if (editingFrecuenteId) {
    const f = state.frecuentes.find(x => x.id === editingFrecuenteId);
    f.nombre = nombre; f.valor = valor;
  } else {
    state.frecuentes.push({ id: uid(), nombre, valor });
  }
  guardarPerfilEnNube();
  ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente');
  renderTodo();
  mostrarToast('Guardado correctamente');
});

$('#btnIrAGastos').addEventListener('click', () => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-gastos').classList.add('active');
  document.getElementById('screens').scrollTop = 0;
  cargarGastosVista();
});
$('#btnVolverGastos').addEventListener('click', () => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-frecuentes').classList.add('active');
  document.getElementById('screens').scrollTop = 0;
});

/* ==================== 11. SHEET: AGREGAR / EDITAR GASTO ===================== */

document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    categoriaGastoSeleccionada = chip.dataset.valor;
  });
});

function abrirSheetGasto(gastoExistente) {
  editingGastoId = gastoExistente ? gastoExistente.id : null;
  el.sheetGastoTitulo.textContent = gastoExistente ? 'Editar gasto' : 'Registrar gasto';
  el.inputGastoValor.value = gastoExistente ? gastoExistente.valor : '';
  el.inputGastoDescripcion.value = gastoExistente ? (gastoExistente.descripcion || '') : '';
  el.inputGastoFecha.value = gastoExistente ? gastoExistente.fecha : toDateKey(new Date());
  categoriaGastoSeleccionada = gastoExistente ? gastoExistente.categoria : 'gasolina';
  document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(c => c.classList.toggle('selected', c.dataset.valor === categoriaGastoSeleccionada));
  mostrarSheet('sheetGasto', 'sheetBackdropGasto');
}
$('#btnAgregarGasto').addEventListener('click', () => abrirSheetGasto(null));
$('#btnCancelarGasto').addEventListener('click', () => ocultarSheet('sheetGasto', 'sheetBackdropGasto'));
$('#sheetBackdropGasto').addEventListener('click', () => ocultarSheet('sheetGasto', 'sheetBackdropGasto'));

$('#btnGuardarGasto').addEventListener('click', async () => {
  const valor = Number(el.inputGastoValor.value);
  const descripcion = el.inputGastoDescripcion.value.trim();
  const fecha = el.inputGastoFecha.value || toDateKey(new Date());
  if (!valor || valor <= 0) { mostrarToast('Ingresa un valor válido'); return; }

  const datos = { valor, categoria: categoriaGastoSeleccionada, descripcion, fecha };
  try {
    if (editingGastoId) {
      await actualizarDocumento('gastos', editingGastoId, datos);
      mostrarToast('Gasto actualizado');
    } else {
      await crearDocumento('gastos', datos);
      mostrarToast('Gasto registrado');
    }
    ocultarSheet('sheetGasto', 'sheetBackdropGasto');
    cargarGastosVista();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo guardar el gasto');
  }
});

/* ==================== 12. SHEET: MARCAR DEUDA COMO PAGADA ==================== */

let medioPagoConfirmarSeleccionado = 'efectivo';
document.querySelectorAll('#segmentoMedioPagoConfirmar .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => { medioPagoConfirmarSeleccionado = seleccionarSegmento('segmentoMedioPagoConfirmar', btn.dataset.valor); });
});

function abrirSheetPago(entrega) {
  entregaParaPago = entrega;
  el.pagoResumen.textContent = `${entrega.nombre} · ${formatCOP(entrega.valor)} · realizado el ${formatFechaCorta(entrega.fecha)}`;
  medioPagoConfirmarSeleccionado = seleccionarSegmento('segmentoMedioPagoConfirmar', 'efectivo');
  mostrarSheet('sheetPago', 'sheetBackdropPago');
}
$('#btnCancelarPago').addEventListener('click', () => ocultarSheet('sheetPago', 'sheetBackdropPago'));
$('#sheetBackdropPago').addEventListener('click', () => ocultarSheet('sheetPago', 'sheetBackdropPago'));

$('#btnConfirmarPago').addEventListener('click', async () => {
  if (!entregaParaPago) return;
  try {
    await actualizarDocumento('entregas', entregaParaPago.id, {
      pagado: true,
      medioPago: medioPagoConfirmarSeleccionado,
      fechaPago: toDateKey(new Date())
    });
    ocultarSheet('sheetPago', 'sheetBackdropPago');
    mostrarToast('¡Pago registrado! Ya cuenta como ingreso de hoy 🎉');
    entregaParaPago = null;
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo registrar el pago');
  }
});

/* ==================== 13. MODAL: DETALLE DE UN DOMICILIO ===================== */

function abrirModalDetalle(entrega) {
  entregaParaDetalle = entrega;
  const filas = [
    ['Cliente', escapeHTML(entrega.nombre)],
    ['Valor', formatCOP(entrega.valor)],
    ['Fecha', formatFechaCorta(entrega.fecha)],
    ['Hora', formatHora12(entrega.hora)],
    ['Tipo', entrega.tipo === 'contrata' ? 'Contrata' : 'Normal'],
    ['Estado', entrega.pagado ? 'Pagado' : 'Pendiente de pago'],
    ['Medio de pago', entrega.pagado ? (entrega.medioPago === 'transferencia' ? 'Transferencia' : 'Efectivo') : '—'],
  ];
  if (entrega.pagado && entrega.fechaPago) filas.push(['Fecha de pago', formatFechaCorta(entrega.fechaPago)]);
  if (entrega.descripcion) filas.push(['Observación', escapeHTML(entrega.descripcion)]);

  el.detalleContenido.innerHTML = filas.map(([k, v]) => `<div class="calc-item"><span>${k}</span><strong>${v}</strong></div>`).join('');
  mostrarModal('modalDetalle', 'modalDetalleBackdrop');
}
$('#btnCerrarDetalle').addEventListener('click', () => ocultarModal('modalDetalle', 'modalDetalleBackdrop'));
$('#modalDetalleBackdrop').addEventListener('click', () => ocultarModal('modalDetalle', 'modalDetalleBackdrop'));
$('#btnEditarDesdeDetalle').addEventListener('click', () => {
  ocultarModal('modalDetalle', 'modalDetalleBackdrop');
  if (entregaParaDetalle) abrirSheetEntrega(entregaParaDetalle);
});

/* ========================= 14. MODAL: CÁLCULO DEL DÍA ======================= */

$('#btnCalcularDia').addEventListener('click', () => {
  const hoyKey = toDateKey(new Date());
  const realizados = entregasRealizadasEn(hoyKey);
  const pagados = entregasPagadasEl(hoyKey);
  const ingresos = totalDe(pagados);
  const gastosHoy = totalDe(gastosDe(hoyKey));

  el.calcTotal.textContent = formatCOP(ingresos);
  el.calcGastos.textContent = formatCOP(gastosHoy);
  el.calcNeta.textContent = formatCOP(ingresos - gastosHoy);
  el.calcCantidad.textContent = realizados.length;
  el.calcPromedio.textContent = formatCOP(realizados.length ? totalDe(realizados) / realizados.length : 0);
  el.calcPrimero.textContent = realizados.length ? formatHora12(realizados[0].hora) : '—';
  el.calcUltimo.textContent = realizados.length ? formatHora12(realizados[realizados.length - 1].hora) : '—';

  mostrarModal('modalCalculo', 'modalCalculoBackdrop');
});
$('#btnCerrarCalculo').addEventListener('click', () => ocultarModal('modalCalculo', 'modalCalculoBackdrop'));
$('#modalCalculoBackdrop').addEventListener('click', () => ocultarModal('modalCalculo', 'modalCalculoBackdrop'));

/* ============================ 15. MODAL: META =============================== */

function abrirModalMeta() {
  el.inputMeta.value = state.meta;
  mostrarModal('modalMeta', 'modalMetaBackdrop');
}
$('#btnAbrirMeta').addEventListener('click', abrirModalMeta);
$('#btnEditarMeta').addEventListener('click', abrirModalMeta);
$('#btnCancelarMeta').addEventListener('click', () => ocultarModal('modalMeta', 'modalMetaBackdrop'));
$('#modalMetaBackdrop').addEventListener('click', () => ocultarModal('modalMeta', 'modalMetaBackdrop'));

$('#btnGuardarMeta').addEventListener('click', () => {
  const valor = Number(el.inputMeta.value);
  if (!valor || valor <= 0) { mostrarToast('Ingresa una meta válida'); return; }
  state.meta = valor;
  guardarPerfilEnNube();
  ocultarModal('modalMeta', 'modalMetaBackdrop');
  renderTodo();
  mostrarToast('Meta semanal actualizada');
});

/* ======================= 16. MODAL: CONFIRMAR (genérico) ===================== */

function pedirConfirmacion(titulo, sub, callback, icono) {
  el.confirmIcono.textContent = icono || '🗑️';
  el.confirmTitulo.textContent = titulo;
  el.confirmSub.textContent = sub || 'Esta acción no se puede deshacer.';
  confirmCallback = callback;
  mostrarModal('modalConfirm', 'modalConfirmBackdrop');
}
$('#btnCancelarConfirm').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#modalConfirmBackdrop').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#btnConfirmarEliminar').addEventListener('click', async () => {
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
  ocultarModal('modalConfirm', 'modalConfirmBackdrop');
});

/* ======================== 17. HELPERS: SHEETS / MODALES / TOAST ============== */

function mostrarSheet(sheetId, backdropId) {
  document.getElementById(backdropId).classList.add('show');
  document.getElementById(sheetId).classList.add('show');
}
function ocultarSheet(sheetId, backdropId) {
  document.getElementById(backdropId).classList.remove('show');
  document.getElementById(sheetId).classList.remove('show');
}
function mostrarModal(modalId, backdropId) {
  document.getElementById(backdropId).classList.add('show');
  document.getElementById(modalId).classList.add('show');
}
function ocultarModal(modalId, backdropId) {
  document.getElementById(backdropId).classList.remove('show');
  document.getElementById(modalId).classList.remove('show');
}

let toastTimeout = null;
function mostrarToast(mensaje) {
  el.toast.textContent = mensaje;
  el.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove('show'), 2400);
}

function ocultarLoaderInicial() {
  el.bootLoader.style.display = 'none';
}

/* ============================ 18. AUTENTICACIÓN ============================ */

let modoRegistro = false;

function actualizarTextosAuth() {
  el.btnAuthPrincipal.textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  el.btnAuthToggle.textContent = modoRegistro ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear una';
  el.campoAuthNombre.style.display = modoRegistro ? 'block' : 'none';
  el.authError.textContent = '';
}
el.btnAuthToggle.addEventListener('click', () => { modoRegistro = !modoRegistro; actualizarTextosAuth(); });

function mensajeErrorAuth(codigo) {
  const mapa = {
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/missing-password': 'Escribe una contraseña.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/network-request-failed': 'Sin conexión a internet. Revisa tu red.',
    'auth/requires-recent-login': 'Por seguridad, vuelve a escribir tu contraseña actual.'
  };
  return mapa[codigo] || 'Ocurrió un error. Inténtalo de nuevo.';
}

el.btnAuthPrincipal.addEventListener('click', async () => {
  const nombre = el.authNombre.value.trim();
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  el.authError.textContent = '';

  if (!email || !password) { el.authError.textContent = 'Completa correo y contraseña.'; return; }
  if (modoRegistro && !nombre) { el.authError.textContent = 'Escribe cómo quieres que te llamemos.'; return; }

  el.btnAuthPrincipal.disabled = true;
  const textoOriginal = el.btnAuthPrincipal.textContent;
  el.btnAuthPrincipal.textContent = 'Un momento…';

  try {
    if (modoRegistro) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: nombre });
      renderSaludo(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    el.authError.textContent = mensajeErrorAuth(err.code);
  } finally {
    el.btnAuthPrincipal.disabled = false;
    el.btnAuthPrincipal.textContent = textoOriginal;
  }
});

$('#btnCerrarSesion').addEventListener('click', () => {
  pedirConfirmacion('¿Cerrar sesión?', 'Tus datos seguirán guardados en la nube.', () => signOut(auth), '👋');
});

function renderSaludo(user) {
  const nombre = user.displayName || user.email.split('@')[0];
  el.saludoUsuario.textContent = `Hola, ${nombre} 👋`;
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    el.authScreen.style.display = 'none';
    el.appContainer.style.display = 'flex';
    el.cuentaEmail.textContent = user.email;
    renderSaludo(user);
    el.authNombre.value = ''; el.authEmail.value = ''; el.authPassword.value = '';
    iniciarSuscripciones(user.uid);
  } else {
    currentUid = null;
    migracionHecha = false;
    detenerSuscripciones();
    mapaEntregasSemana.clear();
    state.entregas = []; state.gastos = []; state.deudas = []; state.frecuentes = []; state.meta = 800000;
    registros.items = []; registros.cursor = null; registros.hasMore = true;
    historialSemanas.cargado = false; historialSemanas.semanas = [];
    el.appContainer.style.display = 'none';
    el.authScreen.style.display = 'flex';
    ocultarLoaderInicial();
    modoRegistro = false;
    actualizarTextosAuth();
  }
});

/* ======================= 19. CONFIGURACIÓN DE CUENTA ======================== */

function abrirModalCuenta() {
  el.cuentaMsg.textContent = '';
  el.inputCuentaNombre.value = auth.currentUser?.displayName || '';
  el.inputCuentaNuevoCorreo.value = '';
  el.inputCuentaPasswordCorreo.value = '';
  el.inputCuentaNuevaPassword.value = '';
  el.inputCuentaPasswordActual.value = '';
  mostrarModal('modalCuenta', 'modalCuentaBackdrop');
}
$('#btnEditarCuenta').addEventListener('click', abrirModalCuenta);
$('#btnCerrarModalCuenta').addEventListener('click', () => ocultarModal('modalCuenta', 'modalCuentaBackdrop'));
$('#modalCuentaBackdrop').addEventListener('click', () => ocultarModal('modalCuenta', 'modalCuentaBackdrop'));

function mostrarMensajeCuenta(texto, esError) {
  el.cuentaMsg.textContent = texto;
  el.cuentaMsg.classList.toggle('is-error', !!esError);
}

async function reautenticar(passwordActual) {
  const credencial = EmailAuthProvider.credential(auth.currentUser.email, passwordActual);
  await reauthenticateWithCredential(auth.currentUser, credencial);
}

$('#btnGuardarNombre').addEventListener('click', async () => {
  const nombre = el.inputCuentaNombre.value.trim();
  if (!nombre) { mostrarMensajeCuenta('Escribe un nombre válido.', true); return; }
  try {
    await updateProfile(auth.currentUser, { displayName: nombre });
    renderSaludo(auth.currentUser);
    mostrarMensajeCuenta('Nombre actualizado ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
});

$('#btnCambiarCorreo').addEventListener('click', async () => {
  const nuevoCorreo = el.inputCuentaNuevoCorreo.value.trim();
  const passwordActual = el.inputCuentaPasswordCorreo.value;
  if (!nuevoCorreo) { mostrarMensajeCuenta('Escribe el nuevo correo.', true); return; }
  if (!passwordActual) { mostrarMensajeCuenta('Escribe tu contraseña actual para confirmar.', true); return; }
  try {
    await reautenticar(passwordActual);
    await updateEmail(auth.currentUser, nuevoCorreo);
    el.cuentaEmail.textContent = nuevoCorreo;
    el.inputCuentaNuevoCorreo.value = ''; el.inputCuentaPasswordCorreo.value = '';
    mostrarMensajeCuenta('Correo actualizado ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
});

$('#btnCambiarPassword').addEventListener('click', async () => {
  const nuevaPassword = el.inputCuentaNuevaPassword.value;
  const passwordActual = el.inputCuentaPasswordActual.value;
  if (!nuevaPassword || nuevaPassword.length < 6) { mostrarMensajeCuenta('La nueva contraseña debe tener al menos 6 caracteres.', true); return; }
  if (!passwordActual) { mostrarMensajeCuenta('Escribe tu contraseña actual para confirmar.', true); return; }
  try {
    await reautenticar(passwordActual);
    await updatePassword(auth.currentUser, nuevaPassword);
    el.inputCuentaNuevaPassword.value = ''; el.inputCuentaPasswordActual.value = '';
    mostrarMensajeCuenta('Contraseña actualizada ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
});

/* ============================ 20. INICIALIZACIÓN ============================= */

let ultimaFechaKey = toDateKey(new Date());
setInterval(() => {
  const actual = toDateKey(new Date());
  if (actual !== ultimaFechaKey) { ultimaFechaKey = actual; renderTodo(); }
}, 60 * 1000);

// Si tras 8s no ha llegado ningún dato (ej. sin conexión la primera vez), quitamos
// igual el loader para no dejar a la persona mirando una pantalla congelada.
setTimeout(ocultarLoaderInicial, 8000);

/* ========================= 21. PWA: SERVICE WORKER =========================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('No se pudo registrar el service worker:', err));
  });
}