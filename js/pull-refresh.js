/* =========================================================================
   DOMI — Pull to refresh
   Arrastrar hacia abajo desde el tope de la pantalla recarga la app (como en
   cualquier app nativa). Con el service worker "red primero" esto trae también
   la última versión desplegada.
   ========================================================================= */

import { el } from './dom.js';

const UMBRAL = 72;   // px que hay que arrastrar para que dispare
const MAX = 120;     // tope visual del arrastre

const scroller = document.getElementById('screens');

const indicador = document.createElement('div');
indicador.className = 'pull-refresh';
indicador.innerHTML = '<div class="pull-refresh__spinner"></div>';
document.body.appendChild(indicador);

let startY = 0;
let arrastrando = false;
let distancia = 0;

function bloqueado() {
  // No interferir con la pantalla de login ni con hojas/modales abiertos.
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

function pintar(d) {
  // Rubber-band: pasado el umbral cada vez cuesta más.
  const visual = d <= UMBRAL ? d : UMBRAL + (d - UMBRAL) * 0.35;
  const y = Math.min(visual, MAX);
  indicador.style.transform = `translateX(-50%) translateY(${Math.max(-44, y - 44)}px)`;
  indicador.style.opacity = String(Math.min(1, d / UMBRAL));
  indicador.classList.toggle('lista', d >= UMBRAL);
}

function reset() {
  indicador.style.transition = 'transform .25s ease, opacity .25s ease';
  indicador.style.transform = 'translateX(-50%) translateY(-44px)';
  indicador.style.opacity = '0';
  indicador.classList.remove('lista');
  setTimeout(() => { indicador.style.transition = ''; }, 260);
}

scroller.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1 || scroller.scrollTop > 0 || bloqueado()) { arrastrando = false; return; }
  startY = e.touches[0].clientY;
  distancia = 0;
  arrastrando = true;
}, { passive: true });

scroller.addEventListener('touchmove', (e) => {
  if (!arrastrando) return;
  distancia = e.touches[0].clientY - startY;
  if (distancia <= 0 || scroller.scrollTop > 0) { arrastrando = false; reset(); return; }
  e.preventDefault(); // frena el scroll/rebote nativo mientras tiramos
  pintar(distancia);
}, { passive: false });

function soltar() {
  if (!arrastrando) return;
  arrastrando = false;
  if (distancia >= UMBRAL) {
    indicador.classList.add('spin');
    indicador.style.transform = 'translateX(-50%) translateY(16px)';
    indicador.style.opacity = '1';
    setTimeout(() => location.reload(), 350);
  } else {
    reset();
  }
}
scroller.addEventListener('touchend', soltar);
scroller.addEventListener('touchcancel', soltar);
