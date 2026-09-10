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
        abono: cli ? (Number(cli.abono) || 0) : 0,
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
    const sub = g.abono > 0
      ? `${g.deudas.length} domicilio${g.deudas.length === 1 ? '' : 's'} · ${formatCOP(g.abono)} de abono`
      : `${g.deudas.length} domicilio${g.deudas.length === 1 ? '' : 's'} pendiente${g.deudas.length === 1 ? '' : 's'}`;
    li.innerHTML = `
      <div class="entrega-item__icon">${g.registrado ? '👤' : '🛵'}</div>
      <div class="entrega-item__info">
        <p class="entrega-item__nombre">${escapeHTML(g.nombre)}</p>
        <p class="entrega-item__hora">${sub}</p>
      </div>
      <div class="entrega-item__valor">${formatCOP(g.total)}</div>
    `;
    li.addEventListener('click', () => abrirSheetCobro(g));
    el.listaDeben.appendChild(li);
  });
}
registrarRender(renderCobros);

/* --------------------------- Sheet de cobro ---------------------------
   Dos formas de registrar el pago:
   - Marcando qué domicilios pagó (todos por defecto).
   - Escribiendo un monto: salda del más antiguo al más nuevo hasta donde
     alcance. Lo que sobre (y no cubra otro domicilio) queda como "abono" del
     cliente registrado; para grupos de nombre libre solo se avisa. */

let grupoActual = null;
let seleccionados = new Set();
let medioPagoCobro = 'efectivo';
let modoMonto = false; // true = manda el campo de monto; false = manda el checklist

function seleccionarSegmentoCobro(valor) {
  document.querySelectorAll('#segmentoMedioPagoCobro .segmented__opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.valor === valor);
  });
  return valor;
}
document.querySelectorAll('#segmentoMedioPagoCobro .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => { medioPagoCobro = seleccionarSegmentoCobro(btn.dataset.valor); });
});

function sumaSeleccionada() {
  return grupoActual.deudas
    .filter(d => seleccionados.has(d.id))
    .reduce((s, d) => s + Number(d.valor), 0);
}

/** Con un monto dado, marca del más antiguo al más nuevo lo que quede cubierto
 *  por completo. Devuelve el sobrante (dinero que no alcanzó para el siguiente). */
function aplicarMonto(monto) {
  let restante = monto;
  seleccionados = new Set();
  for (const d of grupoActual.deudas) {
    const v = Number(d.valor);
    if (restante >= v) { seleccionados.add(d.id); restante -= v; }
    else break;
  }
  return restante;
}

function actualizarVista() {
  // Reflejar la selección en el checklist.
  el.cobroDomicilios.querySelectorAll('.cobro-item').forEach(item => {
    item.classList.toggle('selected', seleccionados.has(item.dataset.id));
  });

  const cubierto = sumaSeleccionada();
  const monto = modoMonto ? (Number(el.inputCobroMonto.value) || 0) : cubierto;
  el.cobroTotal.textContent = formatCOP(Math.min(monto, grupoActual.total));

  const sobrante = modoMonto ? Math.max(0, monto - cubierto) : 0;
  let nota = '';
  if (modoMonto && monto > grupoActual.total) {
    nota = `El monto supera lo que debe (${formatCOP(grupoActual.total)}).`;
  } else if (sobrante > 0 && grupoActual.registrado) {
    nota = `Quedan ${formatCOP(sobrante)} de abono para el próximo domicilio.`;
  } else if (sobrante > 0) {
    nota = `Sobran ${formatCOP(sobrante)} que no alcanzan para otro domicilio (no se guardan).`;
  } else if (grupoActual.abono > 0) {
    nota = `Incluye ${formatCOP(grupoActual.abono)} de abono anterior.`;
  }
  el.cobroNota.textContent = nota;
  el.cobroNota.style.display = nota ? 'block' : 'none';
}

