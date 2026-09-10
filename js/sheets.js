/* =========================================================================
   DOMI — Hojas inferiores y modales
   Abrir/cerrar y guardar: domicilio, frecuente, gasto, marcar pago, detalle,
   cálculo del día, meta y confirmación genérica. Toda la interacción de
   formularios emergentes vive aquí.
   ========================================================================= */

import {
  $, el, conProteccionDoble,
  mostrarSheet, ocultarSheet, mostrarModal, ocultarModal, mostrarToast
} from './dom.js';
import { formatCOP, formatHora12, formatFechaCorta, toDateKey, escapeHTML, uid } from './utils.js';
import { entregasRealizadasEn, entregasPagadasEl, gastosDe, totalDe } from './calculos.js';
import { state } from './state.js';
import { crearDocumento, actualizarDocumento, guardarPerfilEnNube } from './data.js';
import { solicitarRenderTodo } from './render-bus.js';
import { cargarGastosVista } from './render.js';
import { irAPestana } from './navigation.js';

/* Estado de edición / selección en curso (solo para estos formularios). */
let editingEntregaId = null;
let editingEntregaOriginal = null;
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
let medioPagoConfirmarSeleccionado = 'efectivo';

/* ==================== SHEET: AGREGAR / EDITAR DOMICILIO =================== */

function seleccionarSegmento(contenedorId, valor) {
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
  editingEntregaOriginal = entregaExistente || null;
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
    el.inputHora.value = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
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

$('#btnGuardarDomicilio').addEventListener('click', () => conProteccionDoble($('#btnGuardarDomicilio'), async () => {
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
      // Si ya estaba pagado y sigue pagado, conservamos el día real del pago:
      // corregir el nombre o el valor no debe mover el ingreso a la semana de hoy.
      if (pagado && editingEntregaOriginal && editingEntregaOriginal.pagado && editingEntregaOriginal.fechaPago) {
        datos.fechaPago = editingEntregaOriginal.fechaPago;
      }
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
}));

function animarHero() {
  el.gananciaHoy.classList.remove('bump');
  void el.gananciaHoy.offsetWidth;
  el.gananciaHoy.classList.add('bump');
}

/* ==================== SHEET: NUEVO / EDITAR FRECUENTE =================== */

export function abrirSheetFrecuente(frecuenteExistente) {
  editingFrecuenteId = frecuenteExistente ? frecuenteExistente.id : null;
  el.sheetFrecuenteTitulo.textContent = frecuenteExistente ? 'Editar frecuente' : 'Nuevo domicilio frecuente';
  el.inputFrecNombre.value = frecuenteExistente ? frecuenteExistente.nombre : '';
  el.inputFrecValor.value = frecuenteExistente ? frecuenteExistente.valor : '';
  mostrarSheet('sheetFrecuente', 'sheetBackdropFrecuente');
}
$('#btnNuevoFrecuente').addEventListener('click', () => abrirSheetFrecuente(null));
$('#btnCancelarFrecuente').addEventListener('click', () => ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente'));
$('#sheetBackdropFrecuente').addEventListener('click', () => ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente'));

$('#btnGuardarFrecuente').addEventListener('click', () => conProteccionDoble($('#btnGuardarFrecuente'), async () => {
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
  await guardarPerfilEnNube();
  ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente');
  solicitarRenderTodo();
  mostrarToast('Guardado correctamente');
}));

$('#btnIrAGastos').addEventListener('click', () => irAPestana('gastos'));
$('#btnVolverGastos').addEventListener('click', () => irAPestana('frecuentes'));

/* ==================== SHEET: AGREGAR / EDITAR GASTO ===================== */

document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#chipsCategoriaGasto .chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    categoriaGastoSeleccionada = chip.dataset.valor;
  });
});

export function abrirSheetGasto(gastoExistente) {
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

$('#btnGuardarGasto').addEventListener('click', () => conProteccionDoble($('#btnGuardarGasto'), async () => {
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
}));

/* ==================== SHEET: MARCAR DEUDA COMO PAGADA =================== */

document.querySelectorAll('#segmentoMedioPagoConfirmar .segmented__opt').forEach(btn => {
  btn.addEventListener('click', () => { medioPagoConfirmarSeleccionado = seleccionarSegmento('segmentoMedioPagoConfirmar', btn.dataset.valor); });
});

export function abrirSheetPago(entrega) {
  entregaParaPago = entrega;
  el.pagoResumen.textContent = `${entrega.nombre} · ${formatCOP(entrega.valor)} · realizado el ${formatFechaCorta(entrega.fecha)}`;
  medioPagoConfirmarSeleccionado = seleccionarSegmento('segmentoMedioPagoConfirmar', 'efectivo');
  mostrarSheet('sheetPago', 'sheetBackdropPago');
}
$('#btnCancelarPago').addEventListener('click', () => ocultarSheet('sheetPago', 'sheetBackdropPago'));
$('#sheetBackdropPago').addEventListener('click', () => ocultarSheet('sheetPago', 'sheetBackdropPago'));

$('#btnConfirmarPago').addEventListener('click', () => conProteccionDoble($('#btnConfirmarPago'), async () => {
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
}, 'Registrando…'));

/* ==================== MODAL: DETALLE DE UN DOMICILIO =================== */

export function abrirModalDetalle(entrega) {
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

/* ========================= MODAL: CÁLCULO DEL DÍA ===================== */

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

/* ============================ MODAL: META ============================= */

function abrirModalMeta() {
  el.inputMeta.value = state.meta;
  mostrarModal('modalMeta', 'modalMetaBackdrop');
}
$('#btnAbrirMeta').addEventListener('click', abrirModalMeta);
$('#btnEditarMeta').addEventListener('click', abrirModalMeta);
$('#btnEditarMetaDesdeMas').addEventListener('click', abrirModalMeta);
$('#btnCancelarMeta').addEventListener('click', () => ocultarModal('modalMeta', 'modalMetaBackdrop'));
$('#modalMetaBackdrop').addEventListener('click', () => ocultarModal('modalMeta', 'modalMetaBackdrop'));

$('#btnGuardarMeta').addEventListener('click', () => conProteccionDoble($('#btnGuardarMeta'), async () => {
  const valor = Number(el.inputMeta.value);
  if (!valor || valor <= 0) { mostrarToast('Ingresa una meta válida'); return; }
  state.meta = valor;
  await guardarPerfilEnNube();
  ocultarModal('modalMeta', 'modalMetaBackdrop');
  solicitarRenderTodo();
  mostrarToast('Meta semanal actualizada');
}));

/* ==================== MODAL: CONFIRMAR (genérico) ===================== */

export function pedirConfirmacion(titulo, sub, callback, icono) {
  el.confirmIcono.textContent = icono || '🗑️';
  el.confirmTitulo.textContent = titulo;
  el.confirmSub.textContent = sub || 'Esta acción no se puede deshacer.';
  confirmCallback = callback;
  mostrarModal('modalConfirm', 'modalConfirmBackdrop');
}
$('#btnCancelarConfirm').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#modalConfirmBackdrop').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#btnConfirmarEliminar').addEventListener('click', () => conProteccionDoble($('#btnConfirmarEliminar'), async () => {
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
  ocultarModal('modalConfirm', 'modalConfirmBackdrop');
}, 'Un momento…'));
