/* =========================================================================
   DOMI — Cobrar por WhatsApp
   Botón en cada tarjeta de Cobros que abre WhatsApp con un mensaje listo:
   lo pendiente día por día, el total, el abono (si hay) y tus datos de pago.

   - Cliente con teléfono válido → WhatsApp directo a su chat (un toque).
   - Cliente registrado sin teléfono (o con uno que no sirve) → hoja para
     escribirlo; se guarda SOLO el campo `telefono` de ese cliente.
   - Grupo sin cliente registrado (domicilios viejos sin clienteId) → no hay
     dónde guardar un teléfono: WhatsApp abre para elegir el chat.
   - Siempre queda "Compartir de otra forma" (menú de compartir del teléfono).

   Escrituras posibles (las únicas): clientes/{id}.telefono y
   usuarios/{uid}.datosPago. Ningún domicilio se toca.
   ========================================================================= */

import { $, el, mostrarSheet, ocultarSheet, mostrarToast } from './dom.js';
import { state } from './state.js';
import { formatCOP, formatFechaDiaMes } from './utils.js';
import { totalDe } from './calculos.js';
import { actualizarDocumento, guardarCampoPerfil } from './data.js';

/* ============================== Teléfono =============================== */

/** Convierte un teléfono escrito "como sea" al formato que pide WhatsApp
 *  (solo dígitos, con código de país). Devuelve null si no se puede.
 *  - "300 123 4567", "300-123-4567", "(300) 1234567" → 573001234567
 *  - "+57 300 123 4567", "57 3001234567", "0057 3001234567" → 573001234567
 *  - "+1 305 555 0101" (otro país, con +) → se respeta: 13055550101
 *  El teléfono guardado NO se modifica; esto solo arma el enlace. */
export function telefonoParaWhatsApp(texto) {
  const compacto = String(texto || '').replace(/[\s().\-]/g, '');
  if (!compacto) return null;
  const internacional = compacto.startsWith('+') || compacto.startsWith('00');
  let digitos = compacto.replace(/\D/g, '');
  if (compacto.startsWith('00')) digitos = digitos.slice(2);
  if (internacional) return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
  if (digitos.length === 10) return '57' + digitos;                          // celular/fijo de Colombia
  if (digitos.length === 12 && digitos.startsWith('57')) return digitos;     // ya traía el 57
  return null;
}

/* =============================== Mensaje =============================== */

export function armarMensajeCobro(grupo, datosPago) {
  const deudas = [...grupo.deudas].sort((a, b) => {
    const fa = `${a.fecha || ''} ${a.hora || ''}`;
    const fb = `${b.fecha || ''} ${b.hora || ''}`;
    return fa < fb ? -1 : fa > fb ? 1 : 0;   // del más antiguo al más nuevo
  });
  const total = totalDe(deudas);
  const abono = Number(grupo.abono) || 0;

  const lineas = [
    `Hola ${String(grupo.nombre || '').trim()} 👋, te comparto lo pendiente de domicilios:`,
    ...deudas.map(d => `• ${formatFechaDiaMes(d.fecha)} - ${formatCOP(d.valor)}`),
    `Total: ${formatCOP(total)}`
  ];
  if (abono > 0) {
    lineas.push(abono >= total
      ? `(Ya tienes un abono de ${formatCOP(abono)}, que cubre todo)`
      : `(Ya tienes un abono de ${formatCOP(abono)}, quedan ${formatCOP(total - abono)})`);
  }
  const pago = String(datosPago || '').trim();
  if (pago) lineas.push('Puedes pagarme por:', pago);
  lineas.push('¡Gracias!');
  return lineas.join('\n');
}

/* ============================ Abrir WhatsApp =========================== */
/* Se usa el enlace directo a la app (whatsapp://): desde una app instalada en
   iPhone, los enlaces web (wa.me) a veces se quedan en Safari en vez de abrir
   WhatsApp. Si a los 2,5 s la app sigue en primer plano (WhatsApp no abrió,
   p. ej. no está instalado), se ofrece la hoja con "Compartir de otra forma". */

let esperaApertura = null;
function cancelarEsperaApertura() { clearTimeout(esperaApertura); esperaApertura = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelarEsperaApertura(); });
window.addEventListener('pagehide', cancelarEsperaApertura);
window.addEventListener('blur', cancelarEsperaApertura);

function abrirWhatsApp(telefono, mensaje, siNoAbre) {
  const params = new URLSearchParams();
  if (telefono) params.set('phone', telefono);
  params.set('text', mensaje);
  cancelarEsperaApertura();
  if (siNoAbre) esperaApertura = setTimeout(() => { esperaApertura = null; siNoAbre(); }, 2500);
  // URLSearchParams codifica los espacios como "+": WhatsApp los muestra
  // literalmente en algunos teléfonos, así que se cambian por %20.
  window.location.href = 'whatsapp://send?' + params.toString().replace(/\+/g, '%20');
}

