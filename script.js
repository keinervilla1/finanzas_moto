/* =========================================================================
   DOMI — Control de domicilios para repartidores
   script.js — Refactorización v1.1
   
   Arquitectura de datos (v2):
   - usuarios/{uid}                   ➜ documento pequeño: frecuentes + meta
   - usuarios/{uid}/entregas/{id}     ➜ un documento por domicilio
   - usuarios/{uid}/gastos/{id}       ➜ un documento por gasto
   
   Se usa esta separación en subcolecciones (en vez de un solo documento
   con arreglos gigantes) para poder pedirle a Firestore solo "lo de esta semana"
   o "lo de este mes" con consultas (where/limit) en lugar de cargar TODO el
   historial cada vez ➜ así la app se mantiene rápida aunque acumules miles
   de domicilios con el tiempo.
   ========================================================================= */

/* =========================================================================
   0. CONFIGURACIÓN - FIREBASE INITIALIZATION
   ========================================================================= */

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
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
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager()
  })
});

// Mantiene la sesión iniciada en este dispositivo aunque se cierre el navegador
setPersistence(auth, browserLocalPersistence)
  .catch(err => console.warn('Persistencia de sesión:', err));

/* =========================================================================
   1. CONSTANTES Y CONFIGURACIÓN GLOBAL
   ========================================================================= */

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const APP_CONFIG = Object.freeze({
  META_SEMANAL_DEFAULT: 800000,
  PAGINACION_REGISTROS: 30,
  PAGINACION_GASTOS: 30,
  TIPOS_DOMICILIO: {
    NORMAL: 'normal',
    CONTRATA: 'contrata'
  },
  MEDIOS_PAGO: {
    EFECTIVO: 'efectivo',
    TRANSFERENCIA: 'transferencia'
  },
  CATEGORIAS_GASTO: {
    GASOLINA: 'gasolina',
    COMIDA: 'comida',
    MANTENIMIENTO: 'mantenimiento',
    PEAJES: 'peajes',
    OTROS: 'otros'
  }
});

const CATEGORIAS_GASTO_DISPLAY = {
  gasolina: { emoji: '⛽', label: 'Gasolina' },
  comida: { emoji: '🍽️', label: 'Comida' },
  mantenimiento: { emoji: '🔧', label: 'Mantenimiento' },
  peajes: { emoji: '🛣️', label: 'Peajes' },
  otros: { emoji: '📦', label: 'Otros' }
};

/* =========================================================================
   2. ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================= */

const AppState = Object.freeze({
  // Datos activos (semana actual + deudas + perfil)
  entregas: [],
  gastos: [],
  deudas: [],
  frecuentes: [],
  meta: APP_CONFIG.META_SEMANAL_DEFAULT,
  
  // Datos bajo demanda (registros históricos + gastos filtrados)
  registrosView: { items: [], cursor: null, hasMore: true, rango: 'semana', cargando: false },
  gastosVista: { items: [], rango: 'hoy' },
  historialSemanas: { cargado: false, semanas: [] }
});

// Estado mutable (en tiempo real)
let currentUid = null;
let migracionHecha = false;
const unsubs = {};
let escriturasEnCurso = 0;

// Deduplicador para entregas (evita duplicados si las dos queries traen lo mismo)
const mapaEntregasSemana = new Map();

/* =========================================================================
   3. ELEMENTOS DEL DOM (CACHE)
   ========================================================================= */

const $ = sel => document.querySelector(sel);

const el = {
  // Carga
  bootLoader: $('#bootLoader'),
  syncBar: $('#syncBar'),
  
  // Auth
  authScreen: $('#authScreen'),
  campoAuthNombre: $('#campoAuthNombre'),
  authNombre: $('#authNombre'),
  authEmail: $('#authEmail'),
  authPassword: $('#authPassword'),
  authError: $('#authError'),
  btnAuthPrincipal: $('#btnAuthPrincipal'),
  btnAuthToggle: $('#btnAuthToggle'),
  
  // App container
  appContainer: $('#appContainer'),
  
  // Top bar
  saludoUsuario: $('#saludoUsuario'),
  fechaActual: $('#fechaActual'),
  ringMiniFg: $('#ringMiniFg'),
  metaMiniPct: $('#metaMiniPct'),
  btnAbrirMeta: $('#btnAbrirMeta'),
  
  // Pantalla: Inicio
  gananciaHoy: $('#gananciaHoy'),
  cantidadHoy: $('#cantidadHoy'),
  gastosHoyMini: $('#gastosHoyMini'),
  ringHeroFg: $('#ringHeroFg'),
  ringHeroPct: $('#ringHeroPct'),
  gananciaSemanaMini: $('#gananciaSemanaMini'),
  totalDebenMini: $('#totalDebenMini'),
  badgeHoy: $('#badgeHoy'),
  listaHoy: $('#listaHoy'),
  emptyHoy: $('#emptyHoy'),
  btnAgregarDomicilio: $('#btnAgregarDomicilio'),
  btnCalcularDia: $('#btnCalcularDia'),
  
  // Pantalla: Semana
  goalBarFill: $('#goalBarFill'),
  goalActual: $('#goalActual'),
  goalMeta: $('#goalMeta'),
  mejorDiaValor: $('#mejorDiaValor'),
  mejorDiaNombre: $('#mejorDiaNombre'),
  promedioDiarioValor: $('#promedioDiarioValor'),
  listaDias: $('#listaDias'),
  totalSemana: $('#totalSemana'),
  totalGastosSemana: $('#totalGastosSemana'),
  listaHistorial: $('#listaHistorial'),
  emptyHistorial: $('#emptyHistorial'),
  btnEditarMeta: $('#btnEditarMeta'),
  
  // Pantalla: Registros
  filtrosRegistros: $('#filtrosRegistros'),
  listaRegistros: $('#listaRegistros'),
  emptyRegistros: $('#emptyRegistros'),
  btnCargarMasRegistros: $('#btnCargarMasRegistros'),
  
  // Pantalla: Deben
  totalDebenHeader: $('#totalDebenHeader'),
  badgeDeben: $('#badgeDeben'),
  listaDeben: $('#listaDeben'),
  emptyDeben: $('#emptyDeben'),
  
  // Pantalla: Gastos
  btnVolverGastos: $('#btnVolverGastos'),
  btnAgregarGasto: $('#btnAgregarGasto'),
  filtrosGastos: $('#filtrosGastos'),
  totalGastosFiltro: $('#totalGastosFiltro'),
  listaGastos: $('#listaGastos'),
  emptyGastos: $('#emptyGastos'),
  
  // Pantalla: Frecuentes
  listaFrecuentes: $('#listaFrecuentes'),
  emptyFrecuentes: $('#emptyFrecuentes'),
  btnNuevoFrecuente: $('#btnNuevoFrecuente'),
  cuentaEmail: $('#cuentaEmail'),
  btnIrAGastos: $('#btnIrAGastos'),
  btnEditarCuenta: $('#btnEditarCuenta'),
  btnCerrarSesion: $('#btnCerrarSesion'),
  
  // Screens
  screens: $('#screens'),
  screenInicio: $('#screen-inicio'),
  screenSemana: $('#screen-semana'),
  screenRegistros: $('#screen-registros'),
  screenDeben: $('#screen-deben'),
  screenGastos: $('#screen-gastos'),
  screenFrecuentes: $('#screen-frecuentes'),
  
  // Tabbar
  tabbar: document.querySelectorAll('.tabbar__item'),
  
  // Sheet: Domicilio
  sheetBackdrop: $('#sheetBackdrop'),
  sheetDomicilio: $('#sheetDomicilio'),
  sheetTitulo: $('#sheetTitulo'),
  chipsFrecuentes: $('#chipsFrecuentes'),
  inputNombre: $('#inputNombre'),
  inputValor: $('#inputValor'),
  inputHora: $('#inputHora'),
  segmentoTipo: $('#segmentoTipo'),
  segmentoPagado: $('#segmentoPagado'),
  bloqueMedioPago: $('#bloqueMedioPago'),
  segmentoMedioPago: $('#segmentoMedioPago'),
  campoDescripcion: $('#campoDescripcion'),
  inputDescripcion: $('#inputDescripcion'),
  btnCancelarDomicilio: $('#btnCancelarDomicilio'),
  btnGuardarDomicilio: $('#btnGuardarDomicilio'),
  
  // Sheet: Frecuente
  sheetBackdropFrecuente: $('#sheetBackdropFrecuente'),
  sheetFrecuente: $('#sheetFrecuente'),
  sheetFrecuenteTitulo: $('#sheetFrecuenteTitulo'),
  inputFrecNombre: $('#inputFrecNombre'),
  inputFrecValor: $('#inputFrecValor'),
  btnCancelarFrecuente: $('#btnCancelarFrecuente'),
  btnGuardarFrecuente: $('#btnGuardarFrecuente'),
  
  // Sheet: Gasto
  sheetBackdropGasto: $('#sheetBackdropGasto'),
  sheetGasto: $('#sheetGasto'),
  sheetGastoTitulo: $('#sheetGastoTitulo'),
  chipsCategoriaGasto: $('#chipsCategoriaGasto'),
  inputGastoValor: $('#inputGastoValor'),
  inputGastoDescripcion: $('#inputGastoDescripcion'),
  inputGastoFecha: $('#inputGastoFecha'),
  btnCancelarGasto: $('#btnCancelarGasto'),
  btnGuardarGasto: $('#btnGuardarGasto'),
  
  // Sheet: Pago
  sheetBackdropPago: $('#sheetBackdropPago'),
  sheetPago: $('#sheetPago'),
  pagoResumen: $('#pagoResumen'),
  segmentoMedioPagoConfirmar: $('#segmentoMedioPagoConfirmar'),
  btnCancelarPago: $('#btnCancelarPago'),
  btnConfirmarPago: $('#btnConfirmarPago'),
  
  // Modal: Detalle
  modalDetalleBackdrop: $('#modalDetalleBackdrop'),
  modalDetalle: $('#modalDetalle'),
  detalleContenido: $('#detalleContenido'),
  btnEditarDesdeDetalle: $('#btnEditarDesdeDetalle'),
  btnCerrarDetalle: $('#btnCerrarDetalle'),
  
  // Modal: Cálculo
  modalCalculoBackdrop: $('#modalCalculoBackdrop'),
  modalCalculo: $('#modalCalculo'),
  calcTotal: $('#calcTotal'),
  calcGastos: $('#calcGastos'),
  calcNeta: $('#calcNeta'),
  calcCantidad: $('#calcCantidad'),
  calcPromedio: $('#calcPromedio'),
  calcPrimero: $('#calcPrimero'),
  calcUltimo: $('#calcUltimo'),
  btnCerrarCalculo: $('#btnCerrarCalculo'),
  
  // Modal: Meta
  modalMetaBackdrop: $('#modalMetaBackdrop'),
  modalMeta: $('#modalMeta'),
  inputMeta: $('#inputMeta'),
  btnCancelarMeta: $('#btnCancelarMeta'),
  btnGuardarMeta: $('#btnGuardarMeta'),
  
  // Modal: Cuenta
  modalCuentaBackdrop: $('#modalCuentaBackdrop'),
  modalCuenta: $('#modalCuenta'),
  inputCuentaNombre: $('#inputCuentaNombre'),
  btnGuardarNombre: $('#btnGuardarNombre'),
  inputCuentaNuevoCorreo: $('#inputCuentaNuevoCorreo'),
  inputCuentaPasswordCorreo: $('#inputCuentaPasswordCorreo'),
  btnCambiarCorreo: $('#btnCambiarCorreo'),
  inputCuentaNuevaPassword: $('#inputCuentaNuevaPassword'),
  inputCuentaPasswordActual: $('#inputCuentaPasswordActual'),
  btnCambiarPassword: $('#btnCambiarPassword'),
  cuentaMsg: $('#cuentaMsg'),
  btnCerrarModalCuenta: $('#btnCerrarModalCuenta'),
  
  // Modal: Confirmación
  modalConfirmBackdrop: $('#modalConfirmBackdrop'),
  modalConfirm: $('#modalConfirm'),
  confirmIcono: $('#confirmIcono'),
  confirmTitulo: $('#confirmTitulo'),
  confirmSub: $('#confirmSub'),
  btnCancelarConfirm: $('#btnCancelarConfirm'),
  btnConfirmarEliminar: $('#btnConfirmarEliminar'),
  
  // Toast
  toast: $('#toast')
};

