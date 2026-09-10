/* =========================================================================
   DOMI — Pestañita "Toca para actualizar"
   Aparece solo cuando la lista está arriba de todo. Se toca (o se arrastra
   hacia abajo) para recargar la app. Con el service worker "red primero" eso
   trae la última versión desplegada.

   El gesto se hace SOBRE la pestañita (que va por encima de todo cuando está
   visible), no sobre la lista → nunca se dispara por accidente al scrollear.
   ========================================================================= */

import { el } from './dom.js';

const UMBRAL = 55;   // px de arrastre para que el pull dispare
const TAP_MAX = 8;   // px de movimiento por debajo de esto = fue un toque

const scroller = document.getElementById('screens');
const tab = document.getElementById('refreshTab');
const texto = tab.querySelector('.refresh-tab__text');
const TXT_NORMAL = 'Toca para actualizar';
const TXT_LISTO = 'Suelta para actualizar';
texto.textContent = TXT_NORMAL;

let recargando = false;

function bloqueado() {
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

function actualizarVisibilidad() {
  tab.classList.toggle('visible', !recargando && !bloqueado() && scroller.scrollTop < 6);
}
scroller.addEventListener('scroll', actualizarVisibilidad, { passive: true });
document.addEventListener('visibilitychange', actualizarVisibilidad);
new MutationObserver(actualizarVisibilidad).observe(el.appContainer, {
  attributes: true, attributeFilter: ['style']
});
setTimeout(actualizarVisibilidad, 400);

function refrescar() {
  if (recargando) return;
  recargando = true;
  tab.classList.add('spin', 'lista');
  texto.textContent = 'Actualizando…';
  setTimeout(() => location.reload(), 350);
}

/* --- Arrastre / toque sobre la pestañita --- */
let startY = 0;
let maxDist = 0;
let arrastrando = false;
let huboTouch = false;

tab.addEventListener('touchstart', (e) => {
  if (recargando) return;
  huboTouch = true;
  startY = e.touches[0].clientY;
  maxDist = 0;
  arrastrando = true;
  tab.style.transition = 'background .2s ease';
}, { passive: true });

tab.addEventListener('touchmove', (e) => {
  if (!arrastrando) return;
  const d = Math.max(0, e.touches[0].clientY - startY);
  maxDist = Math.max(maxDist, d);
  if (d > 4) e.preventDefault();
  const y = d <= UMBRAL ? d : UMBRAL + (d - UMBRAL) * 0.28;
  tab.style.transform = `translateX(-50%) translateY(${Math.min(y, 66)}px)`;
  const listo = d >= UMBRAL;
  tab.classList.toggle('lista', listo);
  texto.textContent = listo ? TXT_LISTO : TXT_NORMAL;
}, { passive: false });

function soltar() {
  if (!arrastrando) return;
  arrastrando = false;
  tab.style.transition = '';
  tab.style.transform = '';
  if (maxDist < TAP_MAX || maxDist >= UMBRAL) {
    refrescar();
  } else {
    tab.classList.remove('lista');
    texto.textContent = TXT_NORMAL;
  }
}
tab.addEventListener('touchend', soltar);
tab.addEventListener('touchcancel', () => {
  arrastrando = false;
  tab.style.transition = '';
  tab.style.transform = '';
  tab.classList.remove('lista');
  texto.textContent = TXT_NORMAL;
});

/* --- Clic con mouse (escritorio): el touch ya se maneja arriba --- */
tab.addEventListener('click', () => {
  if (huboTouch) { huboTouch = false; return; }
  refrescar();
});
