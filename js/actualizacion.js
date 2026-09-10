/* =========================================================================
   DOMI — Actualización de la app
   Registra el service worker y avisa con un banner "Actualizar" cuando hay una
   versión nueva desplegada. Para recargar a mano está el pull-to-refresh
   (js/pull-refresh.js).
   ========================================================================= */

let banner;
function mostrarBannerActualizar() {
  if (banner) return;
  banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = '<span>Hay una versión nueva de Domi</span><button type="button">Actualizar</button>';
  banner.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
}

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
