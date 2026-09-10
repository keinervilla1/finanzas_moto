/* =========================================================================
   DOMI — Pull to refresh
   Arrastrar hacia abajo desde el tope recarga la app. Con el service worker
   "red primero" esto trae también la última versión desplegada.

   Está pensado para NO confundirse nunca con un scroll:
   - Solo se puede iniciar si la lista está quieta arriba de todo (sin scroll
     en los últimos 250 ms).
   - Los movimientos rápidos (flicks) se ignoran: un pull es lento y deliberado.
   - Cualquier movimiento hacia arriba cancela el gesto para siempre en ese
     toque y devuelve el control al scroll.
   - El umbral para disparar es largo (130 px de arrastre real).
   ========================================================================= */

import { el } from './dom.js';

const REPOSO_MS = 250;     // hay que estar sin scrollear este tiempo para poder tirar
const ACTIVACION = 40;     // px de arrastre lento antes de "engancharnos"
const UMBRAL = 130;        // px (ya descontada la activación) para disparar la recarga
const MAX = 190;
const V_MAX = 1.1;         // px/ms: por encima de esto es un flick, no un pull

const scroller = document.getElementById('screens');

const indicador = document.createElement('div');
indicador.className = 'pull-refresh';
indicador.innerHTML = '<div class="pull-refresh__spinner"></div>';
document.body.appendChild(indicador);

let ultimoScrollMs = 0;
scroller.addEventListener('scroll', () => { ultimoScrollMs = performance.now(); }, { passive: true });

let startY = 0;
let prevY = 0;
let prevT = 0;
let candidato = false;
let activo = false;
let distancia = 0;
let recargando = false;

function bloqueado() {
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

function pintar(d) {
  const visual = d <= UMBRAL ? d : UMBRAL + (d - UMBRAL) * 0.35;
  const y = Math.min(visual, MAX);
  indicador.style.transform = `translateX(-50%) translateY(${Math.max(-44, y * 0.55 - 44)}px)`;
  indicador.style.opacity = String(Math.min(1, d / (UMBRAL * 0.55)));
  indicador.classList.toggle('lista', d >= UMBRAL);
}

function ocultarIndicador() {
  indicador.style.transition = 'transform .25s ease, opacity .25s ease';
  indicador.style.transform = 'translateX(-50%) translateY(-44px)';
  indicador.style.opacity = '0';
  indicador.classList.remove('lista');
  setTimeout(() => { indicador.style.transition = ''; }, 260);
}

/** Suelta el gesto y, si estábamos mostrando el indicador, lo esconde. */
function cancelar() {
  if (activo) ocultarIndicador();
  candidato = false;
  activo = false;
  distancia = 0;
}

scroller.addEventListener('touchstart', (e) => {
  candidato = false;
  activo = false;
  if (e.touches.length !== 1 || recargando || bloqueado()) return;
  if (scroller.scrollTop > 0) return;
  if (performance.now() - ultimoScrollMs < REPOSO_MS) return; // aún scrolleando
  const y = e.touches[0].clientY;
  startY = prevY = y;
  prevT = performance.now();
  distancia = 0;
  candidato = true;
}, { passive: true });

scroller.addEventListener('touchmove', (e) => {
  if (!candidato) return;

  const now = performance.now();
  const y = e.touches[0].clientY;
  const dy = y - startY;
  const v = (y - prevY) / Math.max(1, now - prevT); // px/ms del último tramo
  prevY = y;
  prevT = now;

  // Hacia arriba, o la lista se movió: no es un pull. Cancelar de forma
  // definitiva para este toque.
  if (dy <= 0 || scroller.scrollTop > 0) { cancelar(); return; }

  // Todavía en la zona muerta.
  if (!activo) {
    // Flick rápido hacia abajo → es un intento de scroll, no un pull.
    if (v > V_MAX) { candidato = false; return; }
    if (dy < ACTIVACION) return;
    activo = true;
  }

  e.preventDefault();
  distancia = dy - ACTIVACION;
  pintar(distancia);
}, { passive: false });

function alSoltar() {
  if (!activo) { candidato = false; return; }
  const disparar = distancia >= UMBRAL;
  candidato = false;
  activo = false;

  if (disparar) {
    recargando = true;
    indicador.classList.add('spin', 'lista');
    indicador.style.transition = 'transform .2s ease';
    indicador.style.transform = 'translateX(-50%) translateY(20px)';
    indicador.style.opacity = '1';
    setTimeout(() => location.reload(), 400);
  } else {
    ocultarIndicador();
  }
  distancia = 0;
}
scroller.addEventListener('touchend', alSoltar);
scroller.addEventListener('touchcancel', alSoltar);