/* =========================================================================
   4. UTILIDADES - FORMATEO Y FECHAS
   ========================================================================= */

function formatCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

function formatHora12(hhmm) {
  if (!hhmm) return '–';
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
  return `${monday.getDate()} ${MESES[monday.getMonth()].slice(0,3)} — ${sunday.getDate()} ${MESES[sunday.getMonth()].slice(0,3)}`;
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

/* =========================================================================
   5. HELPERS FIRESTORE - REFERENCIAS Y OPERACIONES COMUNES
   ========================================================================= */

function refPerfil(uid) { return doc(db, 'usuarios', uid); }
function coleccion(uid, nombre) { return collection(db, 'usuarios', uid, nombre); }
function refDocumento(uid, nombreColeccion, id) { return doc(db, 'usuarios', uid, nombreColeccion, id); }

async function crearDocumento(nombreColeccion, datos) {
  marcarEscrituraInicio();
  try {
    return await addDoc(coleccion(currentUid, nombreColeccion), {
      ...datos,
      creadoEn: serverTimestamp()
    });
  } finally {
    marcarEscrituraFin();
  }
}

async function actualizarDocumento(nombreColeccion, id, cambios) {
  marcarEscrituraInicio();
  try {
    return await updateDoc(refDocumento(currentUid, nombreColeccion, id), cambios);
  } finally {
    marcarEscrituraFin();
  }
}

async function eliminarDocumento(nombreColeccion, id) {
  marcarEscrituraInicio();
  try {
    return await deleteDoc(refDocumento(currentUid, nombreColeccion, id));
  } finally {
    marcarEscrituraFin();
  }
}

function marcarEscrituraInicio() {
  escriturasEnCurso++;
  el.syncBar.classList.add('show');
}

function marcarEscrituraFin() {
  escriturasEnCurso = Math.max(0, escriturasEnCurso - 1);
  if (escriturasEnCurso === 0) el.syncBar.classList.remove('show');
}

function mapDoc(d) { return { id: d.id, ...d.data() }; }

function totalDe(lista) {
  return lista.reduce((sum, e) => sum + Number(e.valor), 0);
}

/* =========================================================================
   6. AUTENTICACIÓN
   ========================================================================= */

let modoRegistro = false;

function toggleModoAuth() {
  modoRegistro = !modoRegistro;
  el.campoAuthNombre.style.display = modoRegistro ? 'block' : 'none';
  el.btnAuthPrincipal.textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  el.btnAuthToggle.textContent = modoRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Crear una';
  el.authError.textContent = '';
}

function mensajeErrorAuth(codigo) {
  const mensajes = {
    'auth/user-not-found': 'Este correo no está registrado.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/email-already-in-use': 'Este correo ya está registrado.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/operation-not-allowed': 'El registro está deshabilitado. Intenta más tarde.',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.'
  };
  return mensajes[codigo] || 'Ocurrió un error. Intenta de nuevo.';
}

async function autenticar() {
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  const nombre = el.authNombre.value.trim();
  
  el.authError.textContent = '';
  
  if (!email || !password) {
    el.authError.textContent = 'Completa todos los campos.';
    return;
  }
  
  if (modoRegistro && !nombre) {
    el.authError.textContent = 'Escribe cómo quieres que te llamemos.';
    return;
  }
  
  el.btnAuthPrincipal.disabled = true;
  
  try {
    let user;
    if (modoRegistro) {
      const resultado = await createUserWithEmailAndPassword(auth, email, password);
      user = resultado.user;
      await updateProfile(user, { displayName: nombre });
    } else {
      const resultado = await signInWithEmailAndPassword(auth, email, password);
      user = resultado.user;
    }
  } catch (err) {
    el.authError.textContent = mensajeErrorAuth(err.code);
    el.btnAuthPrincipal.disabled = false;
  }
}

/* =========================================================================
   7. FIREBASE - SUSCRIPCIONES EN TIEMPO REAL
   ========================================================================= */

function detenerSuscripciones() {
  Object.values(unsubs).forEach(fn => fn && fn());
  for (const k in unsubs) delete unsubs[k];
}

/**
 * Perfil (frecuentes + meta) ➜ y migración única de datos antiguos si hace falta
 */
function suscribirse_Perfil(uid) {
  unsubs.perfil = onSnapshot(refPerfil(uid), async (snap) => {
    if (!snap.exists()) {
      await setDoc(refPerfil(uid), {
        frecuentes: frecuentesPorDefecto(),
        meta: APP_CONFIG.META_SEMANAL_DEFAULT
      });
      return;
    }
    
    const data = snap.data();
    AppState.frecuentes = data.frecuentes || [];
    AppState.meta = data.meta || APP_CONFIG.META_SEMANAL_DEFAULT;
    
    // Migración única: si quedó el arreglo "entregas" viejo en el perfil, lo movemos
    if (!migracionHecha && Array.isArray(data.entregas) && data.entregas.length > 0) {
      migracionHecha = true;
      mostrarToast('Actualizando tus datos a la nueva versión…');
      for (const e of data.entregas) {
        await crearDocumento('entregas', {
          nombre: e.nombre, valor: Number(e.valor), hora: e.hora, fecha: e.fecha,
          tipo: 'normal', medioPago: 'efectivo', pagado: true,
          fechaPago: e.fecha, descripcion: ''
        });
      }
      await updateDoc(refPerfil(uid), { entregas: deleteField() });
      mostrarToast('¡Listo! Tus domicilios anteriores ya están migrados ✅');
    }
    migracionHecha = true;
    
    renderTodo();
    ocultarLoaderInicial();
  }, (err) => {
    console.error(err);
    mostrarToast('Error al cargar tu perfil');
    ocultarLoaderInicial();
  });
}

/**
 * Domicilios realizados esta semana (por fecha de creación)
 */
function suscribirse_EntregasSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(
    coleccion(uid, 'entregas'),
    where('fecha', '>=', inicio),
    where('fecha', '<=', fin),
    orderBy('fecha')
  );
  unsubs.entregasSemana = onSnapshot(q, (snap) => {
    mezclaryEntregas(snap.docs.map(mapDoc));
    renderTodo();
    ocultarLoaderInicial();
  }, (err) => console.error(err));
}

