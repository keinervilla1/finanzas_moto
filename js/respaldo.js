/* =========================================================================
   DOMI — Respaldo (exportar datos)
   Descarga una copia de domicilios, gastos y clientes: un CSV por cada uno
   (listo para Excel en Colombia) y un JSON completo con todo.

   SOLO LEE de Firestore. Este módulo no importa ninguna función de escritura
   (ni setDoc, ni updateDoc, ni deleteDoc, ni las de data.js): no puede
   cambiar ni borrar nada. Tampoco hay importar/restaurar, a propósito.
   La fecha del último respaldo se guarda en el teléfono (localStorage).

   Dos toques:
   1. "Preparar respaldo" lee los datos DEL SERVIDOR (no de la caché local,
      que podría estar incompleta) y arma los archivos.
   2. "Guardar o compartir todo" abre el menú de compartir del teléfono con
      los 4 archivos; o se baja cada uno con su botón. Va en un toque aparte
      porque el teléfono (sobre todo iPhone) solo deja abrir el menú de
      compartir justo después de un toque, no tras segundos de espera.
   ========================================================================= */

import { $, el, conProteccionDoble, mostrarSheet, ocultarSheet, mostrarToast } from './dom.js';
import { coleccion, refPerfil, getDocsFromServer, getDocFromServer } from './firebase.js';
import { currentUid } from './state.js';
import { CATEGORIAS_GASTO, CLAVE_ULTIMO_RESPALDO, VERSION_APP } from './config.js';
import { toDateKey } from './utils.js';

/** Archivos listos para el respaldo en curso: [{ nombre, etiqueta, archivo }]. */
let archivos = [];

/* ============================== Lectura ================================ */

async function leerTodo(uid) {
  const [perfilSnap, entregasSnap, gastosSnap, clientesSnap] = await Promise.all([
    getDocFromServer(refPerfil(uid)),
    getDocsFromServer(coleccion(uid, 'entregas')),
    getDocsFromServer(coleccion(uid, 'gastos')),
    getDocsFromServer(coleccion(uid, 'clientes'))
  ]);
  const aLista = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return {
    perfil: perfilSnap.exists() ? perfilSnap.data() : {},
    entregas: aLista(entregasSnap),
    gastos: aLista(gastosSnap),
    clientes: aLista(clientesSnap)
  };
}

/* ================================ JSON ================================= */

/** Copia profunda que cambia los Timestamp de Firestore (creadoEn) por texto
 *  ISO legible, ej. "2026-11-18T20:15:03.120Z". */
