/* =========================================================================
   DOMI — Control de domicilios para repartidores
   script.js
   Lógica de datos (localStorage), cálculos diarios/semanales,
   renderizado de las 4 pantallas y manejo de eventos.
   ========================================================================= */

/* ============================ 1. UTILIDADES ============================ */

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

/** Genera un id único simple */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Formatea un número como pesos colombianos: $6.500 */
function formatCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

/** Convierte "HH:MM" (24h) a formato 12h legible: "2:30 p. m." */
function formatHora12(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const periodo = h >= 12 ? 'p. m.' : 'a. m.';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

/** Devuelve "YYYY-MM-DD" en horario local (evita desfases de UTC) */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Devuelve el lunes (00:00) de la semana que contiene `date` */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo ... 6 = sábado
  const diff = day === 0 ? -6 : 1 - day; // llevar al lunes
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

/** Texto de rango de una semana, ej: "23 jun – 29 jun" */
function rangoSemanaTexto(monday) {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} ${MESES[monday.getMonth()].slice(0,3)} – ${sunday.getDate()} ${MESES[sunday.getMonth()].slice(0,3)}`;
}

/* ==================== 2. ESTADO Y ALMACENAMIENTO LOCAL ================== */

const STORAGE_KEYS = {
  entregas: 'domi_entregas',
  frecuentes: 'domi_frecuentes',
  meta: 'domi_meta'
};

const state = {
  entregas: cargar(STORAGE_KEYS.entregas, []),
  frecuentes: cargar(STORAGE_KEYS.frecuentes, [
    { id: uid(), nombre: 'Éxito', valor: 6500 },
    { id: uid(), nombre: 'D1', valor: 5000 },
    { id: uid(), nombre: 'Ara', valor: 4800 },
    { id: uid(), nombre: 'Farmatodo', valor: 7000 }
  ]),
  meta: cargar(STORAGE_KEYS.meta, 800000)
};

function cargar(key, porDefecto) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : porDefecto;
  } catch (e) {
    console.warn('No se pudo leer', key, e);
    return porDefecto;
  }
}

function guardar(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch (e) {
    console.warn('No se pudo guardar', key, e);
  }
}

function guardarEntregas() { guardar(STORAGE_KEYS.entregas, state.entregas); }
function guardarFrecuentes() { guardar(STORAGE_KEYS.frecuentes, state.frecuentes); }
function guardarMeta() { guardar(STORAGE_KEYS.meta, state.meta); }

/* ========================= 3. CÁLCULOS DERIVADOS ========================= */

function entregasDe(fechaKey) {
  return state.entregas.filter(e => e.fecha === fechaKey).sort((a, b) => a.hora.localeCompare(b.hora));
}

function entregasDeSemana(monday) {
  const inicio = toDateKey(monday);
  const fin = toDateKey(addDays(monday, 6));
  return state.entregas.filter(e => e.fecha >= inicio && e.fecha <= fin);
}

function totalDe(lista) {
  return lista.reduce((sum, e) => sum + Number(e.valor), 0);
}

/** Totales de cada día (lunes..domingo) de la semana dada */
function totalesPorDia(monday) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = addDays(monday, i);
    const fechaKey = toDateKey(fecha);
    const lista = entregasDe(fechaKey);
    dias.push({ fecha, fechaKey, nombre: DIAS_SEMANA[i], total: totalDe(lista), cantidad: lista.length });
  }
  return dias;
}

/* ============================ 4. REFERENCIAS DOM ========================= */

const $ = sel => document.querySelector(sel);

const el = {
  fechaActual: $('#fechaActual'),
  screenTitle: $('#screenTitle'),
  gananciaHoy: $('#gananciaHoy'),
  cantidadHoy: $('#cantidadHoy'),
  gananciaSemanaMini: $('#gananciaSemanaMini'),
  promedioHoyMini: $('#promedioHoyMini'),
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

  listaFrecuentes: $('#listaFrecuentes'),
  listaHistorial: $('#listaHistorial'),

  chipsFrecuentes: $('#chipsFrecuentes'),
  sheetTitulo: $('#sheetTitulo'),
  inputNombre: $('#inputNombre'),
  inputValor: $('#inputValor'),
  inputHora: $('#inputHora'),

  inputFrecNombre: $('#inputFrecNombre'),
  inputFrecValor: $('#inputFrecValor'),
  sheetFrecuenteTitulo: $('#sheetFrecuenteTitulo'),

  calcTotal: $('#calcTotal'),
  calcCantidad: $('#calcCantidad'),
  calcPromedio: $('#calcPromedio'),
  calcPrimero: $('#calcPrimero'),
  calcUltimo: $('#calcUltimo'),

  inputMeta: $('#inputMeta'),

  confirmTitulo: $('#confirmTitulo'),
  confirmSub: $('#confirmSub'),

  toast: $('#toast')
};

/* Variables de edición en curso */
let editingEntregaId = null;
let editingFrecuenteId = null;
let selectedFrecuenteId = null;
let confirmCallback = null;

/* ============================== 5. RENDERIZADO ============================ */

function renderTodo() {
  const hoy = new Date();
  const hoyKey = toDateKey(hoy);
  const monday = getMonday(hoy);

  // --- Encabezado ---
  el.fechaActual.textContent = formatFechaLarga(hoy);

  // --- Datos de hoy ---
  const entregasHoy = entregasDe(hoyKey);
  const totalHoy = totalDe(entregasHoy);
  const promedioHoy = entregasHoy.length ? totalHoy / entregasHoy.length : 0;

  // --- Datos de la semana ---
  const entregasSemana = entregasDeSemana(monday);
  const totalSemanaVal = totalDe(entregasSemana);
  const dias = totalesPorDia(monday);
  const pctMeta = state.meta > 0 ? Math.min(totalSemanaVal / state.meta, 1) : 0;

  renderInicio(entregasHoy, totalHoy, promedioHoy, totalSemanaVal, pctMeta);
  renderSemana(dias, totalSemanaVal, pctMeta, hoyKey);
  renderFrecuentes();
  renderHistorial(monday);
}

function renderInicio(entregasHoy, totalHoy, promedioHoy, totalSemanaVal, pctMeta) {
  el.gananciaHoy.textContent = formatCOP(totalHoy);
  el.cantidadHoy.textContent = entregasHoy.length;
  el.gananciaSemanaMini.textContent = formatCOP(totalSemanaVal);
  el.promedioHoyMini.textContent = formatCOP(promedioHoy);
  el.badgeHoy.textContent = entregasHoy.length;

  setAnillo(el.ringHeroFg, 226.2, pctMeta);
  setAnillo(el.ringMiniFg, 100.5, pctMeta);
  const pctTxt = Math.round(pctMeta * 100) + '%';
  el.ringHeroPct.textContent = pctTxt;
  el.metaMiniPct.textContent = pctTxt;

  // Lista de domicilios de hoy
  el.listaHoy.innerHTML = '';
  entregasHoy.forEach(entrega => {
    el.listaHoy.appendChild(crearItemEntrega(entrega));
  });
}

function crearItemEntrega(entrega) {
  const li = document.createElement('li');
  li.className = 'entrega-item';
  li.innerHTML = `
    <div class="entrega-item__icon">🛵</div>
    <div class="entrega-item__info">
      <p class="entrega-item__nombre">${escapeHTML(entrega.nombre)}</p>
      <p class="entrega-item__hora">${formatHora12(entrega.hora)}</p>
    </div>
    <div class="entrega-item__valor">${formatCOP(entrega.valor)}</div>
    <button class="entrega-item__del" title="Eliminar">✕</button>
  `;
  // Tocar la tarjeta (fuera del botón eliminar) abre edición
  li.addEventListener('click', (ev) => {
    if (ev.target.closest('.entrega-item__del')) return;
    abrirSheetEntrega(entrega);
  });
  li.querySelector('.entrega-item__del').addEventListener('click', (ev) => {
    ev.stopPropagation();
    pedirConfirmacion(
      '¿Eliminar este domicilio?',
      `${entrega.nombre} · ${formatCOP(entrega.valor)}`,
      () => {
        state.entregas = state.entregas.filter(e => e.id !== entrega.id);
        guardarEntregas();
        renderTodo();
        mostrarToast('Domicilio eliminado');
      }
    );
  });
  return li;
}

function setAnillo(circleEl, circunferencia, pct) {
  const offset = circunferencia - pct * circunferencia;
  circleEl.style.strokeDashoffset = offset;
}

function renderSemana(dias, totalSemanaVal, pctMeta, hoyKey) {
  el.goalBarFill.style.width = (pctMeta * 100) + '%';
  el.goalActual.textContent = formatCOP(totalSemanaVal);
  el.goalMeta.textContent = 'de ' + formatCOP(state.meta);

  // Mejor día y promedio diario
  const diasConDatos = dias.filter(d => d.total > 0);
  const mejor = dias.reduce((max, d) => d.total > max.total ? d : max, dias[0]);
  el.mejorDiaValor.textContent = mejor.total > 0 ? formatCOP(mejor.total) : '—';
  el.mejorDiaNombre.textContent = mejor.total > 0 ? `Mejor día · ${mejor.nombre}` : 'Mejor día';
  const promedioDiario = diasConDatos.length ? totalSemanaVal / diasConDatos.length : 0;
  el.promedioDiarioValor.textContent = formatCOP(promedioDiario);

  el.totalSemana.textContent = formatCOP(totalSemanaVal);

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
      pedirConfirmacion(
        '¿Eliminar este frecuente?',
        `${f.nombre} · ${formatCOP(f.valor)}`,
        () => {
          state.frecuentes = state.frecuentes.filter(x => x.id !== f.id);
          guardarFrecuentes();
          renderTodo();
          mostrarToast('Frecuente eliminado');
        }
      );
    });
    el.listaFrecuentes.appendChild(li);
  });
}

function renderHistorial(currentMonday) {
  // Agrupar todas las entregas (excepto la semana actual) por lunes de su semana
  const semanas = new Map(); // key: dateKey del lunes -> lista entregas
  state.entregas.forEach(e => {
    const fecha = new Date(e.fecha + 'T00:00:00');
    const monday = getMonday(fecha);
    const key = toDateKey(monday);
    if (key === toDateKey(currentMonday)) return; // la semana actual no es "historial"
    if (!semanas.has(key)) semanas.set(key, { monday, lista: [] });
    semanas.get(key).lista.push(e);
  });

  const ordenadas = [...semanas.values()].sort((a, b) => b.monday - a.monday);

  el.listaHistorial.innerHTML = '';
  ordenadas.forEach(({ monday, lista }) => {
    const total = totalDe(lista);
    const dias = totalesPorDiaDesdeLista(monday, lista);
    const li = document.createElement('li');
    li.className = 'historial-item';
    li.innerHTML = `
      <div class="historial-item__head">
        <span class="historial-item__rango">${rangoSemanaTexto(monday)}</span>
        <span class="historial-item__total">${formatCOP(total)}</span>
      </div>
      <p class="historial-item__meta">${lista.length} domicilios</p>
      <div class="historial-item__dias">
        ${dias.map(d => `<div class="historial-dia-row"><span>${d.nombre}</span><span>${formatCOP(d.total)}</span></div>`).join('')}
      </div>
    `;
    li.addEventListener('click', () => li.classList.toggle('open'));
    el.listaHistorial.appendChild(li);
  });
}

function totalesPorDiaDesdeLista(monday, lista) {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fechaKey = toDateKey(addDays(monday, i));
    const total = totalDe(lista.filter(e => e.fecha === fechaKey));
    dias.push({ nombre: DIAS_SEMANA[i], total });
  }
  return dias;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================ 6. NAVEGACIÓN (TABS) ========================= */

const TITULOS = { inicio: 'Hoy', semana: 'Semana', frecuentes: 'Frecuentes', historial: 'Historial' };

document.querySelectorAll('.tabbar__item').forEach(btn => {
  btn.addEventListener('click', () => {
    const screen = btn.dataset.screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + screen).classList.add('active');
    document.querySelectorAll('.tabbar__item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    el.screenTitle.textContent = TITULOS[screen];
    document.getElementById('screens').scrollTop = 0;
  });
});

/* ==================== 7. SHEET: AGREGAR / EDITAR DOMICILIO ================= */

function abrirSheetEntrega(entregaExistente) {
  editingEntregaId = entregaExistente ? entregaExistente.id : null;
  selectedFrecuenteId = null;
  el.sheetTitulo.textContent = entregaExistente ? 'Editar domicilio' : 'Agregar domicilio';

  // Renderizar chips de frecuentes
  el.chipsFrecuentes.innerHTML = '';
  if (state.frecuentes.length === 0) {
    el.chipsFrecuentes.innerHTML = '<span class="chip chip--empty">Crea frecuentes en la pestaña "Frecuentes"</span>';
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
  } else {
    el.inputNombre.value = '';
    el.inputValor.value = '';
    const ahora = new Date();
    el.inputHora.value = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  }

  mostrarSheet('sheetDomicilio', 'sheetBackdrop');
}

$('#btnAgregarDomicilio').addEventListener('click', () => abrirSheetEntrega(null));
$('#btnCancelarDomicilio').addEventListener('click', () => ocultarSheet('sheetDomicilio', 'sheetBackdrop'));
$('#sheetBackdrop').addEventListener('click', () => ocultarSheet('sheetDomicilio', 'sheetBackdrop'));

$('#btnGuardarDomicilio').addEventListener('click', () => {
  const nombre = el.inputNombre.value.trim();
  const valor = Number(el.inputValor.value);
  const hora = el.inputHora.value;

  if (!nombre) { mostrarToast('Escribe el nombre del domicilio'); return; }
  if (!valor || valor <= 0) { mostrarToast('Ingresa un valor válido'); return; }
  if (!hora) { mostrarToast('Selecciona la hora'); return; }

  if (editingEntregaId) {
    const entrega = state.entregas.find(e => e.id === editingEntregaId);
    entrega.nombre = nombre;
    entrega.valor = valor;
    entrega.hora = hora;
  } else {
    state.entregas.push({
      id: uid(),
      nombre, valor, hora,
      fecha: toDateKey(new Date())
    });
  }
  guardarEntregas();
  ocultarSheet('sheetDomicilio', 'sheetBackdrop');
  renderTodo();
  animarHero();
  mostrarToast(editingEntregaId ? 'Domicilio actualizado' : 'Domicilio agregado 🎉');
});

function animarHero() {
  el.gananciaHoy.classList.remove('bump');
  void el.gananciaHoy.offsetWidth; // reinicia la animación
  el.gananciaHoy.classList.add('bump');
}

/* ==================== 8. SHEET: NUEVO / EDITAR FRECUENTE =================== */

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
    f.nombre = nombre;
    f.valor = valor;
  } else {
    state.frecuentes.push({ id: uid(), nombre, valor });
  }
  guardarFrecuentes();
  ocultarSheet('sheetFrecuente', 'sheetBackdropFrecuente');
  renderTodo();
  mostrarToast('Guardado correctamente');
});

/* ========================= 9. MODAL: CÁLCULO DEL DÍA ======================= */

$('#btnCalcularDia').addEventListener('click', () => {
  const hoyKey = toDateKey(new Date());
  const lista = entregasDe(hoyKey);
  const total = totalDe(lista);
  const promedio = lista.length ? total / lista.length : 0;

  el.calcTotal.textContent = formatCOP(total);
  el.calcCantidad.textContent = lista.length;
  el.calcPromedio.textContent = formatCOP(promedio);
  el.calcPrimero.textContent = lista.length ? formatHora12(lista[0].hora) : '—';
  el.calcUltimo.textContent = lista.length ? formatHora12(lista[lista.length - 1].hora) : '—';

  mostrarModal('modalCalculo', 'modalCalculoBackdrop');
});
$('#btnCerrarCalculo').addEventListener('click', () => ocultarModal('modalCalculo', 'modalCalculoBackdrop'));
$('#modalCalculoBackdrop').addEventListener('click', () => ocultarModal('modalCalculo', 'modalCalculoBackdrop'));

/* ============================ 10. MODAL: META =============================== */

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
  guardarMeta();
  ocultarModal('modalMeta', 'modalMetaBackdrop');
  renderTodo();
  mostrarToast('Meta semanal actualizada');
});

/* ======================= 11. MODAL: CONFIRMAR ELIMINAR ======================= */

function pedirConfirmacion(titulo, sub, callback) {
  el.confirmTitulo.textContent = titulo;
  el.confirmSub.textContent = sub || 'Esta acción no se puede deshacer.';
  confirmCallback = callback;
  mostrarModal('modalConfirm', 'modalConfirmBackdrop');
}
$('#btnCancelarConfirm').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#modalConfirmBackdrop').addEventListener('click', () => ocultarModal('modalConfirm', 'modalConfirmBackdrop'));
$('#btnConfirmarEliminar').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
  ocultarModal('modalConfirm', 'modalConfirmBackdrop');
});

/* ======================== 12. HELPERS: SHEETS / MODALES / TOAST ============== */

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
  toastTimeout = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

/* ============================ 13. INICIALIZACIÓN ============================= */

renderTodo();

// Refresca automáticamente al pasar la medianoche mientras la app sigue abierta
let ultimaFechaKey = toDateKey(new Date());
setInterval(() => {
  const actual = toDateKey(new Date());
  if (actual !== ultimaFechaKey) {
    ultimaFechaKey = actual;
    renderTodo();
  }
}, 60 * 1000);

/* ========================= 14. PWA: SERVICE WORKER =========================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}