/**
 * Domicilios pagados esta semana (pero creados antes: deudas cobradas)
 */
function suscribirse_EntregasPagadasEnSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(
    coleccion(uid, 'entregas'),
    where('pagado', '==', true),
    where('fechaPago', '>=', inicio),
    where('fechaPago', '<=', fin)
  );
  unsubs.entregasPagadasSemana = onSnapshot(q, (snap) => {
    mezclaryEntregas(snap.docs.map(mapDoc));
    renderTodo();
  }, (err) => {
    console.warn('Consulta de pagos cruzados de semana:', err.message);
  });
}

/**
 * Gastos de la semana actual
 */
function suscribirse_GastosSemana(uid, monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  const q = query(
    coleccion(uid, 'gastos'),
    where('fecha', '>=', inicio),
    where('fecha', '<=', fin),
    orderBy('fecha')
  );
  unsubs.gastosSemana = onSnapshot(q, (snap) => {
    AppState.gastos = snap.docs.map(mapDoc);
    renderTodo();
  }, (err) => console.error(err));
}

/**
 * Todas las deudas pendientes (pagado:false), sin importar cuando se crearon
 */
function suscribirse_Deudas(uid) {
  const q = query(
    coleccion(uid, 'entregas'),
    where('pagado', '==', false)
  );
  unsubs.deudas = onSnapshot(q, (snap) => {
    AppState.deudas = snap.docs.map(mapDoc).sort((a, b) => a.fecha < b.fecha ? 1 : -1);
    renderTodo();
  }, (err) => console.error(err));
}

function mezclaryEntregas(items) {
  items.forEach(it => mapaEntregasSemana.set(it.id, it));
  AppState.entregas = [...mapaEntregasSemana.values()];
}

function iniciarSuscripciones(uid) {
  detenerSuscripciones();
  mapaEntregasSemana.clear();
  const monday = getMonday(new Date());
  suscribirse_Perfil(uid);
  suscribirse_EntregasSemana(uid, monday);
  suscribirse_EntregasPagadasEnSemana(uid, monday);
  suscribirse_GastosSemana(uid, monday);
  suscribirse_Deudas(uid);
}

/* =========================================================================
   8. CÁLCULOS DERIVADOS
   ========================================================================= */

function entregasRealizadasEn(fechaKey) {
  return AppState.entregas.filter(e => e.fecha === fechaKey).sort((a, b) => a.hora.localeCompare(b.hora));
}

function entregasPagadasEl(fechaKey) {
  return AppState.entregas.filter(e => e.pagado && e.fechaPago === fechaKey);
}

function gastosEn(fechaKey) {
  return AppState.gastos.filter(g => g.fecha === fechaKey);
}

function ingresoRealizadoEn(fechaKey) {
  return totalDe(entregasRealizadasEn(fechaKey));
}

function ingresoPagadoEl(fechaKey) {
  return totalDe(entregasPagadasEl(fechaKey));
}

function gastoEn(fechaKey) {
  return totalDe(gastosEn(fechaKey));
}

function gananciaNetaEn(fechaKey) {
  return ingresoPagadoEl(fechaKey) - gastoEn(fechaKey);
}

function rangoFechasDeHoy() {
  const hoy = toDateKey(new Date());
  return { inicio: hoy, fin: hoy };
}

function rangoFechasDeEstaSemana() {
  const monday = getMonday(new Date());
  return { inicio: toDateKey(monday), fin: toDateKey(addDays(monday, 6)) };
}

function rangoFechasDeEsteMes() {
  const hoy = new Date();
  return { inicio: toDateKey(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fin: toDateKey(hoy) };
}

function rangoFechasUltimos3Meses() {
  const hoy = new Date();
  const hace3 = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate());
  return { inicio: toDateKey(hace3), fin: toDateKey(hoy) };
}

function filtrarPorRango(items, rango) {
  let inicio, fin;
  if (rango === 'semana') {
    ({ inicio, fin } = rangoFechasDeEstaSemana());
  } else if (rango === 'mes') {
    ({ inicio, fin } = rangoFechasDeEsteMes());
  } else if (rango === '3meses') {
    ({ inicio, fin } = rangoFechasUltimos3Meses());
  } else {
    return items;
  }
  return items.filter(i => i.fecha >= inicio && i.fecha <= fin);
}

/* =========================================================================
   9. ACTUALIZAR PERFIL - GUARDAR FRECUENTES/META EN NUBE
   ========================================================================= */

let guardarPerfilTimeout = null;

function guardarPerfilEnNube() {
  if (!currentUid) return;
  clearTimeout(guardarPerfilTimeout);
  marcarEscrituraInicio();
  guardarPerfilTimeout = setTimeout(async () => {
    try {
      await setDoc(refPerfil(currentUid), { frecuentes: AppState.frecuentes, meta: AppState.meta }, { merge: true });
    } catch (err) {
      console.error(err);
      mostrarToast('Sin conexión: se guardará cuando vuelva el internet');
    } finally {
      marcarEscrituraFin();
    }
  }, 250);
}

/* =========================================================================
   10. NAVEGACIÓN Y CAMBIO DE PANTALLA
   ========================================================================= */

function irAPantalla(nombrePantalla) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tabbar__item').forEach(t => t.classList.remove('active'));
  
  const screen = document.getElementById(`screen-${nombrePantalla}`);
  if (screen) {
    screen.classList.add('active');
  }
  
  const tabItem = document.querySelector(`[data-screen="${nombrePantalla}"]`);
  if (tabItem) {
    tabItem.classList.add('active');
  }
  
  // Scroll a arriba
  el.screens.scrollTop = 0;
  
  // Renderizados específicos de la pantalla
  if (nombrePantalla === 'semana') {
    renderPantallaSemana();
  } else if (nombrePantalla === 'registros') {
    if (!AppState.registrosView.cargado) {
      cargarRegistrosInicial();
    }
  } else if (nombrePantalla === 'gastos') {
    cargarGastosVista();
  }
}

/* =========================================================================
   11. RENDERIZADOS - INICIO
   ========================================================================= */