function aJSONLegible(valor) {
  if (valor && typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(aJSONLegible);
  if (valor && typeof valor === 'object') {
    const copia = {};
    for (const [k, v] of Object.entries(valor)) copia[k] = aJSONLegible(v);
    return copia;
  }
  return valor;
}

function armarJSON(datos, exportadoEn) {
  return JSON.stringify(aJSONLegible({
    app: 'Domi',
    version: VERSION_APP,
    exportadoEn: exportadoEn.toISOString(),
    conteo: { entregas: datos.entregas.length, gastos: datos.gastos.length, clientes: datos.clientes.length },
    perfil: datos.perfil,
    entregas: datos.entregas,
    gastos: datos.gastos,
    clientes: datos.clientes
  }), null, 2);
}

/* ================================ CSV ================================== */
/* Para Excel con configuración de Colombia: separador ";" (la coma es el
   decimal), marca BOM al inicio para que las tildes y la ñ se lean bien, y
   saltos de línea CRLF. */

const SEP = ';';

function numeroCSV(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return v ?? '';
  return String(n).replace('.', ',');
}

function celdaCSV(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Un texto que empieza con = + - @ Excel lo tomaría como fórmula.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function armarCSV(encabezados, filas) {
  const lineas = [encabezados, ...filas].map(fila => fila.map(celdaCSV).join(SEP));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

/** Más reciente primero, igual que en la app. */
function porFechaDesc(a, b) {
  const fa = `${a.fecha || ''} ${a.hora || ''}`;
  const fb = `${b.fecha || ''} ${b.hora || ''}`;
  return fa < fb ? 1 : fa > fb ? -1 : 0;
}

function csvDomicilios(entregas, clientes) {
  const nombreCliente = new Map(clientes.map(c => [c.id, c.nombre || '']));
  const filas = [...entregas].sort(porFechaDesc).map(e => [
    e.fecha || '',
    e.hora || '',
    e.nombre || '',
    e.clienteId ? (nombreCliente.get(e.clienteId) || '') : '',
    numeroCSV(e.valor),
    e.tipo === 'contrata' ? 'Contrata' : 'Normal',
    e.pagado ? 'Sí' : 'No',
    e.pagado ? (e.medioPago === 'transferencia' ? 'Transferencia' : 'Efectivo') : '',
    e.pagado ? (e.fechaPago || '') : '',
    e.descripcion || ''
  ]);
  return armarCSV(
    ['Fecha', 'Hora', 'Nombre', 'Cliente registrado', 'Valor', 'Tipo', 'Pagado', 'Medio de pago', 'Fecha de pago', 'Observación'],
    filas
  );
}

function csvGastos(gastos) {
  const filas = [...gastos].sort(porFechaDesc).map(g => [
    g.fecha || '',
    (CATEGORIAS_GASTO[g.categoria] || CATEGORIAS_GASTO.otros).label,
    numeroCSV(g.valor),
    g.descripcion || ''
  ]);
  return armarCSV(['Fecha', 'Categoría', 'Valor', 'Descripción'], filas);
}

function csvClientes(clientes) {
  const filas = [...clientes]
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
    .map(c => [c.nombre || '', c.telefono || '', numeroCSV(Number(c.abono) || 0)]);
  return armarCSV(['Nombre', 'Teléfono', 'Abono'], filas);
}

/* ============================ Último respaldo ========================== */

function claveUltimo() { return CLAVE_ULTIMO_RESPALDO + currentUid; }

function textoUltimoRespaldo() {
  const iso = localStorage.getItem(claveUltimo());
  if (!iso) return 'Último respaldo: Nunca';
  const fecha = new Date(iso);
  if (isNaN(fecha)) return 'Último respaldo: Nunca';
  // Días de calendario (no horas): un respaldo de anoche es "ayer".
  const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((dia(new Date()) - dia(fecha)) / 86400000);
  if (dias <= 0) return 'Último respaldo: hoy';
  if (dias === 1) return 'Último respaldo: ayer';
  return `Último respaldo: hace ${dias} días`;
}

function marcarRespaldoHecho() {
  localStorage.setItem(claveUltimo(), new Date().toISOString());
  el.respaldoUltimo.textContent = textoUltimoRespaldo();
}

/* ============================ Guardar archivos ========================= */

function descargar(archivo) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después: en iPhone la descarga abre una vista previa que aún
  // necesita la URL unos segundos.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function puedeCompartirArchivos(lista) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files: lista }));
}

/* ================================ Hoja ================================= */

function formatoCantidad(n, singular, plural) {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? singular : plural}`;
}

function reiniciarHoja() {
  archivos = [];
  el.respaldoListo.style.display = 'none';
  el.respaldoArchivos.innerHTML = '';
  $('#btnPrepararRespaldo').style.display = 'block';
  el.respaldoUltimo.textContent = textoUltimoRespaldo();
}

function mostrarArchivosListos(datos) {
  el.respaldoResumen.textContent = [
    formatoCantidad(datos.entregas.length, 'domicilio', 'domicilios'),
    formatoCantidad(datos.gastos.length, 'gasto', 'gastos'),
    formatoCantidad(datos.clientes.length, 'cliente', 'clientes')
  ].join(' · ');

  el.btnCompartirRespaldo.style.display =
    puedeCompartirArchivos(archivos.map(a => a.archivo)) ? 'block' : 'none';

  el.respaldoArchivos.innerHTML = '';
  archivos.forEach(({ etiqueta, archivo }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-row';
    btn.innerHTML = `
      <span class="settings-row__icon">⬇️</span>
      <span class="settings-row__label">${etiqueta}</span>
      <span class="settings-row__chevron">${archivo.name.endsWith('.json') ? 'JSON' : 'CSV'}</span>
    `;
    btn.addEventListener('click', () => {
      descargar(archivo);
      marcarRespaldoHecho();
    });
    el.respaldoArchivos.appendChild(btn);
  });

  $('#btnPrepararRespaldo').style.display = 'none';
  el.respaldoListo.style.display = 'block';
}

$('#btnAbrirRespaldo').addEventListener('click', () => {
  reiniciarHoja();
  mostrarSheet('sheetRespaldo', 'sheetBackdropRespaldo');
});
function cerrarHoja() {
  ocultarSheet('sheetRespaldo', 'sheetBackdropRespaldo');
  archivos = []; // no dejar los datos en memoria más de lo necesario
}
$('#btnCerrarRespaldo').addEventListener('click', cerrarHoja);
$('#sheetBackdropRespaldo').addEventListener('click', cerrarHoja);

$('#btnPrepararRespaldo').addEventListener('click', () => conProteccionDoble($('#btnPrepararRespaldo'), async () => {
  if (!currentUid) return;
  if (!navigator.onLine) {
    mostrarToast('Necesitas internet para un respaldo completo');
    return;
  }
  try {
    const datos = await leerTodo(currentUid);
    const ahora = new Date();
    const fecha = toDateKey(ahora);
    archivos = [
      { etiqueta: 'Domicilios', nombre: `domi-domicilios-${fecha}.csv`, contenido: csvDomicilios(datos.entregas, datos.clientes), tipo: 'text/csv' },
      { etiqueta: 'Gastos', nombre: `domi-gastos-${fecha}.csv`, contenido: csvGastos(datos.gastos), tipo: 'text/csv' },
      { etiqueta: 'Clientes', nombre: `domi-clientes-${fecha}.csv`, contenido: csvClientes(datos.clientes), tipo: 'text/csv' },
      { etiqueta: 'Respaldo completo', nombre: `domi-respaldo-${fecha}.json`, contenido: armarJSON(datos, ahora), tipo: 'application/json' }
    ].map(a => ({ etiqueta: a.etiqueta, archivo: new File([a.contenido], a.nombre, { type: a.tipo }) }));
    mostrarArchivosListos(datos);
  } catch (err) {
    console.error(err);
    mostrarToast(err && err.code === 'unavailable'
      ? 'Necesitas internet para un respaldo completo'
      : 'No se pudo preparar el respaldo. Intenta de nuevo.');
  }
}, 'Leyendo tus datos…'));

el.btnCompartirRespaldo.addEventListener('click', async () => {
  const lista = archivos.map(a => a.archivo);
  if (!lista.length) return;
  try {
    await navigator.share({ files: lista, title: 'Respaldo de Domi' });
    marcarRespaldoHecho();
  } catch (err) {
    if (err && err.name === 'AbortError') return; // cerró el menú sin elegir nada
    console.error(err);
    mostrarToast('No se pudo compartir. Usa los botones de abajo.');
  }
});