function abrirSheetCobro(grupo) {
  grupoActual = grupo;
  grupoActual.deudas = [...grupo.deudas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  medioPagoCobro = seleccionarSegmentoCobro('efectivo');
  el.cobroResumen.textContent = `${grupo.nombre} · debe ${formatCOP(grupo.total)}`;

  // Checklist.
  el.cobroDomicilios.innerHTML = '';
  grupoActual.deudas.forEach(d => {
    const item = document.createElement('li');
    item.className = 'cobro-item';
    item.dataset.id = d.id;
    item.innerHTML = `
      <span class="cobro-item__check">✓</span>
      <span class="cobro-item__info">${escapeHTML(d.nombre)} · ${formatFechaCorta(d.fecha)}</span>
      <span class="cobro-item__valor">${formatCOP(d.valor)}</span>
    `;
    item.addEventListener('click', () => {
      // Tocar el checklist vuelve al modo manual.
      if (modoMonto) { modoMonto = false; el.inputCobroMonto.value = ''; }
      if (seleccionados.has(d.id)) seleccionados.delete(d.id);
      else seleccionados.add(d.id);
      actualizarVista();
    });
    el.cobroDomicilios.appendChild(item);
  });

  // Si el cliente ya tenía un abono, arrancamos en modo monto con ese valor.
  if (grupoActual.abono > 0) {
    modoMonto = true;
    el.inputCobroMonto.value = grupoActual.abono;
    aplicarMonto(grupoActual.abono);
  } else {
    modoMonto = false;
    el.inputCobroMonto.value = '';
    seleccionados = new Set(grupoActual.deudas.map(d => d.id)); // todos por defecto
  }

  actualizarVista();
  mostrarSheet('sheetCobro', 'sheetBackdropCobro');
}

el.inputCobroMonto.addEventListener('input', () => {
  if (!grupoActual) return;
  const m = Number(el.inputCobroMonto.value) || 0;
  if (m > 0) {
    modoMonto = true;
    aplicarMonto(m);
  } else {
    modoMonto = false;
    seleccionados = new Set(grupoActual.deudas.map(d => d.id));
  }
  actualizarVista();
});

$('#btnCancelarCobro').addEventListener('click', () => ocultarSheet('sheetCobro', 'sheetBackdropCobro'));
$('#sheetBackdropCobro').addEventListener('click', () => ocultarSheet('sheetCobro', 'sheetBackdropCobro'));

$('#btnConfirmarCobro').addEventListener('click', () => conProteccionDoble($('#btnConfirmarCobro'), async () => {
  if (!grupoActual) return;

  const monto = modoMonto ? (Number(el.inputCobroMonto.value) || 0) : 0;
  const ids = grupoActual.deudas.filter(d => seleccionados.has(d.id)).map(d => d.id);
  const cubierto = sumaSeleccionada();
  const sobrante = modoMonto ? Math.max(0, Math.min(monto, grupoActual.total) - cubierto) : 0;

  if (!modoMonto && ids.length === 0) {
    mostrarToast('Marca al menos un domicilio o escribe un monto');
    return;
  }
  if (modoMonto && monto <= 0) { mostrarToast('Escribe cuánto te dio'); return; }

  const hoyKey = toDateKey(new Date());
  try {
    for (const id of ids) {
      await actualizarDocumento('entregas', id, { pagado: true, medioPago: medioPagoCobro, fechaPago: hoyKey });
    }

    if (grupoActual.registrado) {
      const nuevoAbono = modoMonto ? sobrante : grupoActual.abono;
      if (nuevoAbono !== grupoActual.abono) {
        await actualizarDocumento('clientes', grupoActual.clienteId, { abono: nuevoAbono });
      }
    }

    ocultarSheet('sheetCobro', 'sheetBackdropCobro');
    if (ids.length > 0) {
      mostrarToast(`Pago registrado (${ids.length} domicilio${ids.length === 1 ? '' : 's'}) 🎉`);
    } else {
      mostrarToast(`Guardado como abono: ${formatCOP(sobrante)}`);
    }
    if (sobrante > 0 && !grupoActual.registrado) {
      setTimeout(() => mostrarToast(`Ojo: ${formatCOP(sobrante)} quedaron sin aplicar`), 2600);
    }
    grupoActual = null;
    solicitarRenderTodo();
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo registrar el pago');
  }
}, 'Registrando…'));