function renderPantallaInicio() {
  // Hoy
  const hoy = toDateKey(new Date());
  const entregasHoy = entregasRealizadasEn(hoy);
  const pagosHoy = entregasPagadasEl(hoy);
  const gastosHoy = gastosEn(hoy);
  
  const ingresoRealizado = totalDe(entregasHoy);
  const ingresoPayment = totalDe(pagosHoy);
  const gastoHoy = totalDe(gastosHoy);
  const gananciaHoyVal = ingresoPayment - gastoHoy;
  
  el.gananciaHoy.textContent = formatCOP(gananciaHoyVal);
  el.gananciaHoy.classList.toggle('bump', true);
  setTimeout(() => el.gananciaHoy.classList.remove('bump'), 350);
  
  el.cantidadHoy.textContent = entregasHoy.length;
  el.gastosHoyMini.textContent = formatCOP(gastoHoy);
  el.badgeHoy.textContent = entregasHoy.length;
  
  // Anillo meta
  const pctHoy = AppState.meta ? Math.min(100, Math.round(gananciaHoyVal / AppState.meta * 100)) : 0;
  el.ringHeroPct.textContent = pctHoy + '%';
  const circumference = 226.2;
  el.ringHeroFg.style.strokeDashoffset = circumference * (1 - pctHoy / 100);
  
  // Top bar mini anillo
  const semana = getMonday(new Date());
  const ingresoSemana = totalDe(AppState.entregas.filter(e => e.fecha >= toDateKey(semana) && e.fecha <= toDateKey(addDays(semana, 6))));
  const pctSemana = AppState.meta ? Math.min(100, Math.round(ingresoSemana / AppState.meta * 100)) : 0;
  el.metaMiniPct.textContent = pctSemana + '%';
  el.ringMiniFg.style.strokeDashoffset = 100.5 * (1 - pctSemana / 100);
  
  // Stats
  el.gananciaSemanaMini.textContent = formatCOP(ingresoSemana);
  el.totalDebenMini.textContent = formatCOP(totalDe(AppState.deudas));
  const chipDeben = document.getElementById('chipDeben');
  if (chipDeben) {
    chipDeben.classList.toggle('stat-chip--warn', AppState.deudas.length > 0);
  }
  
  // Lista de hoy
  el.listaHoy.innerHTML = '';
  if (entregasHoy.length === 0) {
    el.listaHoy.style.display = 'none';
  } else {
    el.listaHoy.style.display = 'flex';
    entregasHoy.forEach(e => {
      const li = document.createElement('li');
      li.className = 'entrega-item';
      li.innerHTML = `
        <div class="entrega-item__icon">📦</div>
        <div class="entrega-item__info">
          <p class="entrega-item__nombre">${escapeHTML(e.nombre)}</p>
          <p class="entrega-item__hora">${formatHora12(e.hora)}</p>
        </div>
        <div class="entrega-item__valor">${formatCOP(e.valor)}</div>
        <button class="entrega-item__del" data-id="${e.id}" title="Eliminar">🗑</button>
      `;
      li.addEventListener('click', () => abrirDetalleEntrega(e));
      li.querySelector('.entrega-item__del').addEventListener('click', (evt) => {
        evt.stopPropagation();
        abrirConfirmEliminacion('¿Eliminar este domicilio?', 'Esta acción no se puede deshacer.', () => eliminarEntrega(e.id));
      });
      el.listaHoy.appendChild(li);
    });
  }
  
  // Fecha y saludo
  const nombreUsuario = auth.currentUser?.displayName || 'Amig@';
  el.saludoUsuario.textContent = `Hola, ${nombreUsuario.split(' ')[0]} 👋`;
  el.fechaActual.textContent = formatFechaLarga(new Date());
}

/* =========================================================================
   12. RENDERIZADOS - SEMANA
   ========================================================================= */

function renderPantallaSemana() {
  const monday = getMonday(new Date());
  const ingresoSemana = totalDe(AppState.entregas);
  const gastoSemana = totalDe(AppState.gastos);
  const ganancia = ingresoSemana - gastoSemana;
  
  // Barra de meta
  const pct = AppState.meta ? Math.min(100, Math.round(ingresoSemana / AppState.meta * 100)) : 0;
  el.goalBarFill.style.width = pct + '%';
  el.goalActual.textContent = formatCOP(ingresoSemana);
  el.goalMeta.textContent = `de ${formatCOP(AppState.meta)}`;
  
  // Stats
  let mejorDia = null, mejorValor = 0;
  for (let i = 0; i < 7; i++) {
    const fk = toDateKey(addDays(monday, i));
    const val = ingresoPagadoEl(fk);
    if (val > mejorValor) {
      mejorValor = val;
      mejorDia = fk;
    }
  }
  el.mejorDiaValor.textContent = formatCOP(mejorValor);
  el.mejorDiaNombre.textContent = mejorDia ? `${DIAS_SEMANA[new Date(mejorDia).getDay()]}` : 'Sin datos';
  
  const diasConEntrega = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const fk = toDateKey(date);
    const entregadas = entregasRealizadasEn(fk);
    const pagadas = entregasPagadasEl(fk);
    if (entregadas.length > 0 || pagadas.length > 0) {
      diasConEntrega.push({ date, fk });
    }
  }
  
  const promedioDiario = diasConEntrega.length > 0 ? Math.round(ingresoSemana / diasConEntrega.length) : 0;
  el.promedioDiarioValor.textContent = formatCOP(promedioDiario);
  
  // Lista de días
  el.listaDias.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const fk = toDateKey(date);
    const valor = ingresoPagadoEl(fk);
    const esHoy = fk === toDateKey(new Date());
    
    const li = document.createElement('li');
    li.className = 'dia-item' + (esHoy ? ' is-today' : '');
    li.innerHTML = `
      <span class="dia-item__nombre">
        ${DIAS_SEMANA[date.getDay()]}
        ${esHoy ? '<span class="dia-item__hoy">Hoy</span>' : ''}
      </span>
      <span class="dia-item__valor${valor === 0 ? ' is-zero' : ''}">${formatCOP(valor)}</span>
    `;
    el.listaDias.appendChild(li);
  }
  
  // Totales
  el.totalSemana.textContent = formatCOP(ingresoSemana);
  el.totalGastosSemana.textContent = formatCOP(gastoSemana);
  
  // Historial de semanas anteriores (lazy load con Open/Close)
  cargarHistorialSemanas();
}

function cargarHistorialSemanas() {
  if (AppState.historialSemanas.cargado) {
    renderHistorial();
    return;
  }
  
  AppState.historialSemanas.cargado = true;
  
  // Lazy: traer últimas 12 semanas
  (async () => {
    const semanas = [];
    const hoy = new Date();
    const mondayHoy = getMonday(hoy);
    
    for (let i = 1; i <= 12; i++) {
      const mondayAnterior = addDays(mondayHoy, -7 * i);
      const inicio = toDateKey(mondayAnterior);
      const fin = toDateKey(addDays(mondayAnterior, 6));
      
      const qEntregas = query(
        coleccion(currentUid, 'entregas'),
        where('fechaPago', '>=', inicio),
        where('fechaPago', '<=', fin)
      );
      const qGastos = query(
        coleccion(currentUid, 'gastos'),
        where('fecha', '>=', inicio),
        where('fecha', '<=', fin)
      );
      
      const [docsE, docsG] = await Promise.all([getDocs(qEntregas), getDocs(qGastos)]);
      const entregas = docsE.docs.map(mapDoc);
      const gastos = docsG.docs.map(mapDoc);
      
      const ingreso = totalDe(entregas);
      const gasto = totalDe(gastos);
      
      if (ingreso > 0 || gasto > 0) {
        semanas.push({
          monday: mondayAnterior,
          ingreso,
          gasto,
          ganancia: ingreso - gasto,
          dias: entregas.map(e => ({
            fecha: e.fechaPago,
            ingreso: e.valor,
            gastoDelDia: totalDe(gastos.filter(g => g.fecha === e.fechaPago))
          }))
        });
      }
    }
    
    AppState.historialSemanas.semanas = semanas;
    renderHistorial();
  })();
}

function renderHistorial() {
  el.listaHistorial.innerHTML = '';
  
  if (AppState.historialSemanas.semanas.length === 0) {
    el.listaHistorial.style.display = 'none';
    return;
  }
  
  el.listaHistorial.style.display = 'flex';
  AppState.historialSemanas.semanas.forEach((semana) => {
    const li = document.createElement('li');
    li.className = 'historial-item';
    
    const diasHTML = semana.dias.map(d => `
      <div class="historial-dia-row">
        <span>${formatFechaCorta(d.fecha)}</span>
        <span>${formatCOP(d.ingreso)}</span>
      </div>
    `).join('');
    
    li.innerHTML = `
      <div class="historial-item__head">
        <span class="historial-item__rango">${rangoSemanaTexto(semana.monday)}</span>
        <span class="historial-item__total">${formatCOP(semana.ganancia)}</span>
      </div>
      <p class="historial-item__meta">Ingreso: ${formatCOP(semana.ingreso)} · Gastos: ${formatCOP(semana.gasto)}</p>
      <div class="historial-item__dias">${diasHTML}</div>
    `;
    
    li.addEventListener('click', () => {
      li.classList.toggle('open');
    });
    
    el.listaHistorial.appendChild(li);
  });
}

