/* =========================================================================
   DOMI — Pull to refresh
   Arrastrar hacia abajo desde el tope de la pantalla recarga la app (como en
   cualquier app nativa). Con el service worker "red primero" esto trae también
   la última versión desplegada.

   Diseño para que NO estorbe el scroll normal:
   - Solo cuenta si el touch empieza con la lista arriba de todo.
   - Hay una "zona muerta" (ACTIVACION): mientras el arrastre sea menor que eso,
     no bloqueamos nada y el scroll funciona igual.
   - Si el dedo se mueve hacia arriba en cualquier momento, se suelta el gesto y
     el scroll vuelve a mandar.
   - El umbral para disparar la recarga es largo y a propósito.
   ========================================================================= */

import { el } from './dom.js';

const ACTIVACION = 16;   // px de arrastre antes de "engancharnos"
const UMBRAL = 115;      // px (ya descontada la activación) para disparar
const MAX = 165;         // tope visual del arrastre

const scroller = document.getElementById('screens');

const indicador = document.createElement('div');
indicador.className = 'pull-refresh';
indicador.innerHTML = '<div class="pull-refresh__spinner"></div>';
document.body.appendChild(indicador);

let startY = 0;
let candidato = false;   // touchstart válido (lista arriba de todo), a la espera
let activo = false;      // ya es un pull: bloqueamos el scroll y movemos el indicador
let distancia = 0;
let recargando = false;

function bloqueado() {
  return el.appContainer.style.display === 'none'
    || document.querySelector('.sheet.show, .modal.show, .sheet-backdrop.show, .modal-backdrop.show');
}

function pintar(d) {
  const visual = d <= UMBRAL ? d : UMBRAL + (d - UMBRAL) * 0.4;
  const y = Math.min(visual, MAX);
  indicador.style.transform = `translateX(-50%) translateY(${Math.max(-44, y * 0.6 - 44)}px)`;
  indicador.style.opacity = String(Math.min(1, d / (UMBRAL * 0.6)));
  indicador.classList.toggle('lista', d >= UMBRAL);
}

function ocultarIndicador() {
  indicador.style.transition = 'transform .25s ease, opacity .25s ease';
  indicador.style.transform = 'translateX(-50%) translateY(-44px)';
  indicador.style.opacity = '0';
  indicador.classList.remove('lista');
  setTimeout(() => { indicador.style.transition = ''; }, 260);
}

function soltarGesto() {
  candidato = false;
  activo = false;
  distancia = 0;
}

scroller.addEventListener('touchstart', (e) => {
  candidato = false;
  activo = false;
  if (e.touches.length !== 1 || scroller.scrollTop > 0 || bloqueado() || recargando) return;
  startY = e.touches[0].clientY;
  distancia = 0;
  candidato = true;
}, { passive: true });

scroller.addEventListener('touchmove', (e) => {
  if (!candidato) return;

  const dy = e.touches[0].clientY - startY;

  // Movimiento hacia arriba, o la lista ya se movió: no es un pull → devolver el
  // control al scroll y no volver a interferir en este toque.
  if (dy <= 0 || scroller.scrollTop > 0) {
    if (activo) ocultarIndicador();
    soltarGesto();
    return;
  }

  // Todavía dentro de la zona muerta: dejar que el navegador scrollee normal.
  if (!activo) {
    if (dy < ACTIVACION) return;
    activo = true;
  }

  e.preventDefault();                 // a partir de aquí sí mandamos nosotros
  distancia = dy - ACTIVACION;
  pintar(distancia);
}, { passive: false });

function alSoltar() {
  if (!activo) { soltarGesto(); return; }
  const disparar = distancia >= UMBRAL;
  soltarGesto();

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
}
scroller.addEventListener('touchend', alSoltar);
scroller.addEventListener('touchcancel', alSoltar);