/* ======================= Hoja "Cobrar por WhatsApp" ===================== */

let grupoWa = null;
let mensajeWa = '';

function abrirHojaWhatsApp(grupo, aviso) {
  grupoWa = grupo;
  mensajeWa = armarMensajeCobro(grupo, state.datosPago);
  el.waTitulo.textContent = `Cobrar a ${grupo.nombre}`;
  el.waAviso.textContent = aviso;
  el.waMensaje.textContent = mensajeWa;

  el.waCampoTelefono.style.display = grupo.registrado ? 'block' : 'none';
  el.inputWaTelefono.value = grupo.registrado ? (grupo.telefono || '') : '';
  el.btnWaAbrir.textContent = grupo.registrado ? 'Guardar y abrir WhatsApp' : 'Elegir chat en WhatsApp';
  mostrarSheet('sheetWhatsApp', 'sheetBackdropWhatsApp');
}
function cerrarHojaWhatsApp() {
  ocultarSheet('sheetWhatsApp', 'sheetBackdropWhatsApp');
  grupoWa = null;
}

/** Punto de entrada desde el botón de cada tarjeta de Cobros. */
export function cobrarPorWhatsApp(grupo) {
  if (!grupo.registrado) {
    return abrirHojaWhatsApp(grupo,
      'Estos domicilios no están vinculados a un cliente registrado, así que no hay un teléfono guardado. Elige el chat en WhatsApp o compártelo de otra forma.');
  }
  if (!grupo.telefono) {
    return abrirHojaWhatsApp(grupo, 'Este cliente no tiene teléfono. Escríbelo y queda guardado en su ficha.');
  }
  const tel = telefonoParaWhatsApp(grupo.telefono);
  if (!tel) {
    return abrirHojaWhatsApp(grupo, `El teléfono guardado (${grupo.telefono}) no parece válido. Corrígelo aquí.`);
  }
  // Directo, sin vista previa: WhatsApp deja revisar el mensaje antes de enviar.
  abrirWhatsApp(tel, armarMensajeCobro(grupo, state.datosPago), () =>
    abrirHojaWhatsApp(grupo, '¿No se abrió WhatsApp? Revisa que esté instalado, o comparte el mensaje de otra forma.'));
}

el.btnWaAbrir.addEventListener('click', () => {
  if (!grupoWa) return;
  const grupo = grupoWa;
  if (!grupo.registrado) {
    cerrarHojaWhatsApp();
    abrirWhatsApp(null, mensajeWa);
    return;
  }
  const escrito = el.inputWaTelefono.value.trim();
  const tel = telefonoParaWhatsApp(escrito);
  if (!tel) { mostrarToast('Revisa el número. Ej: 300 123 4567'); return; }

  if (escrito !== (grupo.telefono || '')) {
    // Solo el campo "telefono", tal cual lo escribió. Sin esperar al servidor:
    // WhatsApp tiene que abrirse en este mismo toque (el teléfono lo exige), y
    // sin señal el número sube cuando vuelva.
    actualizarDocumento('clientes', grupo.clienteId, { telefono: escrito })
      .catch(err => { console.error(err); mostrarToast('No se pudo guardar el teléfono'); });
  }
  cerrarHojaWhatsApp();
  abrirWhatsApp(tel, mensajeWa);
});

el.btnWaCompartir.addEventListener('click', async () => {
  if (!mensajeWa) return;
  try {
    if (navigator.share) {
      await navigator.share({ text: mensajeWa });
    } else {
      await navigator.clipboard.writeText(mensajeWa);
      mostrarToast('Mensaje copiado. Pégalo en el chat.');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // cerró el menú
    console.error(err);
    mostrarToast('No se pudo compartir el mensaje');
  }
});

$('#btnWaCancelar').addEventListener('click', cerrarHojaWhatsApp);
$('#sheetBackdropWhatsApp').addEventListener('click', cerrarHojaWhatsApp);

/* ===================== Hoja "Datos de pago para cobrar" ================= */

function cerrarHojaDatosPago() { ocultarSheet('sheetDatosPago', 'sheetBackdropDatosPago'); }

$('#btnAbrirDatosPago').addEventListener('click', () => {
  el.inputDatosPago.value = state.datosPago || '';
  mostrarSheet('sheetDatosPago', 'sheetBackdropDatosPago');
});
$('#btnCancelarDatosPago').addEventListener('click', cerrarHojaDatosPago);
$('#sheetBackdropDatosPago').addEventListener('click', cerrarHojaDatosPago);

$('#btnGuardarDatosPago').addEventListener('click', () => {
  const texto = el.inputDatosPago.value.trim().slice(0, 300);
  if (texto === (state.datosPago || '')) { cerrarHojaDatosPago(); return; }
  state.datosPago = texto;
  guardarCampoPerfil({ datosPago: texto }); // solo este campo del perfil
  cerrarHojaDatosPago();
  mostrarToast(texto ? 'Datos de pago guardados' : 'Datos de pago borrados del mensaje');
});
