/* =========================================================================
   DOMI — Cobros
   Pantalla "Cobros": agrupa los domicilios sin pagar por cliente y permite
   registrar el pago marcando qué domicilios pagó (todos por defecto).
   El clienteId viene de la entrega (v1.9.4); si no tiene, se agrupa por el
   nombre escrito, para seguir funcionando con los datos viejos.
   ========================================================================= */

import {
  $, el, conProteccionDoble, mostrarSheet, ocultarSheet, mostrarToast
} from './dom.js';
import { state } from './state.js';
import { formatCOP, formatFechaCorta, escapeHTML, toDateKey } from './utils.js';
import { totalDe } from './calculos.js';
import { actualizarDocumento } from './data.js';
import { solicitarRenderTodo, registrarRender } from './render-bus.js';

/* ------------------------------- Agrupar ------------------------------- */

function gruposDeCobro() {
  const grupos = new Map();
  state.deudas.forEach(d => {
    const cli = d.clienteId ? state.clientes.find(c => c.id === d.clienteId) : null;
    const key = cli ? 'c:' + cli.id : 'n:' + d.nombre;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        clienteId: cli ? cli.id : null,
        nombre: cli ? cli.nombre : d.nombre,
        telefono: cli ? (cli.telefono || '') : '',
        registrado: !!cli,
        deudas: []
      });
    }
    grupos.get(key).deudas.push(d);
  });
  return [...grupos.values()]
    .map(g => ({ ...g, total: totalDe(g.deudas) }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------- Render ------------------------------- */

export function renderCobros() {
  const grupos = gruposDeCobro();
  el.totalDebenHeader.textContent = formatCOP(totalDe(state.deudas));
  el.badgeDeben.textContent = grupos.length;

  el.listaDeben.innerHTML = '';
  grupos.forEach(g => {
    const li = document.createElement('li');
    li.className = 'entrega-item';
    li.innerHTML = `
      <div class="entrega-item__icon">${g.registrado ? '👤' : '🛵'}</div>
      <div class="entrega-item__info">
        <p class="entrega-item__nombre">${escapeHTML(g.nombre)}</p>
        <p class="entrega-item__hora">${g.deudas.length} domicilio${g.deudas.length === 1 ? '' : 's'} pendiente${g.deudas.length === 1 ? '' : 's'}</p>
      </div>
      <div class="entrega-item__valor">${formatCOP(g.total)}</div>
    `;
    li.addEventListener('click', () => abrirSheetCobro(g));
    el.listaDeben.appendChild(li);
  });
}
registrarRender(renderCobros);

/* --------------------------- Sheet de cobro --------------------------- */

let grupoActual = null;
let seleccionados = new Set();
let medioPagoCobro = 'efectivo';

function seleccionarSegmentoCobro(valor) {
  document.querySelectorAll('#segmentoMedioPagoCobro .segmented__opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.valor === valor);
  });
  return valor;
}
document.querySelectorAll('#segmentoMedioPagoCobro .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => { medioPagoCobro = seleccionarSegmentoCobro(btn.dataset.valor); });
});

function actualizarTotalCobro() {
  const total = grupoActual.deudas
    .filter(d => seleccionados.has(d.id))
    .reduce((s, d) => s + Number(d.valor), 0);
  el.cobroTotal.textContent = formatCOP(total);
}

function abrirSheetCobro(grupo) {
  grupoActual = grupo;
  // Domicilios ordenados del más antiguo al más nuevo.
  grupoActual.deudas = [...grupo.deudas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  seleccionados = new Set(grupoActual.deudas.map(d => d.id)); // todos por defecto
  medioPagoCobro = seleccionarSegmentoCobro('efectivo');

  el.cobroResumen.textContent = `${grupo.nombre} · debe ${formatCOP(grupo.total)}`;

  el.cobroDomicilios.innerHTML = '';
  grupoActual.deudas.forEach(d => {
    const item = document.createElement('li');
    item.className = 'cobro-item selected';
    item.innerHTML = `
      <span class="cobro-item__check">✓</span>
      <span class="cobro-item__info">${escapeHTML(d.nombre)} · ${formatFechaCorta(d.fecha)}</span>
      <span class="cobro-item__valor">${formatCOP(d.valor)}</span>
    `;
    item.addEventListener('click', () => {
      if (seleccionados.has(d.id)) { seleccionados.delete(d.id); item.classList.remove('selected'); }
      else { seleccionados.add(d.id); item.classList.add('selected'); }
      actualizarTotalCobro();
    });
    el.cobroDomicilios.appendChild(item);
  });

  actualizarTotalCobro();
  mostrarSheet('sheetCobro', 'sheetBackdropCobro');
}

$('#btnCancelarCobro').addEventListener('click', () => ocultarSheet('sheetCobro', 'sheetBackdropCobro'));
$('#sheetBackdropCobro').addEventListener('click', () => ocultarSheet('sheetCobro', 'sheetBackdropCobro'));

$('#btnConfirmarCobro').addEventListener('click', () => conProteccionDoble($('#btnConfirmarCobro'), async () => {
  if (!grupoActual) return;
  const ids = grupoActual.deudas.filter(d => seleccionados.has(d.id)).map(d => d.id);
  if (ids.length === 0) { mostrarToast('Marca al menos un domicilio'); return; }

  const hoyKey = toDateKey(new Date());
  try {
    for (const id of ids) {
      await actualizarDocumento('entregas', id, { pagado: true, medioPago: medioPagoCobro, fechaPago: hoyKey });
    }
    ocultarSheet('sheetCobro', 'sheetBackdropCobro');
    mostrarToast(`Pago registrado (${ids.length} domicilio${ids.length === 1 ? '' : 's'}) 🎉`);
    grupoActual = null;
    solicitarRenderTodo();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo registrar el pago');
  }
}, 'Registrando…'));