/* =========================================================================
   13. RENDERIZADOS - REGISTROS Y GASTOS (CON PAGINACIÓN)
   ========================================================================= */

async function cargarRegistrosInicial() {
  AppState.registrosView.items = [];
  AppState.registrosView.cursor = null;
  AppState.registrosView.hasMore = true;
  AppState.registrosView.cargado = true;
  await cargarMasRegistros();
}

async function cargarMasRegistros() {
  if (AppState.registrosView.cargando || !AppState.registrosView.hasMore) return;
  
  AppState.registrosView.cargando = true;
  
  const rango = AppState.registrosView.rango;
  let qy;
  
  if (rango === 'semana') {
    const { inicio, fin } = rangoFechasDeEstaSemana();
    qy = query(
      coleccion(currentUid, 'entregas'),
      where('fecha', '>=', inicio),
      where('fecha', '<=', fin),
      orderBy('fecha', 'desc'),
      limit(APP_CONFIG.PAGINACION_REGISTROS + 1)
    );
  } else if (rango === 'mes') {
    const { inicio, fin } = rangoFechasDeEsteMes();
    qy = query(
      coleccion(currentUid, 'entregas'),
      where('fecha', '>=', inicio),
      where('fecha', '<=', fin),
      orderBy('fecha', 'desc'),
      limit(APP_CONFIG.PAGINACION_REGISTROS + 1)
    );
  } else if (rango === '3meses') {
    const { inicio, fin } = rangoFechasUltimos3Meses();
    qy = query(
      coleccion(currentUid, 'entregas'),
      where('fecha', '>=', inicio),
      where('fecha', '<=', fin),
      orderBy('fecha', 'desc'),
      limit(APP_CONFIG.PAGINACION_REGISTROS + 1)
    );
  } else {
    qy = query(
      coleccion(currentUid, 'entregas'),
      orderBy('fecha', 'desc'),
      limit(APP_CONFIG.PAGINACION_REGISTROS + 1)
    );
  }
  
  if (AppState.registrosView.cursor) {
    qy = query(
      ...qy._query.constraints,
      startAfter(AppState.registrosView.cursor),
      limit(APP_CONFIG.PAGINACION_REGISTROS + 1)
    );
  }
  
  const snap = await getDocs(qy);
  const docs = snap.docs.map(mapDoc);
  
  if (docs.length > APP_CONFIG.PAGINACION_REGISTROS) {
    AppState.registrosView.items.push(...docs.slice(0, -1));
    AppState.registrosView.cursor = snap.docs[APP_CONFIG.PAGINACION_REGISTROS - 1];
  } else {
    AppState.registrosView.items.push(...docs);
    AppState.registrosView.hasMore = false;
  }
  
  AppState.registrosView.cargando = false;
  renderRegistros();
}

function renderRegistros() {
  el.listaRegistros.innerHTML = '';
  
  if (AppState.registrosView.items.length === 0) {
    el.listaRegistros.style.display = 'none';
  } else {
    el.listaRegistros.style.display = 'flex';
    AppState.registrosView.items.forEach(e => {
      const li = document.createElement('li');
      li.className = 'entrega-item';
      li.innerHTML = `
        <div class="entrega-item__icon">📦</div>
        <div class="entrega-item__info">
          <p class="entrega-item__nombre">${escapeHTML(e.nombre)}</p>
          <p class="entrega-item__hora">${formatFechaCorta(e.fecha)} · ${formatHora12(e.hora)}</p>
          <div class="entrega-item__badges">
            <span class="mini-badge${e.tipo === 'contrata' ? ' mini-badge--contrata' : ''}">${e.tipo}</span>
            <span class="mini-badge${!e.pagado ? ' mini-badge--pendiente' : ''}">${e.pagado ? 'Pagado' : 'Pendiente'}</span>
          </div>
        </div>
        <div class="entrega-item__valor">${formatCOP(e.valor)}</div>
        <button class="entrega-item__del" data-id="${e.id}" title="Eliminar">🗑</button>
      `;
      li.addEventListener('click', () => abrirDetalleEntrega(e));
      li.querySelector('.entrega-item__del').addEventListener('click', (evt) => {
        evt.stopPropagation();
        abrirConfirmEliminacion('¿Eliminar este domicilio?', 'Esta acción no se puede deshacer.', () => eliminarEntrega(e.id));
      });
      el.listaRegistros.appendChild(li);
    });
  }
  
  el.btnCargarMasRegistros.style.display = AppState.registrosView.hasMore ? 'block' : 'none';
}

function cargarGastosVista() {
  const rango = AppState.gastosVista.rango;
  let inicio, fin;
  
  if (rango === 'hoy') {
    ({ inicio, fin } = rangoFechasDeHoy());
  } else if (rango === 'semana') {
    ({ inicio, fin } = rangoFechasDeEstaSemana());
  } else if (rango === 'mes') {
    ({ inicio, fin } = rangoFechasDeEsteMes());
  } else {
    AppState.gastosVista.items = AppState.gastos;
    renderGastosVista();
    return;
  }
  
  AppState.gastosVista.items = AppState.gastos.filter(g => g.fecha >= inicio && g.fecha <= fin);
  renderGastosVista();
}

function renderGastosVista() {
  el.listaGastos.innerHTML = '';
  
  const total = totalDe(AppState.gastosVista.items);
  el.totalGastosFiltro.textContent = formatCOP(total);
  
  if (AppState.gastosVista.items.length === 0) {
    el.listaGastos.style.display = 'none';
  } else {
    el.listaGastos.style.display = 'flex';
    AppState.gastosVista.items.forEach(g => {
      const cat = CATEGORIAS_GASTO_DISPLAY[g.categoria] || { emoji: '📦', label: 'Otro' };
      const li = document.createElement('li');
      li.className = 'entrega-item';
      li.innerHTML = `
        <div class="entrega-item__icon">${cat.emoji}</div>
        <div class="entrega-item__info">
          <p class="entrega-item__nombre">${cat.label}</p>
          <p class="entrega-item__hora">${escapeHTML(g.descripcion || '(sin descripción)')}</p>
        </div>
        <div class="entrega-item__valor">${formatCOP(g.valor)}</div>
        <button class="entrega-item__del" data-id="${g.id}" title="Eliminar">🗑</button>
      `;
      li.addEventListener('click', () => abrirDetalleGasto(g));
      li.querySelector('.entrega-item__del').addEventListener('click', (evt) => {
        evt.stopPropagation();
        abrirConfirmEliminacion('¿Eliminar este gasto?', 'Esta acción no se puede deshacer.', () => eliminarGasto(g.id));
      });
      el.listaGastos.appendChild(li);
    });
  }
}

/* =========================================================================
   14. RENDERIZADOS - DEBEN Y FRECUENTES
   ========================================================================= */

function renderDeudas() {
  el.badgeDeben.textContent = AppState.deudas.length;
  el.totalDebenHeader.textContent = formatCOP(totalDe(AppState.deudas));
  
  el.listaDeben.innerHTML = '';
  
  if (AppState.deudas.length === 0) {
    el.listaDeben.style.display = 'none';
  } else {
    el.listaDeben.style.display = 'flex';
    AppState.deudas.forEach(e => {
      const li = document.createElement('li');
      li.className = 'entrega-item';
      li.innerHTML = `
        <div class="entrega-item__icon">💰</div>
        <div class="entrega-item__info">
          <p class="entrega-item__nombre">${escapeHTML(e.nombre)}</p>
          <p class="entrega-item__hora">${formatFechaCorta(e.fecha)}</p>
        </div>
        <div class="entrega-item__valor">${formatCOP(e.valor)}</div>
        <button class="entrega-item__del" data-id="${e.id}" title="Marcar como pagado">✓</button>
      `;
      li.addEventListener('click', () => abrirSheetPago(e));
      li.querySelector('.entrega-item__del').addEventListener('click', (evt) => {
        evt.stopPropagation();
        abrirSheetPago(e);
      });
      el.listaDeben.appendChild(li);
    });
  }
}

