/**
 * VALIDADORES
 * 
 * Funciones para validar datos de entrada
 */

import { VALIDATION_RULES } from '../core/constants.js';

export function validarNombre(nombre) {
  if (!nombre) return { valido: false, error: 'El nombre es requerido' };
  if (nombre.length < VALIDATION_RULES.NOMBRE_MIN_LENGTH) {
    return { valido: false, error: 'El nombre es muy corto' };
  }
  if (nombre.length > VALIDATION_RULES.NOMBRE_MAX_LENGTH) {
    return { valido: false, error: 'El nombre es muy largo' };
  }
  return { valido: true };
}

export function validarValor(valor) {
  const num = Number(valor);
  if (isNaN(num)) return { valido: false, error: 'El valor debe ser un número' };
  if (num < VALIDATION_RULES.VALOR_MIN) {
    return { valido: false, error: `Mínimo ${VALIDATION_RULES.VALOR_MIN}` };
  }
  if (num > VALIDATION_RULES.VALOR_MAX) {
    return { valido: false, error: `Máximo ${VALIDATION_RULES.VALOR_MAX}` };
  }
  return { valido: true };
}

export function validarFormularioDomicilio(datos) {
  const errores = [];
  
  const nombreVal = validarNombre(datos.nombre);
  if (!nombreVal.valido) errores.push(nombreVal.error);
  
  const valorVal = validarValor(datos.valor);
  if (!valorVal.valido) errores.push(valorVal.error);
  
  return {
    valido: errores.length === 0,
    errores,
  };
}

export function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validarContrasena(password) {
  return password && password.length >= 6;
}