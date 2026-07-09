/**
 * CONSTANTES GLOBALES - v1.5
 * 
 * Centro único de verdad para configuración y constantes
 */

export const APP_CONFIG = Object.freeze({
  VERSION: '1.5',
  ENV: 'production',
  
  // Firebase
  FIREBASE: {
    USE_CACHE: true,
    CACHE_EXPIRATION_MS: 5 * 60 * 1000, // 5 minutos
    SYNC_INTERVAL_MS: 30 * 1000, // 30 segundos
  },

  // Datos
  DEFAULTS: {
    META_SEMANAL: 800000,
    MONEDA: 'COP',
  },

  // UI
  UI: {
    SHEET_ANIMATION_MS: 300,
    DEBOUNCE_SEARCH_MS: 300,
    DEBOUNCE_FILTER_MS: 200,
    VIRTUAL_SCROLL_ITEM_HEIGHT: 60,
  },

  // Paginación
  PAGINATION: {
    REGISTROS_PER_PAGE: 50,
    GASTOS_PER_PAGE: 50,
    CLIENTES_PER_PAGE: 100,
  },

  // Categorías de gasto
  EXPENSE_CATEGORIES: {
    gasolina: { emoji: '⛽', label: 'Gasolina' },
    comida: { emoji: '🍽️', label: 'Comida' },
    mantenimiento: { emoji: '🔧', label: 'Mantenimiento' },
    peajes: { emoji: '🛣️', label: 'Peajes' },
    otros: { emoji: '📦', label: 'Otros' },
  },

  // Medios de pago
  PAYMENT_METHODS: {
    efectivo: { label: 'Efectivo', icon: '💵' },
    transferencia: { label: 'Transferencia', icon: '🏦' },
  },

  // Estados de deuda
  DEBT_STATUS: {
    FRESH: { emoji: '🟢', label: '0-2 días', days: 2 },
    NORMAL: { emoji: '🟡', label: '3-5 días', days: 5 },
    WARNING: { emoji: '🟠', label: '6-10 días', days: 10 },
    CRITICAL: { emoji: '🔴', label: '+10 días', days: Infinity },
  },
});

// Validaciones
export const VALIDATION_RULES = Object.freeze({
  NOMBRE_MIN_LENGTH: 2,
  NOMBRE_MAX_LENGTH: 100,
  VALOR_MIN: 100,
  VALOR_MAX: 10000000,
  DESCRIPTION_MAX_LENGTH: 500,
});

// Rutas de pantallas
export const SCREENS = Object.freeze({
  HOME: 'inicio',
  WEEK: 'semana',
  RECORDS: 'registros',
  DEBT: 'deben',
  EXPENSES: 'gastos',
  FREQUENT: 'frecuentes',
});

// Eventos del sistema
export const SYSTEM_EVENTS = Object.freeze({
  // Estado
  STATE_CHANGED: 'state:changed',
  USER_LOGGED_IN: 'user:loggedIn',
  USER_LOGGED_OUT: 'user:loggedOut',
  
  // Datos
  ENTREGAS_UPDATED: 'entregas:updated',
  GASTOS_UPDATED: 'gastos:updated',
  DEUDAS_UPDATED: 'deudas:updated',
  CLIENTES_UPDATED: 'clientes:updated',
  
  // UI
  SCREEN_CHANGED: 'screen:changed',
  SHEET_OPENED: 'sheet:opened',
  SHEET_CLOSED: 'sheet:closed',
  MODAL_OPENED: 'modal:opened',
  MODAL_CLOSED: 'modal:closed',
  
  // Conexión
  ONLINE: 'connection:online',
  OFFLINE: 'connection:offline',
  SYNC_START: 'sync:start',
  SYNC_END: 'sync:end',
  SYNC_ERROR: 'sync:error',
});