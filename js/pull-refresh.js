/* =========================================================================
   DOMI — Pestañita "Desliza para actualizar"
   Aparece solo cuando la lista está arriba de todo. Se puede tocar o
   arrastrar hacia abajo para recargar la app (con el service worker
   "red primero" eso trae la última versión desplegada).

   Es un control propio y visible: nunca se dispara por accidente al
   scrollear, porque el gesto se hace SOBRE la pestañita, no sobre la lista.
   ========================================================================= */

import { el } from './dom.js';

const UMBRAL = 60;   // px de arrastre para que dispare

const scroller = document.getElementById('screens');
const tab = document.getElementById('refreshTab');
const texto = tab.querySelector('.refresh-tab__text');
const TXT_NORMAL = 'Desliza para actualizar';
const TXT_LISTO = 'Suelta para actualizar';

let recargando = false;

function bloqueado() {
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

/* --- Mostrar/ocultar según el scroll --- */
function actualizarVisibilidad() {
  const mostrar = !recargando && !bloqueado() && scroller.scrollTop < 6;
  tab.classList.toggle('visible', mostrar);
}
scroller.addEventListener('scroll', actualizarVisibilidad, { passive: true });
document.addEventListener('visibilitychange', actualizarVisibilidad);
// Reaccionar al iniciar/cerrar sesión (aparece/desaparece #appContainer).
new MutationObserver(actualizarVisibilidad).observe(el.appContainer, {
  attributes: true, attributeFilter: ['style']
});
setTimeout(actualizarVisibilidad, 400);

/* --- Disparo --- */
function refrescar() {
  if (recargando) return;
  recargando = true;
  tab.classList.add('spin', 'lista');
  texto.textContent = 'Actualizando';
  setTimeout(() => location.reload(), 350);
}

/* --- Arrastre sobre la pestañita --- */
let startY = 0;
let arrastrando = false;
let movido = false;
let distancia = 0;

tab.addEventListener('touchstart', (e) => {
  if (recargando) return;
  startY = e.touches[0].clientY;
  arrastrando = true;
  movido = false;
  distancia = 0;
  tab.style.transition = 'background .2s ease, color .2s ease';
}, { passive: true });

tab.addEventListener('touchmove', (e) => {
  if (!arrastrando) return;
  distancia = Math.max(0, e.touches[0].clientY - startY);
  if (distancia > 6) movido = true;
  e.preventDefault(); // el gesto es de la pestañita, no de la página
  const y = distancia <= UMBRAL ? distancia : UMBRAL + (distancia - UMBRAL) * 0.28;
  tab.style.transform = `translateX(-50%) translateY(${Math.min(y, 74)}px)`;
  const listo = distancia >= UMBRAL;
  tab.classList.toggle('lista', listo);
  texto.textContent = listo ? TXT_LISTO : TXT_NORMAL;
}, { passive: false });

function soltar() {
  if (!arrastrando) return;
  arrastrando = false;
  tab.style.transition = '';
  tab.style.transform = '';
  if (distancia >= UMBRAL) {
    refrescar();
  } else {
    tab.classList.remove('lista');
    texto.textContent = TXT_NORMAL;
  }
  distancia = 0;
}
tab.addEventListener('touchend', soltar);
tab.addEventListener('touchcancel', soltar);

/* --- Tap / clic (también sirve como botón) --- */
tab.addEventListener('click', () => {
  if (movido) { movido = false; return; } // fue un arrastre, no un tap
  refrescar();
});
