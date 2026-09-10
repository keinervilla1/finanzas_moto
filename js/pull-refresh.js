/* =========================================================================
   DOMI — Arrastrar para actualizar
   Estando arriba de todo, arrastra el contenido hacia abajo: sigue tu dedo con
   rebote y, si lo sueltas pasado el umbral, recarga la app.

   Para no confundirse con un scroll:
   - El toque tiene que EMPEZAR con la lista arriba de todo (scrollTop 0).
   - Solo se engancha si el arrastre es "de verdad": pasó cierta distancia y
     tardó lo suyo. Un flick / scroll con impulso cubre esa distancia en un
     instante, así que no cuenta.
   - Cualquier movimiento hacia arriba lo suelta.
   ========================================================================= */

import { el } from './dom.js';

const DIST_MIN = 24;     // px de dedo antes de considerar "enganchar"
const V_MAX = 1.5;       // px/ms del arranque: por encima es un flick (scroll), no un pull
const RESIST = 0.5;      // el contenido baja la mitad de lo que baja el dedo
const UMBRAL = 58;       // px de desplazamiento del contenido para disparar
const MAX = 88;

const scroller = document.getElementById('screens');
const spinner = document.getElementById('pullSpinner');

let startY = 0;
let startT = 0;
let candidato = false;   // el toque empezó bien (arriba de todo)
let activo = false;      // ya estamos moviendo el contenido
let abortado = false;
let offset = 0;
let recargando = false;

function bloqueado() {
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

function poner(px) {
  offset = px;
  const p = Math.min(1, px / UMBRAL);
  scroller.style.transform = px > 0 ? `translateY(${px}px)` : '';
  spinner.style.opacity = px > 3 ? String(0.35 + p * 0.65) : '0';
  spinner.style.transform = `translateX(-50%) scale(${0.6 + p * 0.4}) rotate(${px * 3.4}deg)`;
  spinner.classList.toggle('armado', px >= UMBRAL);
}

function animarA(px, luego) {
  scroller.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
  spinner.style.transition = 'opacity .25s ease, transform .3s ease';
  poner(px);
  clearTimeout(animarA._t);
  animarA._t = setTimeout(() => {
    scroller.style.transition = '';
    spinner.style.transition = 'opacity .15s ease';
    if (luego) luego();
  }, 320);
}

scroller.addEventListener('touchstart', (e) => {
  candidato = false;
  activo = false;
  abortado = false;
  if (e.touches.length !== 1 || recargando || bloqueado()) return;
  if (scroller.scrollTop > 0) return;      // no se puede empezar a media lista
  startY = e.touches[0].clientY;
  startT = performance.now();
  candidato = true;
}, { passive: true });

scroller.addEventListener('touchmove', (e) => {
  if (!candidato || abortado) return;

  const dy = e.touches[0].clientY - startY;

  // Movimiento hacia arriba, o la lista se movió: no es un pull.
  if (dy <= 0 || scroller.scrollTop > 0) {
    if (activo) { animarA(0); activo = false; }
    abortado = true;
    return;
  }

  if (!activo) {
    if (dy < DIST_MIN) return;                       // aún poco: dejar scrollear
    const v = dy / Math.max(1, performance.now() - startT); // px/ms del arranque
    if (v > V_MAX) { abortado = true; return; }      // fue un flick, no un pull
    activo = true;
    scroller.style.transition = '';
    spinner.style.transition = 'none';
  }

  e.preventDefault();
  poner(Math.min((dy - DIST_MIN) * RESIST, MAX));
}, { passive: false });

function soltar() {
  candidato = false;
  if (!activo) return;
  activo = false;

  if (offset >= UMBRAL && !recargando) {
    recargando = true;
    spinner.classList.add('spin');
    animarA(UMBRAL);
    setTimeout(() => location.reload(), 550);
  } else {
    animarA(0);
  }
}
scroller.addEventListener('touchend', soltar);
scroller.addEventListener('touchcancel', () => {
  candidato = false;
  if (activo) animarA(0);
  activo = false;
});
