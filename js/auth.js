/* =========================================================================
   DOMI — Autenticación y configuración de cuenta
   Pantalla de inicio de sesión / registro y el modal de ajustes de cuenta
   (nombre, correo, contraseña). El arranque de sesión en sí (onAuthStateChanged)
   vive en script.js, que usa renderSaludo/actualizarTextosAuth de aquí.
   ========================================================================= */

import { $, el, conProteccionDoble, mostrarModal, ocultarModal } from './dom.js';
import {
  auth,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from './firebase.js';
import { pedirConfirmacion } from './sheets.js';

let modoRegistro = false;

export function actualizarTextosAuth() {
  el.btnAuthPrincipal.textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  el.btnAuthToggle.textContent = modoRegistro ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear una';
  el.campoAuthNombre.style.display = modoRegistro ? 'block' : 'none';
  el.authError.textContent = '';
}

/** Vuelve la pantalla de login a su estado inicial (tras cerrar sesión). */
export function resetAuthUI() {
  modoRegistro = false;
  actualizarTextosAuth();
}

el.btnAuthToggle.addEventListener('click', () => { modoRegistro = !modoRegistro; actualizarTextosAuth(); });

function mensajeErrorAuth(codigo) {
  const mapa = {
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/missing-password': 'Escribe una contraseña.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/network-request-failed': 'Sin conexión a internet. Revisa tu red.',
    'auth/requires-recent-login': 'Por seguridad, vuelve a escribir tu contraseña actual.'
  };
  return mapa[codigo] || 'Ocurrió un error. Inténtalo de nuevo.';
}

el.btnAuthPrincipal.addEventListener('click', () => conProteccionDoble(el.btnAuthPrincipal, async () => {
  const nombre = el.authNombre.value.trim();
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  el.authError.textContent = '';

  if (!email || !password) { el.authError.textContent = 'Completa correo y contraseña.'; return; }
  if (modoRegistro && !nombre) { el.authError.textContent = 'Escribe cómo quieres que te llamemos.'; return; }

  try {
    if (modoRegistro) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: nombre });
      renderSaludo(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    el.authError.textContent = mensajeErrorAuth(err.code);
  }
}, 'Un momento…'));

$('#btnCerrarSesion').addEventListener('click', () => {
  pedirConfirmacion('¿Cerrar sesión?', 'Tus datos seguirán guardados en la nube.', () => signOut(auth), '👋');
});

export function renderSaludo(user) {
  const nombre = user.displayName || user.email.split('@')[0];
  el.saludoUsuario.textContent = `Hola, ${nombre} 👋`;
}

/* ======================= Configuración de cuenta ======================= */

function abrirModalCuenta() {
  el.cuentaMsg.textContent = '';
  el.inputCuentaNombre.value = auth.currentUser?.displayName || '';
  el.inputCuentaNuevoCorreo.value = '';
  el.inputCuentaPasswordCorreo.value = '';
  el.inputCuentaNuevaPassword.value = '';
  el.inputCuentaPasswordActual.value = '';
  mostrarModal('modalCuenta', 'modalCuentaBackdrop');
}
$('#btnEditarCuenta').addEventListener('click', abrirModalCuenta);
$('#btnCerrarModalCuenta').addEventListener('click', () => ocultarModal('modalCuenta', 'modalCuentaBackdrop'));
$('#modalCuentaBackdrop').addEventListener('click', () => ocultarModal('modalCuenta', 'modalCuentaBackdrop'));

function mostrarMensajeCuenta(texto, esError) {
  el.cuentaMsg.textContent = texto;
  el.cuentaMsg.classList.toggle('is-error', !!esError);
}

async function reautenticar(passwordActual) {
  const credencial = EmailAuthProvider.credential(auth.currentUser.email, passwordActual);
  await reauthenticateWithCredential(auth.currentUser, credencial);
}

$('#btnGuardarNombre').addEventListener('click', () => conProteccionDoble($('#btnGuardarNombre'), async () => {
  const nombre = el.inputCuentaNombre.value.trim();
  if (!nombre) { mostrarMensajeCuenta('Escribe un nombre válido.', true); return; }
  try {
    await updateProfile(auth.currentUser, { displayName: nombre });
    renderSaludo(auth.currentUser);
    mostrarMensajeCuenta('Nombre actualizado ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
}));

$('#btnCambiarCorreo').addEventListener('click', () => conProteccionDoble($('#btnCambiarCorreo'), async () => {
  const nuevoCorreo = el.inputCuentaNuevoCorreo.value.trim();
  const passwordActual = el.inputCuentaPasswordCorreo.value;
  if (!nuevoCorreo) { mostrarMensajeCuenta('Escribe el nuevo correo.', true); return; }
  if (!passwordActual) { mostrarMensajeCuenta('Escribe tu contraseña actual para confirmar.', true); return; }
  try {
    await reautenticar(passwordActual);
    await updateEmail(auth.currentUser, nuevoCorreo);
    el.cuentaEmail.textContent = nuevoCorreo;
    el.inputCuentaNuevoCorreo.value = ''; el.inputCuentaPasswordCorreo.value = '';
    mostrarMensajeCuenta('Correo actualizado ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
}));

$('#btnCambiarPassword').addEventListener('click', () => conProteccionDoble($('#btnCambiarPassword'), async () => {
  const nuevaPassword = el.inputCuentaNuevaPassword.value;
  const passwordActual = el.inputCuentaPasswordActual.value;
  if (!nuevaPassword || nuevaPassword.length < 6) { mostrarMensajeCuenta('La nueva contraseña debe tener al menos 6 caracteres.', true); return; }
  if (!passwordActual) { mostrarMensajeCuenta('Escribe tu contraseña actual para confirmar.', true); return; }
  try {
    await reautenticar(passwordActual);
    await updatePassword(auth.currentUser, nuevaPassword);
    el.inputCuentaNuevaPassword.value = ''; el.inputCuentaPasswordActual.value = '';
    mostrarMensajeCuenta('Contraseña actualizada ✅', false);
  } catch (err) { mostrarMensajeCuenta(mensajeErrorAuth(err.code), true); }
}));
