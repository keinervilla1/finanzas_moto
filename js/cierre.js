/* =========================================================================
   DOMI — Cierre del día
   Hoja que responde "¿cuánta plata debería tener en el bolsillo?" para hoy o
   cualquier día anterior (flechas ‹ ›):

   - Lo que trabajaste: domicilios HECHOS ese día (por `fecha`).
   - Lo que te entró: domicilios PAGADOS ese día (por `fechaPago`), separados
     en efectivo y transferencia. Incluye deudas viejas cobradas ese día.
   - Te quedaron debiendo: hechos ese día y sin pagar al cierre de ese día.
   - Gastos del día (por medio de pago; sin campo = efectivo).
   - Efectivo que deberías tener = base + efectivo que entró − gastos en efectivo.

   Todo esto SOLO LEE. La única escritura es la base del día, cuando la pones
   (usuarios/{uid}.basesEfectivo.{fecha}, ver data.js).
   Días de esta semana: datos ya en memoria (cero lecturas). Días anteriores:
   3 consultas pequeñas de solo lectura.
   ========================================================================= */

import { $, el, mostrarSheet, ocultarSheet, mostrarToast } from './dom.js';
import { state, currentUid } from './state.js';
import { DIAS_SEMANA } from './config.js';
import { formatCOP, formatHora12, formatFechaCorta, toDateKey, getMonday, addDays } from './utils.js';
import { totalDe, ordenCronologico } from './calculos.js';
import { coleccion, getDocs, getDocsFromServer, query, where } from './firebase.js';
import { mapDoc, guardarBaseEfectivo } from './data.js';
import { registrarRender } from './render-bus.js';

let diaKey = null;        // "AAAA-MM-DD" que se está viendo
let consultado = null;    // { key, entregasDia, pagadasDia, gastosDia } de un día fuera de memoria
let pedidoActual = 0;     // para descartar respuestas viejas si se cambia de día rápido
let editandoBase = false;

const abierta = () => document.getElementById('sheetCierre').classList.contains('show');
const fechaDe = (key) => new Date(key + 'T00:00:00');
const esTransferencia = (x) => x.medioPago === 'transferencia'; // sin campo = efectivo
const dinero = (n) => (n < 0 ? '−' + formatCOP(-n) : formatCOP(n));

/* ============================== Datos =================================== */

/** state.entregas / state.gastos traen la semana actual en tiempo real. */
function estaEnMemoria(key) {
  const hoy = new Date();
  return key >= toDateKey(getMonday(hoy)) && key <= toDateKey(hoy);
}

async function datosDelDia(key) {
  if (estaEnMemoria(key)) {
    return {
      memoria: true,
      entregasDia: state.entregas.filter(e => e.fecha === key),
      pagadasDia: state.entregas.filter(e => e.pagado && e.fechaPago === key),
      gastosDia: state.gastos.filter(g => g.fecha === key)
    };
  }
  if (consultado && consultado.key === key) return consultado;
  const consultas = [
    query(coleccion(currentUid, 'entregas'), where('fecha', '==', key)),
    query(coleccion(currentUid, 'entregas'), where('pagado', '==', true), where('fechaPago', '==', key)),
    query(coleccion(currentUid, 'gastos'), where('fecha', '==', key))
  ];
  // Primero el servidor. Si no responde, la copia del teléfono, pero avisando
  // que puede estar incompleta (para no mostrar un "$0" engañoso).
  let incompleto = false;
  let snaps;
  try {
    snaps = await Promise.all(consultas.map(q => getDocsFromServer(q)));
  } catch (err) {
    console.warn('Cierre: sin servidor, se usa la copia local', err && err.code);
    incompleto = true;
    snaps = await Promise.all(consultas.map(q => getDocs(q)));
  }
  const [hechos, pagados, gastos] = snaps;
  consultado = {
    key, memoria: false, incompleto,
    entregasDia: hechos.docs.map(mapDoc),
    pagadasDia: pagados.docs.map(mapDoc),
    gastosDia: gastos.docs.map(mapDoc)
  };
  return consultado;
}

