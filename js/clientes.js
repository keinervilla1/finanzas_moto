/* =========================================================================
   DOMI — Clientes
   Personas o negocios que acumulan pagos. Se crean y editan en la pestaña
   "Más" (como los frecuentes) y sirven para agrupar los cobros pendientes.
   Datos: usuarios/{uid}/clientes/{id} = { nombre, telefono, creadoEn }
   ========================================================================= */

import {
  $, el, conProteccionDoble, mostrarSheet, ocultarSheet, mostrarToast
} from './dom.js';
import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { crearDocumento, actualizarDocumento, eliminarDocumento } from './data.js';
import { registrarRender } from './render-bus.js';
import { pedirConfirmacion } from './sheets.js';

let editingClienteId = null;

/** Lista de clientes en la pestaña "Más". */
export function renderClientes() {
  el.listaClientes.innerHTML = '';
  state.clientes.forEach(c => {
    const li = document.createElement('li');
    li.className = 'frecuente-item';
    li.innerHTML = `
      <div class="entrega-item__icon">👤</div>
      <div class="frecuente-item__info">
        <p class="frecuente-item__nombre">${escapeHTML(c.nombre)}</p>
        ${c.telefono ? `<p class="frecuente-item__valor">${escapeHTML(c.telefono)}</p>` : ''}
      </div>
      <div class="frecuente-item__actions">
        <button class="icon-btn icon-btn--edit" title="Editar">✎</button>
        <button class="icon-btn icon-btn--del" title="Eliminar">✕</button>
      </div>
    `;
    li.querySelector('.icon-btn--edit').addEventListener('click', () => abrirSheetCliente(c));
    li.querySelector('.icon-btn--del').addEventListener('click', () => {
      pedirConfirmacion('¿Eliminar este cliente?', c.nombre, async () => {
        await eliminarDocumento('clientes', c.id);
        mostrarToast('Cliente eliminado');
      });
    });
    el.listaClientes.appendChild(li);
  });
}
registrarRender(renderClientes);

function abrirSheetCliente(clienteExistente) {
  editingClienteId = clienteExistente ? clienteExistente.id : null;
  el.sheetClienteTitulo.textContent = clienteExistente ? 'Editar cliente' : 'Nuevo cliente';
  el.inputClienteNombre.value = clienteExistente ? clienteExistente.nombre : '';
  el.inputClienteTelefono.value = clienteExistente ? (clienteExistente.telefono || '') : '';
  mostrarSheet('sheetCliente', 'sheetBackdropCliente');
}
$('#btnNuevoCliente').addEventListener('click', () => abrirSheetCliente(null));
$('#btnCancelarCliente').addEventListener('click', () => ocultarSheet('sheetCliente', 'sheetBackdropCliente'));
$('#sheetBackdropCliente').addEventListener('click', () => ocultarSheet('sheetCliente', 'sheetBackdropCliente'));

$('#btnGuardarCliente').addEventListener('click', () => conProteccionDoble($('#btnGuardarCliente'), async () => {
  const nombre = el.inputClienteNombre.value.trim();
  const telefono = el.inputClienteTelefono.value.trim();
  if (!nombre) { mostrarToast('Escribe el nombre del cliente'); return; }

  try {
    if (editingClienteId) {
      await actualizarDocumento('clientes', editingClienteId, { nombre, telefono });
      mostrarToast('Cliente actualizado');
    } else {
      await crearDocumento('clientes', { nombre, telefono });
      mostrarToast('Cliente agregado');
    }
    ocultarSheet('sheetCliente', 'sheetBackdropCliente');
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo guardar el cliente');
  }
}));
