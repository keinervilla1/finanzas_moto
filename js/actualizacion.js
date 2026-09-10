/* =========================================================================
   DOMI — Actualización de la app
   Registra el service worker y avisa cuando hay una versión nueva lista, con
   un banner "Actualizar". También ata el botón manual "Recargar" de la
   pestaña "Más" (útil en la PWA instalada, que no tiene barra de navegador).
   ========================================================================= */

let recargando = false;
function recargar() {
  if (recargando) return;
  recargando = true;
  location.reload();
}

let banner;
function mostrarBannerActualizar() {
  if (banner) return;
  banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = '<span>Hay una versión nueva de Domi</span><button type="button">Actualizar</button>';
  banner.querySelector('button').addEventListener('click', recargar);
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
}

// Botón manual (siempre disponible, aunque no haya actualización pendiente).
const btnRecargar = document.getElementById('btnRecargarApp');
if (btnRecargar) btnRecargar.addEventListener('click', recargar);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.warn('No se pudo registrar el service worker:', err);
      return;
    }

    // Ya había una versión nueva esperando al abrir.
    if (reg.waiting && navigator.serviceWorker.controller) mostrarBannerActualizar();

    // Aparece una versión nueva mientras la app está abierta.
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          mostrarBannerActualizar();
        }
      });
    });

    // Al volver a la app (cambiar de pestaña, reabrir la PWA), buscar si hay
    // una versión nueva desplegada.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  });
}