function renderFrecuentes() {
  el.listaFrecuentes.innerHTML = '';
  
  if (AppState.frecuentes.length === 0) {
    el.listaFrecuentes.style.display = 'none';
  } else {
    el.listaFrecuentes.style.display = 'flex';
    AppState.frecuentes.forEach(f => {
      const li = document.createElement('li');
      li.className = 'frecuente-item';
      li.innerHTML = `
        <div class="frecuente-item__info">
          <p class="frecuente-item__nombre">${escapeHTML(f.nombre)}</p>
          <p class="frecuente-item__valor">${formatCOP(f.valor)}</p>
        </div>
        <div class="frecuente-item__actions">
          <button class="icon-btn icon-btn--edit" data-id="${f.id}" title="Editar">✎</button>
          <button class="icon-btn icon-btn--del" data-id="${f.id}" title="Eliminar">🗑</button>
        </div>
      `;
      li.querySelector('.icon-btn--edit').addEventListener('click', () => abrirSheetFrecuenteEditar(f));
      li.querySelector('.icon-btn--del').addEventListener('click', () => {
        abrirConfirmEliminacion('¿Eliminar frecuente?', `Se eliminará "${f.nombre}".`, () => {
          AppState.frecuentes = AppState.frecuentes.filter(x => x.id !== f.id);
          guardarPerfilEnNube();
          renderFrecuentes();
        });
      });
      el.listaFrecuentes.appendChild(li);
    });
  }
  
  el.cuentaEmail.textContent = auth.currentUser?.email || '—';
}

/* =========================================================================
   15. RENDERIZADO GENERAL
   ========================================================================= */

function renderTodo() {
  renderPantallaInicio();
  renderDeudas();
  renderFrecuentes();
}

/* =========================================================================
   16. SHEETS (BOTTOM MODALS) - DOMICILIOS
   ========================================================================= */

let deEntregaEnEdicion = null;

function abrirSheetDomicilio(entrega = null) {
  deEntregaEnEdicion = entrega;
  
  if (entrega) {
    el.sheetTitulo.textContent = 'Editar domicilio';
    el.inputNombre.value = entrega.nombre;
    el.inputValor.value = entrega.valor;
    el.inputHora.value = entrega.hora;
    
    document.querySelectorAll('#segmentoTipo .segmented__opt').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.valor === entrega.tipo);
    });
    
    const estadoPagado = entrega.pagado ? 'si' : 'no';
    document.querySelectorAll('#segmentoPagado .segmented__opt').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.valor === estadoPagado);
    });
    
    el.bloqueMedioPago.style.display = entrega.pagado ? 'block' : 'none';
    document.querySelectorAll('#segmentoMedioPago .segmented__opt').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.valor === entrega.medioPago);
    });
    
    el.campoDescripcion.style.display = entrega.pagado ? 'none' : 'block';
    el.inputDescripcion.value = entrega.descripcion || '';
  } else {
    el.sheetTitulo.textContent = 'Agregar domicilio';
    el.inputNombre.value = '';
    el.inputValor.value = '';
    el.inputHora.value = '';
    document.querySelectorAll('#segmentoTipo .segmented__opt')[0].click();
    document.querySelectorAll('#segmentoPagado .segmented__opt')[0].click();
    el.bloqueMedioPago.style.display = 'block';
    el.campoDescripcion.style.display = 'none';
    el.inputDescripcion.value = '';
  }
  
  renderChipsFrecuentes();
  abrirSheet(el.sheetDomicilio);
}

function renderChipsFrecuentes() {
  el.chipsFrecuentes.innerHTML = '';
  AppState.frecuentes.forEach(f => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.valor = f.id;
    btn.textContent = `${f.nombre} · ${formatCOP(f.valor)}`;
    btn.addEventListener('click', () => {
      el.inputNombre.value = f.nombre;
      el.inputValor.value = f.valor;
      el.inputNombre.focus();
    });
    el.chipsFrecuentes.appendChild(btn);
  });
}

async function guardarDomicilio() {
  const nombre = el.inputNombre.value.trim();
  const valor = Number(el.inputValor.value);
  const hora = el.inputHora.value;
  const tipo = document.querySelector('#segmentoTipo .segmented__opt.selected').dataset.valor;
  const pagado = document.querySelector('#segmentoPagado .segmented__opt.selected').dataset.valor === 'si';
  const medioPago = document.querySelector('#segmentoMedioPago .segmented__opt.selected').dataset.valor;
  const descripcion = el.inputDescripcion.value.trim();
  
  if (!nombre || !valor || !hora) {
    mostrarToast('Completa: nombre, valor y hora');
    return;
  }
  
  const hoy = toDateKey(new Date());
  
  try {
    if (deEntregaEnEdicion) {
      await actualizarDocumento('entregas', deEntregaEnEdicion.id, {
        nombre, valor, hora, tipo, pagado, medioPago,
        fechaPago: pagado ? hoy : deEntregaEnEdicion.fechaPago,
        descripcion
      });
      mostrarToast('Domicilio actualizado ✓');
    } else {
      await crearDocumento('entregas', {
        nombre, valor, hora, tipo, pagado, medioPago,
        fecha: hoy,
        fechaPago: pagado ? hoy : null,
        descripcion
      });
      mostrarToast('Domicilio agregado ✓');
    }
    cerrarSheet(el.sheetDomicilio);
  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar');
  }
}

async function eliminarEntrega(id) {
  try {
    await eliminarDocumento('entregas', id);
    mostrarToast('Domicilio eliminado');
  } catch (err) {
    console.error(err);
    mostrarToast('Error al eliminar');
  }
}

/* =========================================================================
   17. SHEETS - FRECUENTES
   ========================================================================= */

let deFrecuenteEnEdicion = null;

function abrirSheetFrecuenteNuevo() {
  deFrecuenteEnEdicion = null;
  el.sheetFrecuenteTitulo.textContent = 'Nuevo domicilio frecuente';
  el.inputFrecNombre.value = '';
  el.inputFrecValor.value = '';
  abrirSheet(el.sheetFrecuente);
}

function abrirSheetFrecuenteEditar(frecuente) {
  deFrecuenteEnEdicion = frecuente;
  el.sheetFrecuenteTitulo.textContent = 'Editar domicilio frecuente';
  el.inputFrecNombre.value = frecuente.nombre;
  el.inputFrecValor.value = frecuente.valor;
  abrirSheet(el.sheetFrecuente);
}

async function guardarFrecuente() {
  const nombre = el.inputFrecNombre.value.trim();
  const valor = Number(el.inputFrecValor.value);
  
  if (!nombre || !valor) {
    mostrarToast('Completa nombre y valor');
    return;
  }
  
  if (deFrecuenteEnEdicion) {
    deFrecuenteEnEdicion.nombre = nombre;
    deFrecuenteEnEdicion.valor = valor;
  } else {
    AppState.frecuentes.push({ id: uid(), nombre, valor });
  }
  
  guardarPerfilEnNube();
  renderFrecuentes();
  cerrarSheet(el.sheetFrecuente);
  mostrarToast('Frecuente guardado ✓');
}

/* =========================================================================
   18. SHEETS - GASTOS
   ========================================================================= */

let deGastoEnEdicion = null;

function abrirSheetGasto(gasto = null) {
  deGastoEnEdicion = gasto;
  
  if (gasto) {
    el.sheetGastoTitulo.textContent = 'Editar gasto';
    document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.valor === gasto.categoria);
    });
    el.inputGastoValor.value = gasto.valor;
    el.inputGastoDescripcion.value = gasto.descripcion || '';
    el.inputGastoFecha.value = gasto.fecha;
  } else {
    el.sheetGastoTitulo.textContent = 'Registrar gasto';
    document.querySelectorAll('#chipsCategoriaGasto .chip')[0].click();
    el.inputGastoValor.value = '';
    el.inputGastoDescripcion.value = '';
    el.inputGastoFecha.value = toDateKey(new Date());
  }
  
  abrirSheet(el.sheetGasto);
}

async function guardarGasto() {
  const categoria = document.querySelector('#chipsCategoriaGasto .chip.selected').dataset.valor;
  const valor = Number(el.inputGastoValor.value);
  const descripcion = el.inputGastoDescripcion.value.trim();
  const fecha = el.inputGastoFecha.value;
  
  if (!valor || !fecha) {
    mostrarToast('Completa valor y fecha');
    return;
  }
  
  try {
    if (deGastoEnEdicion) {
      await actualizarDocumento('gastos', deGastoEnEdicion.id, {
        categoria, valor, descripcion, fecha
      });
      mostrarToast('Gasto actualizado ✓');
    } else {
      await crearDocumento('gastos', {
        categoria, valor, descripcion, fecha
      });
      mostrarToast('Gasto registrado ✓');
    }
    cerrarSheet(el.sheetGasto);
  } catch (err) {
    console.error(err);
    mostrarToast('Error al guardar');
  }
}