export function calcularCierre(key, { entregasDia, pagadasDia, gastosDia }, bases) {
  const trabajadas = ordenCronologico(entregasDia);
  const pendientes = trabajadas.filter(e => !e.pagado || (e.fechaPago && e.fechaPago > key));
  const entroEfectivo = totalDe(pagadasDia.filter(e => !esTransferencia(e)));
  const entroTransferencia = totalDe(pagadasDia.filter(esTransferencia));
  const gastosEfectivo = totalDe(gastosDia.filter(g => !esTransferencia(g)));
  const gastosTransferencia = totalDe(gastosDia.filter(esTransferencia));
  const base = Number(bases && bases[key]) || 0;
  return {
    cantidad: trabajadas.length,
    totalTrabajado: totalDe(trabajadas),
    primero: trabajadas.length ? trabajadas[0].hora : null,
    ultimo: trabajadas.length ? trabajadas[trabajadas.length - 1].hora : null,
    entroEfectivo, entroTransferencia,
    entroTotal: entroEfectivo + entroTransferencia,
    deudasViejas: totalDe(pagadasDia.filter(e => (e.fecha || '') < key)),
    pendiente: totalDe(pendientes), cantidadPendiente: pendientes.length,
    gastosEfectivo, gastosTransferencia,
    gastosTotal: gastosEfectivo + gastosTransferencia,
    base,
    efectivoEsperado: base + entroEfectivo - gastosEfectivo
  };
}

/** La base más reciente (> 0) de un día anterior, para el atajo "Igual que la última". */
function ultimaBaseAntesDe(key) {
  const anteriores = Object.keys(state.basesEfectivo || {})
    .filter(k => k < key && Number(state.basesEfectivo[k]) > 0)
    .sort();
  return anteriores.length ? Number(state.basesEfectivo[anteriores[anteriores.length - 1]]) : 0;
}

/* ============================== Pintar ================================== */

function tituloDia(key) {
  const hoy = toDateKey(new Date());
  const d = fechaDe(key);
  const nombre = DIAS_SEMANA[(d.getDay() + 6) % 7].toLowerCase();
  const prefijo = key === hoy ? 'Hoy · ' : key === toDateKey(addDays(new Date(), -1)) ? 'Ayer · ' : '';
  return `${prefijo}${nombre} ${formatFechaCorta(key)}`;
}

const fila = (etiqueta, valor, clase = '') =>
  `<div class="calc-item ${clase}"><span>${etiqueta}</span><strong>${valor}</strong></div>`;

function htmlBase(c) {
  if (editandoBase) {
    const ultima = ultimaBaseAntesDe(diaKey);
    return `
      <div class="cierre-base cierre-base--editando">
        <label class="field" style="margin-bottom:10px">
          <span>¿Con cuánto efectivo saliste?</span>
          <input type="number" id="inputBaseCierre" inputmode="numeric" placeholder="0" value="${c.base || ''}">
        </label>
        ${ultima > 0 ? `<button type="button" class="chip" id="btnBaseUltima">Igual que la última (${formatCOP(ultima)})</button>` : ''}
        <div class="sheet__actions" style="margin-top:12px">
          <button type="button" class="btn-ghost" id="btnBaseCancelar">Cancelar</button>
          <button type="button" class="btn-primary" id="btnBaseGuardar">Guardar base</button>
        </div>
      </div>`;
  }
  return `
    <button type="button" class="cierre-base" id="btnBaseEditar">
      <span>Base con la que saliste</span>
      <strong>${c.base > 0 ? formatCOP(c.base) : 'Sin poner'}</strong>
      <span class="cierre-base__accion">${c.base > 0 ? 'Cambiar' : 'Poner'}</span>
    </button>`;
}

function pintarCierre(c, incompleto) {
  const avisoOffline = incompleto
    ? '<p class="hint cierre-aviso">Sin conexión: puede faltar información de este día.</p>' : '';
  el.cierreContenido.innerHTML = `
    ${avisoOffline}
    <div class="cierre-total">
      <p class="cierre-total__label">Efectivo que deberías tener</p>
      <p class="cierre-total__valor">${dinero(c.efectivoEsperado)}</p>
      <p class="cierre-total__formula">Base ${formatCOP(c.base)} + entró ${formatCOP(c.entroEfectivo)} − gastos en efectivo ${formatCOP(c.gastosEfectivo)}</p>
    </div>
    ${htmlBase(c)}

    <p class="settings-group__label cierre-seccion">Lo que te entró</p>
    <div class="calc-grid">
      ${fila('💵 Efectivo', formatCOP(c.entroEfectivo))}
      ${fila('💳 Transferencia', formatCOP(c.entroTransferencia))}
      ${fila('Total', formatCOP(c.entroTotal), 'calc-item--fuerte')}
    </div>
    ${c.deudasViejas > 0 ? `<p class="hint cierre-nota">Incluye ${formatCOP(c.deudasViejas)} de deudas de otros días cobradas este día.</p>` : ''}
    <p class="hint cierre-nota">Los abonos se cuentan el día en que se usan para pagar domicilios, no el día en que te los dieron.</p>

    <p class="settings-group__label cierre-seccion">Lo que trabajaste</p>
    <div class="calc-grid">
      ${fila('Domicilios', c.cantidad)}
      ${fila('Valor total', formatCOP(c.totalTrabajado))}
      ${fila('Promedio', formatCOP(c.cantidad ? c.totalTrabajado / c.cantidad : 0))}
      ${fila('Primer domicilio', c.primero ? formatHora12(c.primero) : '—')}
      ${fila('Último domicilio', c.ultimo ? formatHora12(c.ultimo) : '—')}
    </div>

    <div class="calc-grid cierre-grupo">
      ${fila(`Te quedaron debiendo${c.cantidadPendiente ? ` (${c.cantidadPendiente})` : ''}`, formatCOP(c.pendiente), c.pendiente > 0 ? 'calc-item--alerta' : '')}
      ${fila('Gastos', formatCOP(c.gastosTotal))}
      ${c.gastosTransferencia > 0 ? fila('&nbsp;&nbsp;· en efectivo / transferencia', `${formatCOP(c.gastosEfectivo)} / ${formatCOP(c.gastosTransferencia)}`) : ''}
      ${fila('Ganancia neta (entró − gastos)', dinero(c.entroTotal - c.gastosTotal), 'calc-item--fuerte')}
    </div>
  `;
  atarBase();
}

