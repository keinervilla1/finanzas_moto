/**
 * EVENT EMITTER - Sistema de eventos
 * 
 * Base para comunicación entre módulos sin acoplamiento
 */

export class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  /**
   * Suscribirse a un evento
   * @param {string} eventName - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   * @returns {Function} Función para desuscribirse
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(callback);

    // Retornar función para desuscribirse
    return () => this.off(eventName, callback);
  }

  /**
   * Suscribirse una sola vez
   */
  once(eventName, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }

  /**
   * Desuscribirse de un evento
   */
  off(eventName, callback) {
    if (!this.events.has(eventName)) return;
    const callbacks = this.events.get(eventName);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  /**
   * Emitir un evento
   */
  emit(eventName, data) {
    if (!this.events.has(eventName)) return;
    this.events.get(eventName).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error en evento ${eventName}:`, error);
      }
    });
  }

  /**
   * Limpiar todos los listeners
   */
  clear() {
    this.events.clear();
  }
}

// Instancia global
export const GlobalEventEmitter = new EventEmitter();