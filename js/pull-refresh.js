/* =========================================================================
   DOMI — Arrastrar para actualizar
   Estando arriba de todo, si arrastras el contenido hacia abajo, sigue tu
   dedo con rebote y, si lo sueltas pasado el umbral, recarga la app. Con el
   service worker "red primero" eso trae la última versión desplegada.

   Para que NUNCA se confunda con un scroll:
   - No se puede iniciar si hubo scroll en los últimos 220 ms (tiene que estar
     quieto arriba de todo).
   - Hay una zona muerta antes de engancharse: los toques pequeños pasan.
   - Cualquier movimiento hacia arriba lo suelta y devuelve el control.
   ========================================================================= */

import { el } from './dom.js';

const REPOSO_MS = 220;   // sin scroll este tiempo para poder tirar
const ACTIVACION = 12;   // px de dedo antes de engancharnos
const RESIST = 0.5;      // el contenido baja la mitad de lo que baja el dedo
const UMBRAL = 62;       // px de desplazamiento del contenido para disparar
const MAX = 92;          // tope de desplazamiento

const scroller = document.getElementById('screens');
const spinner = document.getElementById('pullSpinner');

let ultimoScrollMs = 0;
scroller.addEventListener('scroll', () => { ultimoScrollMs = performance.now(); }, { passive: true });

let startY = 0;
let candidato = false;
let activo = false;
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
  spinner.style.opacity = px > 3 ? String(p) : '0';
  spinner.style.transform = `translateX(-50%) scale(${0.6 + p * 0.4}) rotate(${px * 3.2}deg)`;
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
  if (e.touches.length !== 1 || recargando || bloqueado()) return;
  if (scroller.scrollTop > 0) return;
  if (performance.now() - ultimoScrollMs < REPOSO_MS) return;
  startY = e.touches[0].clientY;
  candidato = true;
}, { passive: true });

scroller.addEventListener('touchmove', (e) => {
  if (!candidato) return;
  const dy = e.touches[0].clientY - startY;

  if (dy <= 0 || scroller.scrollTop > 0) {
    if (activo) animarA(0);
    candidato = false;
    activo = false;
    return;
  }
  if (!activo) {
    if (dy < ACTIVACION) return;
    activo = true;
    scroller.style.transition = '';
    spinner.style.transition = 'none';
  }
  e.preventDefault();
  const bruto = (dy - ACTIVACION) * RESIST;
  poner(Math.min(bruto, MAX));
}, { passive: false });

function soltar() {
  if (!activo) { candidato = false; return; }
  candidato = false;
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
scroller.addEventListener('touchcancel', () => { if (activo) animarA(0); candidato = false; activo = false; });
