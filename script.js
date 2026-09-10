/* =========================================================================
   DOMI — Control de domicilios para repartidores
   Punto de entrada (orquestador). Carga los módulos, ata el arranque de
   sesión al estado y arranca los relojes y el service worker.

   Módulos (js/):
     config      constantes            utils       funciones puras
     firebase    SDK + init + refs     dom         cache de #ids + UI
     state       estado en memoria     calculos    derivados del estado
     data        Firestore + tiempo real           render-bus  puente de repintado
     render      todas las pantallas   sheets      hojas y modales
     navigation  router de pantallas   auth        login + cuenta

   Arquitectura de datos:
     usuarios/{uid}                → documento pequeño: frecuentes + meta
     usuarios/{uid}/entregas/{id}  → un documento por domicilio
     usuarios/{uid}/gastos/{id}    → un documento por gasto
   ========================================================================= */

import { CLAVE_ULTIMA_PESTANA, META_SEMANAL_DEFAULT } from './js/config.js';
import { toDateKey } from './js/utils.js';
import { auth, onAuthStateChanged } from './js/firebase.js';
import { el, ocultarLoaderInicial } from './js/dom.js';
import {
  state, registros, historialSemanas,
  setCurrentUid, setMigracionHecha, limpiarGruposEntregasSemana
} from './js/state.js';
import { solicitarRenderTodo } from './js/render-bus.js';
import { iniciarSuscripciones, detenerSuscripciones } from './js/data.js';
import './js/render.js';       // registra renderTodo y ata los filtros de Registros/Gastos
import './js/sheets.js';       // ata todos los botones de hojas y modales
import './js/clientes.js';     // sección "Clientes" en la pestaña Más
import './js/actualizacion.js'; // registro del SW + aviso de nueva versión
import './js/pull-refresh.js';  // arrastrar hacia abajo para recargar
import { irAPestana } from './js/navigation.js';
import { renderSaludo, resetAuthUI } from './js/auth.js';

/* ==================== Arranque / cierre de sesión ======================= */

onAuthStateChanged(auth, (user) => {
  if (user) {
    setCurrentUid(user.uid);
    el.authScreen.style.display = 'none';
    el.appContainer.style.display = 'flex';
    el.cuentaEmail.textContent = user.email;
    renderSaludo(user);
    el.authNombre.value = ''; el.authEmail.value = ''; el.authPassword.value = '';
    iniciarSuscripciones(user.uid);
    irAPestana(localStorage.getItem(CLAVE_ULTIMA_PESTANA) || 'inicio');
  } else {
    setCurrentUid(null);
    setMigracionHecha(false);
    detenerSuscripciones();
    limpiarGruposEntregasSemana();
    state.entregas = []; state.gastos = []; state.deudas = []; state.frecuentes = []; state.clientes = []; state.meta = META_SEMANAL_DEFAULT;
    registros.items = []; registros.cursor = null; registros.hasMore = true;
    historialSemanas.cargado = false; historialSemanas.semanas = [];
    el.appContainer.style.display = 'none';
    el.authScreen.style.display = 'flex';
    ocultarLoaderInicial();
    resetAuthUI();
  }
});

/* ==================== Relojes y red de seguridad ======================= */

// Si cambia el día mientras la app está abierta, repintar para que "hoy" y la
// semana se muevan solos.
let ultimaFechaKey = toDateKey(new Date());
setInterval(() => {
  const actual = toDateKey(new Date());
  if (actual !== ultimaFechaKey) { ultimaFechaKey = actual; solicitarRenderTodo(); }
}, 60 * 1000);

// Si tras 8s no ha llegado ningún dato (ej. sin conexión la primera vez),
// quitamos igual el loader para no dejar a la persona mirando una pantalla
// congelada.
setTimeout(ocultarLoaderInicial, 8000);