async function eliminarGasto(id) {
  try {
    await eliminarDocumento('gastos', id);
    mostrarToast('Gasto eliminado');
  } catch (err) {
    console.error(err);
    mostrarToast('Error al eliminar');
  }
}

/* =========================================================================
   19. SHEETS - MARCAR PAGO
   ========================================================================= */

let deDeudaEnPago = null;

function abrirSheetPago(entrega) {
  deDeudaEnPago = entrega;
  el.pagoResumen.textContent = `${escapeHTML(entrega.nombre)} — ${formatCOP(entrega.valor)}`;
  document.querySelectorAll('#segmentoMedioPagoConfirmar .segmented__opt')[0].click();
  abrirSheet(el.sheetPago);
}

async function confirmarPago() {
  if (!deDeudaEnPago) return;
  
  const medioPago = document.querySelector('#segmentoMedioPagoConfirmar .segmented__opt.selected').dataset.valor;
  const hoy = toDateKey(new Date());
  
  try {
    await actualizarDocumento('entregas', deDeudaEnPago.id, {
      pagado: true,
      medioPago,
      fechaPago: hoy
    });
    mostrarToast('Pago confirmado ✓');
    cerrarSheet(el.sheetPago);
  } catch (err) {
    console.error(err);
    mostrarToast('Error al confirmar pago');
  }
}

/* =========================================================================
   20. MODALES - DETALLES
   ========================================================================= */

let deEntregaEnDetalle = null;

function abrirDetalleEntrega(entrega) {
  deEntregaEnDetalle = entrega;
  
  el.detalleContenido.innerHTML = `
    <div class="calc-item"><span>Nombre</span><strong>${escapeHTML(entrega.nombre)}</strong></div>
    <div class="calc-item"><span>Valor</span><strong>${formatCOP(entrega.valor)}</strong></div>
    <div class="calc-item"><span>Hora</span><strong>${formatHora12(entrega.hora)}</strong></div>
    <div class="calc-item"><span>Fecha</span><strong>${formatFechaCorta(entrega.fecha)}</strong></div>
    <div class="calc-item"><span>Tipo</span><strong>${entrega.tipo === 'contrata' ? 'Contrata' : 'Normal'}</strong></div>
    <div class="calc-item"><span>Estado</span><strong>${entrega.pagado ? 'Pagado' : 'Pendiente'}</strong></div>
    <div class="calc-item"><span>Medio de pago</span><strong>${entrega.medioPago === 'transferencia' ? 'Transferencia' : 'Efectivo'}</strong></div>
    ${entrega.descripcion ? `<div class="calc-item"><span>Observación</span><strong>${escapeHTML(entrega.descripcion)}</strong></div>` : ''}
  `;
  
  abrirModal(el.modalDetalle);
}

function abrirDetalleGasto(gasto) {
  const cat = CATEGORIAS_GASTO_DISPLAY[gasto.categoria] || { emoji: '📦', label: 'Otro' };
  
  el.detalleContenido.innerHTML = `
    <div class="calc-item"><span>Categoría</span><strong>${cat.emoji} ${cat.label}</strong></div>
    <div class="calc-item"><span>Valor</span><strong>${formatCOP(gasto.valor)}</strong></div>
    <div class="calc-item"><span>Fecha</span><strong>${formatFechaCorta(gasto.fecha)}</strong></div>
    ${gasto.descripcion ? `<div class="calc-item"><span>Descripción</span><strong>${escapeHTML(gasto.descripcion)}</strong></div>` : ''}
  `;
  
  el.btnEditarDesdeDetalle.textContent = 'Editar gasto';
  el.btnEditarDesdeDetalle.onclick = () => {
    cerrarModal(el.modalDetalle);
    abrirSheetGasto(gasto);
  };
  
  abrirModal(el.modalDetalle);
}

/* =========================================================================
   21. MODALES - CÁLCULO DEL DÍA
   ========================================================================= */

function abrirModalhCalculo() {
  const hoy = toDateKey(new Date());
  const entregas = entregasRealizadasEn(hoy);
  const pagos = entregasPagadasEl(hoy);
  const gastos = gastosEn(hoy);
  
  const ingresoTotal = totalDe(entregas);
  const gastosTotal = totalDe(gastos);
  const gananciaTotal = totalDe(pagos) - gastosTotal;
  
  el.calcTotal.textContent = formatCOP(ingresoTotal);
  el.calcGastos.textContent = formatCOP(gastosTotal);
  el.calcNeta.textContent = formatCOP(gananciaTotal);
  el.calcCantidad.textContent = entregas.length;
  el.calcPromedio.textContent = entregas.length > 0 ? formatCOP(Math.round(ingresoTotal / entregas.length)) : '$0';
  el.calcPrimero.textContent = entregas.length > 0 ? formatHora12(entregas[0].hora) : '—';
  el.calcUltimo.textContent = entregas.length > 0 ? formatHora12(entregas[entregas.length - 1].hora) : '—';
  
  abrirModal(el.modalCalculo);
}

/* =========================================================================
   22. MODALES - META SEMANAL
   ========================================================================= */

function abrirModalMeta() {
  el.inputMeta.value = AppState.meta;
  abrirModal(el.modalMeta);
}

async function guardarMeta() {
  const nuevaMeta = Number(el.inputMeta.value) || APP_CONFIG.META_SEMANAL_DEFAULT;
  AppState.meta = nuevaMeta;
  await guardarPerfilEnNube();
  renderTodo();
  cerrarModal(el.modalMeta);
  mostrarToast('Meta actualizada ✓');
}

/* =========================================================================
   23. MODALES - CONFIGURACIÓN DE CUENTA
   ========================================================================= */

function abrirModalCuenta() {
  el.inputCuentaNombre.value = auth.currentUser?.displayName || '';
  el.inputCuentaNuevoCorreo.value = '';
  el.inputCuentaPasswordCorreo.value = '';
  el.inputCuentaNuevaPassword.value = '';
  el.inputCuentaPasswordActual.value = '';
  el.cuentaMsg.textContent = '';
  abrirModal(el.modalCuenta);
}

async function reautenticar(passwordActual) {
  const credential = EmailAuthProvider.credential(auth.currentUser.email, passwordActual);
  return await reauthenticateWithCredential(auth.currentUser, credential);
}

async function guardarNombre() {
  const nombre = el.inputCuentaNombre.value.trim();
  if (!nombre) {
    mostrarMensajeCuenta('Escribe tu nombre', true);
    return;
  }
  try {
    await updateProfile(auth.currentUser, { displayName: nombre });
    mostrarMensajeCuenta('Nombre actualizado ✓', false);
    renderPantallaInicio();
  } catch (err) {
    mostrarMensajeCuenta(err.message, true);
  }
}

async function cambiarCorreo() {
  const nuevoCorreo = el.inputCuentaNuevoCorreo.value.trim();
  const password = el.inputCuentaPasswordCorreo.value;
  
  if (!nuevoCorreo || !password) {
    mostrarMensajeCuenta('Completa los campos', true);
    return;
  }
  
  try {
    await reautenticar(password);
    await updateEmail(auth.currentUser, nuevoCorreo);
    mostrarMensajeCuenta('Correo actualizado ✓', false);
    el.inputCuentaNuevoCorreo.value = '';
    el.inputCuentaPasswordCorreo.value = '';
  } catch (err) {
    mostrarMensajeCuenta(err.message, true);
  }
}

async function cambiarPassword() {
  const nuevaPassword = el.inputCuentaNuevaPassword.value;
  const passwordActual = el.inputCuentaPasswordActual.value;
  
  if (!nuevaPassword || !passwordActual) {
    mostrarMensajeCuenta('Completa los campos', true);
    return;
  }
  
  if (nuevaPassword.length < 6) {
    mostrarMensajeCuenta('La contraseña debe tener mínimo 6 caracteres', true);
    return;
  }
  
  try {
    await reautenticar(passwordActual);
    await updatePassword(auth.currentUser, nuevaPassword);
    mostrarMensajeCuenta('Contraseña actualizada ✓', false);
    el.inputCuentaNuevaPassword.value = '';
    el.inputCuentaPasswordActual.value = '';
  } catch (err) {
    mostrarMensajeCuenta(err.message, true);
  }
}

function mostrarMensajeCuenta(texto, esError) {
  el.cuentaMsg.textContent = texto;
  el.cuentaMsg.classList.toggle('is-error', esError);
}

