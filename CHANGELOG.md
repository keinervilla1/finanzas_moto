# Changelog — Domi

Todas las versiones notables de la aplicación se documentan en este archivo.
Formato: lo más reciente arriba. Cada versión es funcional por sí sola.

---

## [1.7] — Iconos de la PWA y navegación consistente

### Agregado
- **Iconos reales de la aplicación** en `icons/` (192, 512 y 512 maskable, más
  `icon.svg`). Antes se referenciaban archivos que no existían: al instalar la
  app en el celular no aparecía ícono. Monograma "D" sobre el verde de la marca.

### Cambiado
- **Navegación de "Gastos" unificada.** Era una pantalla que se abría con
  manipulación manual del DOM, sin resaltar ninguna pestaña y de la que te
  sacaba al recargar. Ahora pasa por el mismo camino que el resto de pantallas
  (`irAPestana`), resalta la pestaña "Más" mientras está abierta y se refresca
  sola cuando llegan datos nuevos (rangos Hoy/Semana).
- El service worker vuelve a precachear los iconos (caché `v4`).
- `<meta viewport>` ya no fuerza `maximum-scale=1`: se permite hacer zoom con los
  dedos (accesibilidad).

### Sin cambios (por diseño)
- Diseño visual, paleta y componentes.
- Las 5 pestañas del menú inferior y su comportamiento.

---

## [1.6] — Corrección de errores y limpieza de documentación

### Corregido
- **La PWA no guardaba nada para uso sin conexión.** El service worker intentaba
  cachear tres iconos (`icons/icon-*.png`) que no existen en el proyecto; como
  `cache.addAll()` es atómico, un solo 404 tumbaba toda la instalación. Ahora se
  cachea archivo por archivo tolerando fallos (`Promise.allSettled`) y se quitaron
  de la lista los iconos inexistentes (se agregarán de verdad en la v1.7).
- **La barra "Sincronizando…" se quedaba pegada.** Al guardar el perfil dos veces
  en menos de 250 ms (editar la meta rápido, crear dos frecuentes seguidos), el
  `clearTimeout` descartaba el cierre del contador de escrituras pendiente. Ahora
  el indicador se marca una sola vez por ráfaga de cambios.
- **Editar un domicilio ya pagado le cambiaba la fecha de pago a hoy**, moviendo el
  ingreso de semana y descuadrando "Semana" y "Semanas anteriores". Ahora, si el
  domicilio ya estaba pagado y sigue pagado, se conserva el día real del pago.
- **La lista de domicilios podía dejar de dibujarse** si algún registro no tenía
  hora (datos migrados del formato antiguo): el ordenamiento hacía
  `hora.localeCompare(...)` sobre `undefined`. Ahora tolera la hora vacía.
- **Registros fantasma entre dispositivos.** `state.entregas` se armaba acumulando
  resultados sin quitar nunca los que dejaban de aplicar; borrar o editar un
  domicilio desde otro celular lo dejaba sumando en los totales hasta recargar.
  Ahora cada consulta reemplaza su grupo completo en cada actualización.
- **El chip "Te deben" de la pantalla Inicio no hacía nada.** Ahora es un acceso
  directo a la pantalla "Deben".
- Las consultas que requieren un índice compuesto de Firestore ya no fallan en
  silencio: se avisa al usuario mientras el índice se construye.

### Agregado
- `firestore.indexes.json` con los dos índices compuestos que necesita la app
  (consultas de `entregas` por `pagado` + `fechaPago`).
- `README.md` con descripción real del proyecto, stack y puesta en marcha.

### Cambiado
- `firestore.rules.txt` → `firestore.rules` (nombre estándar para desplegar).
- `CHANGELOG.md` unificado: antes había dos changelogs distintos y contradictorios
  pegados en el mismo archivo.

### Sin cambios (por diseño)
- Diseño visual, paleta y componentes.
- Arquitectura de datos en Firestore.
- No se agregaron dependencias.

---

## [1.5] — Experiencia de usuario y base más sólida

### Agregado
- **Protección contra doble envío (reutilizable):** helper `conProteccionDoble()`
  que deshabilita el botón, muestra "Guardando…" y lo restaura al terminar.
  Aplicado a los 10 botones que guardan o confirman algo.
- **Recordar la última pestaña:** la app guarda en el dispositivo cuál de las 5
  pestañas principales estaba abierta y la restaura al volver a entrar.
- **Pantalla "Más" reorganizada por categorías:** Cuenta, Datos, Herramientas y
  Aplicación. La meta semanal ahora también es accesible desde aquí.

### Corregido
- **Orden de "Domicilios de hoy":** ahora en orden cronológico real, con desempate
  por el instante exacto de guardado cuando dos comparten la misma hora.
- Eliminada una constante sin uso (`TITULOS`) y una rama de navegación muerta.

### Mejorado
- Renderizados repetidos agrupados en un solo repintado con `solicitarRenderTodo()`.

### Revertido
- Se retiró el módulo experimental `modules/clientes.js` (introducido brevemente
  como "Cobros / Clientes" en un intento de v1.2). Se perdió en conflictos de
  merge y quedó incompatible con el resto del código. La pantalla vuelve a ser
  "Deben", más simple. La gestión de clientes y cuentas por cobrar se retomará,
  ya sobre una base ordenada, en la v1.9.

---

## [1.4] — Deben, Gastos, Registros y medio de pago
- Nueva categoría **Deben** para domicilios no pagados de inmediato, con marcado
  de pago posterior.
- Nuevo módulo de **Gastos** por categoría (gasolina, comida, mantenimiento,
  peajes, otros) y cálculo de ganancia neta (ingresos − gastos).
- Nueva pantalla **Registros**: historial completo de domicilios con filtros por
  rango de fechas y carga paginada ("Cargar más").
- Medio de pago (Efectivo/Transferencia) y tipo de domicilio (Normal/Contrata).
- Indicadores de carga: pantalla de arranque y barra de "Sincronizando…".
- Migración de la arquitectura de datos de un documento único a subcolecciones
  (`entregas`, `gastos`) para mantener la app rápida a largo plazo.

## [1.3] — Cuenta de usuario
- Configuración de cuenta: cambiar nombre para mostrar, correo y contraseña (con
  reautenticación).
- Saludo personalizado ("Hola, Nombre 👋") en la pantalla principal.

## [1.2] — Sincronización en la nube
- Autenticación con correo y contraseña (Firebase Authentication).
- Sincronización de domicilios, frecuentes y meta semanal entre dispositivos
  (Firebase Firestore).
- Persistencia de sesión en el dispositivo.

## [1.1] — PWA
- Manifest e íconos para instalar la app en el celular como aplicación nativa.
- Service worker con caché para uso sin conexión.

## [1.0] — Versión inicial
- Registro de domicilios del día con destinos frecuentes.
- Cálculo del día (total, cantidad, promedio, primer/último domicilio).
- Resumen semanal con meta y progreso, mejor día y promedio diario.
- Historial de semanas anteriores.
- Diseño verde/blanco estilo iPhone, con animaciones y componentes tipo tarjeta.
