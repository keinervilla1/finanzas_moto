/* =========================================================================
   DOMI — Renderizado de todas las pantallas
   Pinta el estado en el DOM. Lee de state/calculos, escribe en `el`.
   ========================================================================= */

import { DIAS_SEMANA, CATEGORIAS_GASTO } from './config.js';
import {
  formatCOP, formatHora12, formatFechaCorta, formatFechaLarga,
  rangoSemanaTexto, toDateKey, getMonday, addDays, escapeHTML, tiempoCreacion
} from './utils.js';
import { el, mostrarToast } from './dom.js';
import { state, registros, gastosVista, historialSemanas, currentUid, olvidarEntregaLocal } from './state.js';
import { entregasRealizadasEn, entregasPagadasEl, gastosDe, totalDe, totalesPorDia } from './calculos.js';
import { coleccion, getDocs, query, where, orderBy, limit, startAfter } from './firebase.js';
import { eliminarDocumento, avisarFaltaIndice, mapDoc, guardarPerfilEnNube } from './data.js';
import { solicitarRenderTodo, registrarRenderTodo } from './render-bus.js';
import { pedirConfirmacion, abrirModalDetalle, abrirSheetPago, abrirSheetFrecuente, abrirSheetGasto } from './sheets.js';

/* ============================ Repintado global ========================== */

export function renderTodo() {
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

  // Si la pantalla Gastos está abierta y muestra un rango que vive en memoria
  // (Hoy / Semana), lo refrescamos también; los rangos Mes/Todo son consultas
  // puntuales y se recargan al tocar el filtro.
  if (document.getElementById('screen-gastos').classList.contains('active')
      && (gastosVista.rango === 'hoy' || gastosVista.rango === 'semana')) {
    cargarGastosVista();
  }
}
registrarRenderTodo(renderTodo);

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

/** Construye el <li> de un domicilio, reutilizado en Inicio, Deben y Registros. */
export function crearItemEntrega(entrega, opciones = {}) {
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
        olvidarEntregaLocal(entrega.id);
        solicitarRenderTodo();
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
        solicitarRenderTodo();
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

export async function cargarHistorialSemanas() {
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
    // Puede fallar si Firestore aún construye el índice compuesto que necesita
    // esta consulta (pagado + fechaPago desc). Se avisa y se reintenta al
    // volver a abrir la pestaña Semana.
    historialSemanas.cargado = false;
    avisarFaltaIndice('historial de semanas', err);
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

export async function cargarRegistros(reiniciar) {
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
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      const porHora = (b.hora || '').localeCompare(a.hora || '');
      return porHora !== 0 ? porHora : tiempoCreacion(b) - tiempoCreacion(a);
    })
    .forEach(e => el.listaRegistros.appendChild(crearItemEntrega(e, { onClick: abrirModalDetalle })));
  el.btnCargarMasRegistros.style.display = registros.hasMore ? 'block' : 'none';
}
el.btnCargarMasRegistros.addEventListener('click', () => cargarRegistros(false));

/* ---------- Gastos: listado con filtro ---------- */

document.querySelectorAll('#filtrosGastos .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filtrosGastos .chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    gastosVista.rango = chip.dataset.rango;
    cargarGastosVista();
  });
});

export async function cargarGastosVista() {
  const hoyKey = toDateKey(new Date());
  // Hoy y semana ya están en memoria (sincronizados en vivo) → sin lectura extra.
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
        solicitarRenderTodo();
        mostrarToast('Gasto eliminado');
      }, '🗑️');
    });
    el.listaGastos.appendChild(li);
  });
}