/* =========================================================================
   24. MODALES - CONFIRMACIÓN
   ========================================================================= */

let callbackConfirm = null;

function abrirConfirmEliminacion(titulo, subtitulo, callback) {
  el.confirmTitulo.textContent = titulo;
  el.confirmSub.textContent = subtitulo;
  callbackConfirm = callback;
  abrirModal(el.modalConfirm);
}

async function confirmarEliminar() {
  if (callbackConfirm) {
    await callbackConfirm();
  }
  cerrarModal(el.modalConfirm);
}

/* =========================================================================
   25. UTILIDADES GENERALES - SHEETS Y MODALES
   ========================================================================= */

function abrirSheet(sheet) {
  el.sheetBackdrop.classList.add('show');
  sheet.classList.add('show');
}

function cerrarSheet(sheet) {
  el.sheetBackdrop.classList.remove('show');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('show'));
}

function abrirModal(modal) {
  const backdrop = modal === el.modalDetalle ? el.modalDetalleBackdrop :
                   modal === el.modalCalculo ? el.modalCalculoBackdrop :
                   modal === el.modalMeta ? el.modalMetaBackdrop :
                   modal === el.modalCuenta ? el.modalCuentaBackdrop :
                   modal === el.modalConfirm ? el.modalConfirmBackdrop : null;
  
  if (backdrop) backdrop.classList.add('show');
  modal.classList.add('show');
}

function cerrarModal(modal) {
  const backdrop = modal === el.modalDetalle ? el.modalDetalleBackdrop :
                   modal === el.modalCalculo ? el.modalCalculoBackdrop :
                   modal === el.modalMeta ? el.modalMetaBackdrop :
                   modal === el.modalCuenta ? el.modalCuentaBackdrop :
                   modal === el.modalConfirm ? el.modalConfirmBackdrop : null;
  
  if (backdrop) backdrop.classList.remove('show');
  modal.classList.remove('show');
}

function mostrarToast(texto) {
  el.toast.textContent = texto;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 3000);
}

function ocultarLoaderInicial() {
  setTimeout(() => {
    el.bootLoader.style.display = 'none';
  }, 300);
}

/* =========================================================================
   26. EVENTOS Y DELEGACIÓN
   ========================================================================= */

function bindearEventos() {
  // Auth
  el.btnAuthPrincipal.addEventListener('click', autenticar);
  el.btnAuthToggle.addEventListener('click', toggleModoAuth);
  el.authEmail.addEventListener('keypress', (e) => e.key === 'Enter' && autenticar());
  el.authPassword.addEventListener('keypress', (e) => e.key === 'Enter' && autenticar());
  
  // Botones principales
  el.btnAgregarDomicilio.addEventListener('click', () => abrirSheetDomicilio());
  el.btnCalcularDia.addEventListener('click', abrirModalhCalculo);
  el.btnAbrirMeta.addEventListener('click', abrirModalMeta);
  el.btnEditarMeta.addEventListener('click', abrirModalMeta);
  el.btnNuevoFrecuente.addEventListener('click', abrirSheetFrecuenteNuevo);
  el.btnIrAGastos.addEventListener('click', () => irAPantalla('gastos'));
  el.btnAgregarGasto.addEventListener('click', () => abrirSheetGasto());
  el.btnVolverGastos.addEventListener('click', () => irAPantalla('frecuentes'));
  el.btnEditarCuenta.addEventListener('click', abrirModalCuenta);
  el.btnCerrarSesion.addEventListener('click', async () => {
    await signOut(auth);
    detenerSuscripciones();
    irAPantalla('inicio');
  });
  
  // Sheets
  el.btnGuardarDomicilio.addEventListener('click', guardarDomicilio);
  el.btnCancelarDomicilio.addEventListener('click', () => cerrarSheet(el.sheetDomicilio));
  el.btnGuardarFrecuente.addEventListener('click', guardarFrecuente);
  el.btnCancelarFrecuente.addEventListener('click', () => cerrarSheet(el.sheetFrecuente));
  el.btnGuardarGasto.addEventListener('click', guardarGasto);
  el.btnCancelarGasto.addEventListener('click', () => cerrarSheet(el.sheetGasto));
  el.btnConfirmarPago.addEventListener('click', confirmarPago);
  el.btnCancelarPago.addEventListener('click', () => cerrarSheet(el.sheetPago));
  
  // Modales
  el.btnCerrarDetalle.addEventListener('click', () => cerrarModal(el.modalDetalle));
  el.btnEditarDesdeDetalle.addEventListener('click', () => {
    cerrarModal(el.modalDetalle);
    abrirSheetDomicilio(deEntregaEnDetalle);
  });
  el.btnCerrarCalculo.addEventListener('click', () => cerrarModal(el.modalCalculo));
  el.btnGuardarMeta.addEventListener('click', guardarMeta);
  el.btnCancelarMeta.addEventListener('click', () => cerrarModal(el.modalMeta));
  el.btnGuardarNombre.addEventListener('click', guardarNombre);
  el.btnCambiarCorreo.addEventListener('click', cambiarCorreo);
  el.btnCambiarPassword.addEventListener('click', cambiarPassword);
  el.btnCerrarModalCuenta.addEventListener('click', () => cerrarModal(el.modalCuenta));
  el.btnConfirmarEliminar.addEventListener('click', confirmarEliminar);
  el.btnCancelarConfirm.addEventListener('click', () => cerrarModal(el.modalConfirm));
  
  // Backdrop clicks
  el.sheetBackdrop.addEventListener('click', () => cerrarSheet(el.sheetDomicilio));
  el.modalDetalleBackdrop.addEventListener('click', () => cerrarModal(el.modalDetalle));
  el.modalCalculoBackdrop.addEventListener('click', () => cerrarModal(el.modalCalculo));
  el.modalMetaBackdrop.addEventListener('click', () => cerrarModal(el.modalMeta));
  el.modalCuentaBackdrop.addEventListener('click', () => cerrarModal(el.modalCuenta));
  el.modalConfirmBackdrop.addEventListener('click', () => cerrarModal(el.modalConfirm));
  
  // Tabbar
  el.tabbar.forEach(btn => {
    btn.addEventListener('click', () => {
      const pantalla = btn.dataset.screen;
      irAPantalla(pantalla);
    });
  });
  
  // Filtros
  el.filtrosRegistros.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) {
      document.querySelectorAll('#filtrosRegistros .chip').forEach(c => c.classList.remove('selected'));
      e.target.classList.add('selected');
      AppState.registrosView.rango = e.target.dataset.rango;
      cargarRegistrosInicial();
    }
  });
  
  el.filtrosGastos.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) {
      document.querySelectorAll('#filtrosGastos .chip').forEach(c => c.classList.remove('selected'));
      e.target.classList.add('selected');
      AppState.gastosVista.rango = e.target.dataset.rango;
      cargarGastosVista();
    }
  });
  
  // Segmentados
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('segmented__opt')) {
      const segmented = e.target.parentElement;
      segmented.querySelectorAll('.segmented__opt').forEach(opt => opt.classList.remove('selected'));
      e.target.classList.add('selected');
      
      // Mostrar/ocultar medioPago según pagado
      if (segmented.id === 'segmentoPagado') {
        const pagado = e.target.dataset.valor === 'si';
        el.bloqueMedioPago.style.display = pagado ? 'block' : 'none';
        el.campoDescripcion.style.display = pagado ? 'none' : 'block';
      }
    }
  });
  
  // Cargar más registros
  el.btnCargarMasRegistros.addEventListener('click', cargarMasRegistros);
  
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
}

/* =========================================================================
   27. INICIALIZACIÓN
   ========================================================================= */

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    el.authScreen.style.display = 'none';
    el.appContainer.style.display = 'flex';
    
    iniciarSuscripciones(user.uid);
    bindearEventos();
    irAPantalla('inicio');
  } else {
    currentUid = null;
    el.authScreen.style.display = 'flex';
    el.appContainer.style.display = 'none';
    
    modoRegistro = false;
    el.campoAuthNombre.style.display = 'none';
    el.btnAuthPrincipal.textContent = 'Iniciar sesión';
    el.btnAuthToggle.textContent = '¿No tienes cuenta? Crear una';
    el.authError.textContent = '';
    el.authEmail.value = '';
    el.authPassword.value = '';
    el.authNombre.value = '';
    
    if (!document.querySelector('.btn-primary').onclick) {
      bindearEventos();
    }
  }
});
