/* =========================================================================
   DOMI — Configuración y constantes
   Valores fijos de la app agrupados en un solo sitio (requisito de
   mantenibilidad del proyecto). Sin lógica: solo datos.
   ========================================================================= */

/** Meta semanal por defecto para un usuario nuevo (pesos colombianos). */
export const META_SEMANAL_DEFAULT = 800000;

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const CATEGORIAS_GASTO = {
  gasolina: { emoji: '⛽', label: 'Gasolina' },
  comida: { emoji: '🍽️', label: 'Comida' },
  mantenimiento: { emoji: '🔧', label: 'Mantenimiento' },
  peajes: { emoji: '🛣️', label: 'Peajes' },
  otros: { emoji: '📦', label: 'Otros' }
};

/* ---------------------------- Navegación --------------------------------- */

/** Clave en localStorage para recordar la última pestaña abierta. */
export const CLAVE_ULTIMA_PESTANA = 'domi_ultima_pestana';

/** Pestañas del menú inferior que se recuerdan y se restauran al reabrir. */
export const PESTANAS_PERSISTENTES = ['inicio', 'semana', 'registros', 'deben', 'frecuentes'];

/** Subpantallas sin botón propio en la barra: qué pestaña resaltar mientras
 *  están abiertas. */
export const TAB_CONTENEDOR = { gastos: 'frecuentes' };