async function pintar() {
  if (!diaKey || !currentUid) return;
  el.cierreFecha.textContent = tituloDia(diaKey);
  el.btnCierreSiguiente.disabled = diaKey >= toDateKey(new Date());
  const pedido = ++pedidoActual;
  const necesitaConsulta = !estaEnMemoria(diaKey) && !(consultado && consultado.key === diaKey);
  if (necesitaConsulta) el.cierreContenido.innerHTML = '<p class="empty-state" style="display:block">Cargando…</p>';
  try {
    const datos = await datosDelDia(diaKey);
    if (pedido !== pedidoActual) return; // ya se cambió de día
    pintarCierre(calcularCierre(diaKey, datos, state.basesEfectivo), !!datos.incompleto);
  } catch (err) {
    console.error(err);
    if (pedido !== pedidoActual) return;
    el.cierreContenido.innerHTML = '<p class="empty-state" style="display:block">No se pudo cargar este día. Revisa tu conexión.</p>';
  }
}

/* =============================== Base =================================== */

function atarBase() {
  const editar = $('#btnBaseEditar');
  if (editar) editar.addEventListener('click', () => { editandoBase = true; pintar().then(() => $('#inputBaseCierre')?.focus()); });
  if (!editandoBase) return;
  const input = $('#inputBaseCierre');
  $('#btnBaseUltima')?.addEventListener('click', () => { input.value = ultimaBaseAntesDe(diaKey); });
  $('#btnBaseCancelar').addEventListener('click', () => { editandoBase = false; pintar(); });
  $('#btnBaseGuardar').addEventListener('click', () => {
    const valor = Math.round(Number(input.value) || 0);
    if (valor < 0 || valor > 100000000) { mostrarToast('Ingresa una base válida'); return; }
    const actual = Number(state.basesEfectivo[diaKey]) || 0;
    if (valor !== actual) {
      // Se refleja de una vez en pantalla; Firestore lo confirma por detrás.
      state.basesEfectivo = { ...state.basesEfectivo, [diaKey]: valor };
      guardarBaseEfectivo(diaKey, valor);
      mostrarToast(valor > 0 ? `Base guardada: ${formatCOP(valor)}` : 'Base quitada');
    }
    editandoBase = false;
    pintar();
  });
}

/* ============================== Abrir / mover =========================== */

function irADia(key) {
  diaKey = key;
  editandoBase = false;
  pintar();
}

$('#btnCalcularDia').addEventListener('click', () => {
  consultado = null; // datos de días viejos: frescos cada vez que se abre
  irADia(toDateKey(new Date()));
  mostrarSheet('sheetCierre', 'sheetBackdropCierre');
});
el.btnCierreAnterior.addEventListener('click', () => irADia(toDateKey(addDays(fechaDe(diaKey), -1))));
el.btnCierreSiguiente.addEventListener('click', () => {
  if (diaKey < toDateKey(new Date())) irADia(toDateKey(addDays(fechaDe(diaKey), 1)));
});
function cerrar() { ocultarSheet('sheetCierre', 'sheetBackdropCierre'); editandoBase = false; consultado = null; }
$('#btnCerrarCierre').addEventListener('click', cerrar);
$('#sheetBackdropCierre').addEventListener('click', cerrar);

// Si llegan datos nuevos (un domicilio, un pago, la base desde otro
// teléfono) con la hoja abierta, se actualiza sola. No mientras escribes la base.
registrarRender(() => { if (abierta() && !editandoBase) pintar(); });
