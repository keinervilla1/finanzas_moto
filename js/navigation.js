/* =========================================================================
   DOMI — Navegación entre pantallas
   Un único camino para cambiar de pantalla (resalta el botón, resetea el
   scroll, dispara la carga bajo demanda y recuerda la pestaña principal).
   ========================================================================= */

import { CLAVE_ULTIMA_PESTANA, PESTANAS_PERSISTENTES, TAB_CONTENEDOR } from './config.js';
import { registros, historialSemanas } from './state.js';
import { cargarRegistros, cargarHistorialSemanas, cargarGastosVista } from './render.js';

/** Se usa igual para los clics del usuario y para la restauración al iniciar. */
export function irAPestana(screen) {
  const pantalla = document.getElementById('screen-' + screen);
  if (!pantalla) return; // pantalla desconocida (dato viejo en localStorage, por ejemplo)
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  pantalla.classList.add('active');
  const tabActiva = TAB_CONTENEDOR[screen] || screen;
  document.querySelectorAll('.tabbar__item').forEach(b => b.classList.toggle('active', b.dataset.screen === tabActiva));
  document.getElementById('screens').scrollTop = 0;
  if (PESTANAS_PERSISTENTES.includes(screen)) localStorage.setItem(CLAVE_ULTIMA_PESTANA, screen);

  if (screen === 'registros' && registros.items.length === 0) cargarRegistros(true);
  if (screen === 'semana' && !historialSemanas.cargado) cargarHistorialSemanas();
  if (screen === 'gastos') cargarGastosVista();
}

document.querySelectorAll('.tabbar__item').forEach(btn => {
  btn.addEventListener('click', () => irAPestana(btn.dataset.screen));
});

// El chip "Te deben" de la pantalla Inicio es un acceso directo a "Deben".
const chipDeben = document.getElementById('chipDeben');
if (chipDeben) chipDeben.addEventListener('click', () => irAPestana('deben'));
