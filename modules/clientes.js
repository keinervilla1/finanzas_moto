/* =========================================================================
   MÓDULO CLIENTES - v1.2
   
   Gestión de cuentas por cobrar agrupadas por cliente.
   Estructura de datos:
   - usuarios/{uid}/clientes/{clienteId}
   - usuarios/{uid}/clientes/{clienteId}/pagos/{pagoId}
   
   Permite:
   - Agrupar automáticamente domicilios pendientes por cliente
   - Registrar pagos completos y parciales
   - Conservar historial de pagos
   - Sumar pagos a ingresos en la fecha que se reciben
   - Extensión futura: teléfono, dirección, notas, estadísticas
   ========================================================================= */

/**
 * Estado de clientes (en memoria, sincronizado en tiempo real)
 */
const ClientesState = Object.freeze({
  items: [],           // Array de clientes con su saldo pendiente
  pagosHistorial: []   // Historial de todos los pagos registrados
});

/**
 * Crea o actualiza un cliente automáticamente cuando hay domicilios pendientes
 * Si no existe, lo crea. Si existe, solo actualiza el saldo.
 */
async function sincronizarClientesDesdeEntregas() {
  if (!currentUid) return;
  
  // Agrupar deudas (entregas sin pagar) por cliente
  const deudasPorCliente = {};
  
  AppState.deudas.forEach(entrega => {
    if (!deudasPorCliente[entrega.nombre]) {
      deudasPorCliente[entrega.nombre] = {
        nombre: entrega.nombre,
        saldoPendiente: 0,
        domicilios: []
      };
    }
    deudasPorCliente[entrega.nombre].saldoPendiente += Number(entrega.valor);
    deudasPorCliente[entrega.nombre].domicilios.push({
      id: entrega.id,
      valor: entrega.valor,
      fecha: entrega.fecha,
      tipo: entrega.tipo
    });
  });
  
  // Crear o actualizar clientes en Firestore
  for (const nombre in deudasPorCliente) {
    const cliente = deudasPorCliente[nombre];
    const clienteId = generarIdCliente(nombre);
    
    marcarEscrituraInicio();
    try {
      await setDoc(
        refCliente(currentUid, clienteId),
        {
          nombre,
          saldoPendiente: cliente.saldoPendiente,
          domiciliosPendientes: cliente.domicilios.length,
          actualizadoEn: serverTimestamp(),
          creadoEn: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error sincronizando cliente:', err);
    } finally {
      marcarEscrituraFin();
    }
  }
}

/**
 * Genera un ID determinístico para un cliente (basado en su nombre)
 * Garantiza que el mismo cliente siempre tenga el mismo ID
 */
function generarIdCliente(nombreCliente) {
  return 'cliente_' + nombreCliente.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Referencia a un cliente específico
 */
function refCliente(uid, clienteId) {
  return doc(db, 'usuarios', uid, 'clientes', clienteId);
}

/**
 * Colección de pagos de un cliente
 */
function coleccionPagosCliente(uid, clienteId) {
  return collection(db, 'usuarios', uid, 'clientes', clienteId, 'pagos');
}

/**
 * Obtiene todos los clientes con saldo pendiente
 */
function obtenerClientesConSaldo() {
  return ClientesState.items.filter(c => c.saldoPendiente > 0);
}

/**
 * Calcula el total pendiente de todos los clientes
 */
function calcularTotalPendiente() {
  return ClientesState.items.reduce((sum, c) => sum + c.saldoPendiente, 0);
}

/**
 * Calcula cuántos clientes tienen saldo pendiente
 */
function contarClientesConDeuda() {
  return ClientesState.items.filter(c => c.saldoPendiente > 0).length;
}

/**
 * Calcula cuántos domicilios están pendientes
 */
function contarDomiciliosPendientes() {
  return AppState.deudas.length;
}

/**
 * Registra un pago (completo o parcial) de un cliente
 * Actualiza automáticamente:
 * - El saldo del cliente
 * - Marca domicilios como pagados
 * - Crea registro del pago en el historial
 */
async function registrarPagoCliente(nombreCliente, montoRecibido, fechaPago = null) {
  if (!currentUid || !nombreCliente || montoRecibido <= 0) {
    mostrarToast('Datos inválidos para registrar pago');
    return false;
  }
  
  const clienteId = generarIdCliente(nombreCliente);
  fechaPago = fechaPago || toDateKey(new Date());
  
  marcarEscrituraInicio();
  
  try {
    // Obtener cliente y domicilios pendientes
    const clienteSnap = await getDoc(refCliente(currentUid, clienteId));
    if (!clienteSnap.exists()) {
      mostrarToast('Cliente no encontrado');
      return false;
    }
    
    const deudas = AppState.deudas.filter(e => e.nombre === nombreCliente);
    const totalDeuda = totalDe(deudas);
    
    if (montoRecibido > totalDeuda) {
      mostrarToast('El pago supera la deuda total');
      return false;
    }
    
    let montoRestante = montoRecibido;
    const deudaasActualizadas = [...deudas].sort((a, b) => 
      new Date(a.fecha) - new Date(b.fecha) // Pagar las más antiguas primero
    );
    
    // Marcar domicilios como pagados progresivamente
    for (const deuda of deudaasActualizadas) {
      if (montoRestante <= 0) break;
      
      const deudaValor = Number(deuda.valor);
      if (montoRestante >= deudaValor) {
        // Pagar completamente este domicilio
        await actualizarDocumento('entregas', deuda.id, {
          pagado: true,
          medioPago: 'transferencia',
          fechaPago
        });
        montoRestante -= deudaValor;
      } else {
        // Este pago es parcial, no marcar como pagado
        // (Para futuro: soportar entregas con pagos parciales)
        montoRestante = 0;
      }
    }
    
    // Guardar registro del pago en el historial
    const pagoId = uid();
    const nuevoSaldo = totalDeuda - montoRecibido;
    
    await addDoc(coleccionPagosCliente(currentUid, clienteId), {
      id: pagoId,
      monto: montoRecibido,
      fecha: fechaPago,
      medioPago: 'transferencia',
      saldoAntes: totalDeuda,
      saldoAnterior: nuevoSaldo,
      creadoEn: serverTimestamp()
    });
    
    // Actualizar saldo del cliente
    await updateDoc(refCliente(currentUid, clienteId), {
      saldoPendiente: Math.max(0, nuevoSaldo),
      domiciliosPendientes: AppState.deudas.filter(e => e.nombre === nombreCliente && !e.pagado).length,
      actualizadoEn: serverTimestamp()
    });
    
    mostrarToast(`✓ Pago de ${formatCOP(montoRecibido)} registrado para ${nombreCliente}`);
    return true;
    
  } catch (err) {
    console.error('Error registrando pago:', err);
    mostrarToast('Error al registrar pago');
    return false;
  } finally {
    marcarEscrituraFin();
  }
}

/**
 * Obtiene el historial de pagos de un cliente
 */
async function obtenerHistorialPagosCliente(clienteId) {
  if (!currentUid) return [];
  
  try {
    const snap = await getDocs(
      query(
        coleccionPagosCliente(currentUid, clienteId),
        orderBy('fecha', 'desc')
      )
    );
    return snap.docs.map(mapDoc);
  } catch (err) {
    console.error('Error obteniendo historial de pagos:', err);
    return [];
  }
}

/**
 * Suscripción en tiempo real a clientes
 */
function suscribirse_Clientes(uid) {
  const q = query(
    collection(db, 'usuarios', uid, 'clientes'),
    where('saldoPendiente', '>', 0)
  );
  
  unsubs.clientes = onSnapshot(q, (snap) => {
    ClientesState.items = snap.docs.map(mapDoc);
    renderCobros();
  }, (err) => {
    console.error('Error en suscripción de clientes:', err);
  });
}

/**
 * Cierra la suscripción
 */
function desuscribirse_Clientes() {
  if (unsubs.clientes) {
    unsubs.clientes();
    delete unsubs.clientes;
  }
}
