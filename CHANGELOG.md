# Changelog — Domi

Todas las versiones notables de la aplicación se documentan en este archivo.
Formato: lo más reciente arriba. Cada versión es funcional por sí sola.

---

## [1.9.2] — Aviso de nueva versión y botón "Recargar"

Como la PWA instalada no tiene barra de navegador, no había forma de recargar
la app desde dentro.

### Agregado
- **Banner "Hay una versión nueva de Domi · Actualizar"** que aparece solo
  cuando el service worker detecta una versión desplegada más reciente (al
  abrir la app o al volver a ella).
- **Botón "🔄 Recargar la app"** en Más → Aplicación, siempre disponible.
- `js/actualizacion.js` — registro del service worker + toda esta lógica
  (antes el registro estaba suelto en `script.js`).

### Cambiado
- Service worker: caché `v12`.

---

## [1.9.1] — Service worker: "red primero" para la app

### Corregido
- **Las versiones nuevas no se veían sin borrar la caché a mano.** El service
  worker usaba "caché primero" para todo, así que seguía sirviendo la versión
  vieja aunque el servidor ya tuviera la nueva. Ahora:
  - HTML / JS / CSS del propio sitio → **red primero** (con internet siempre ves
    lo último; sin internet, respaldo desde caché).
  - Iconos y manifest → caché primero.
  - Firebase SDK y fuentes de Google → caché primero (sus URLs llevan versión).
  - Llamadas a la API de Firestore/Auth → ya no se interceptan (antes se
    cacheaban por error).
- Caché `v11`. **Esta es la última vez que hay que forzar la actualización a
  mano**; de aquí en adelante cada deploy se ve solo al recargar.

---

## [1.9.0] — Clientes (paso 1 de Cobros): entidad y gestión

Primer paso hacia el sistema de cobros por cliente. Solo la entidad: crear,
editar y borrar clientes. Todavía no cambia nada de agregar domicilios ni de la
pantalla "Deben".

### Agregado
- Subcolección `usuarios/{uid}/clientes/{id}` (`nombre` + `telefono` opcional),
  con su regla en `firestore.rules` y suscripción en tiempo real.
- `js/clientes.js` — sección **Clientes** en la pestaña "Más": lista, y hoja
  para crear/editar/borrar (igual que los frecuentes).

### Cambiado
- `render-bus.js` ahora admite varias tareas de repintado (antes solo una), para
  que cada módulo que pinta algo se registre solo.
- `style.css`: los mensajes de "lista vacía" de frecuentes, clientes e historial
  ahora sí aparecen cuando corresponde (antes solo funcionaba en las listas de
  domicilios).
- Service worker: caché `v10`.

### Siguiente
- v1.9.1: elegir cliente (opcional) al agregar un domicilio.
- v1.9.2: "Deben" pasa a "Cobros", agrupado por cliente.

---

## [1.8.4] — Modularización (paso 5, final): render, hojas, navegación y auth

Con este paso `script.js` deja de ser un archivo de 1400 líneas y pasa a ser un
orquestador de ~85: carga los módulos, ata el arranque de sesión al estado y
arranca los relojes y el service worker.

### Agregado
- `js/render.js` — todas las pantallas (inicio, semana, deben, frecuentes,
  historial de semanas, registros y gastos con sus filtros).
- `js/sheets.js` — todas las hojas inferiores y modales (domicilio, frecuente,
  gasto, marcar pago, detalle, cálculo del día, meta y confirmación).
- `js/navigation.js` — el router de pantallas (`irAPestana`) y la barra inferior.
- `js/auth.js` — pantalla de login/registro y el modal de configuración de cuenta.

### Cambiado
- La app pasa de 1 archivo JS a 13 módulos con responsabilidades claras, como
  pide `COPILOT_CONTEXT.md`. **Cero cambios de comportamiento**: es una
  reubicación mecánica del mismo código (verificado: todas las funciones y los
  43 listeners siguen presentes; prueba de humo CDP sin errores).
- Se quitó un parámetro muerto de `seleccionarSegmento`.
- Service worker: caché `v9`.

---

## [1.8.3] — Modularización (paso 4: capa de datos y cálculos)

### Agregado
- `js/calculos.js` — cálculos derivados del estado (entregas de un día en orden,
  pagos, gastos, totales, totales por día de la semana).
- `js/data.js` — capa de datos: escrituras genéricas a Firestore, indicador de
  "Sincronizando…", las 5 suscripciones en tiempo real, migración de datos
  antiguos, aviso de índice faltante y guardado del perfil.
- `js/render-bus.js` — pequeño puente que rompe la dependencia circular entre la
  capa de datos (pide repintar) y la de render (usa la capa de datos).

### Cambiado
- `script.js` baja de ~1290 a ~940 líneas. Ya solo contiene render, hojas/modales,
  navegación, autenticación y el arranque. Sin cambios de comportamiento
  (prueba de humo CDP: login OK, 0 errores).
- Service worker: caché `v8`.

---

## [1.8.2] — Modularización (paso 3: dom.js y state.js)

### Agregado
- `js/dom.js` — cache de referencias por `#id` (el objeto `el`) más los helpers
  de UI genéricos: hojas inferiores, modales, toast y protección contra doble
  clic.
- `js/state.js` — estado en memoria compartido (`state`, `registros`,
  `gastosVista`, `historialSemanas`, `unsubs`), el uid de sesión con setter y
  los ayudantes que arman `state.entregas` sin registros fantasma.

### Cambiado
- `script.js` importa el DOM y el estado desde esos módulos. Sin cambios de
  comportamiento (verificado con prueba de humo por DevTools Protocol).
- Service worker: caché `v7`.

---

## [1.8.1] — Modularización (paso 2: firebase.js)

### Agregado
- `js/firebase.js` — único módulo que conoce la versión del SDK de Firebase.
  Crea las instancias `auth` y `db`, configura la persistencia de sesión y
  expone las referencias (`refPerfil`, `coleccion`, `refDocumento`). Reexporta
  las funciones del SDK que usa el resto de la app, para que actualizar la
  versión de Firebase sea un cambio de un solo archivo.

### Cambiado
- `script.js` ya no importa de `gstatic.com` directamente: todo pasa por
  `js/firebase.js`. Sin cambios de comportamiento.
- Service worker: precachea `js/firebase.js` (caché `v6`).

---

## [1.8] — Modularización (paso 1: config y utilidades)

Primer paso de la migración progresiva a módulos que pide `COPILOT_CONTEXT.md`,
por lo más aislado y sin riesgo. `index.html` sigue cargando un único
`<script type="module" src="script.js">`; ahora `script.js` importa los módulos.

### Agregado
- `js/config.js` — constantes de la app en un solo sitio: `META_SEMANAL_DEFAULT`
  (antes el número `800000` estaba repetido en 4 lugares), `DIAS_SEMANA`, `MESES`,
  `CATEGORIAS_GASTO` y las constantes de navegación.
- `js/utils.js` — funciones puras extraídas de `script.js` sin cambios de
  comportamiento: `formatCOP`, `formatHora12`, `toDateKey`, `getMonday`,
  `addDays`, `formatFechaLarga`, `formatFechaCorta`, `rangoSemanaTexto`,
  `frecuentesPorDefecto`, `uid`, `escapeHTML`, `tiempoCreacion`.

### Cambiado
- `script.js` pasa de ~1390 a ~1290 líneas; el resto de la división se hará en
  pasos siguientes (`firebase.js`, `auth.js`, `navigation.js`, pantallas…).
- El service worker precachea los dos módulos nuevos (caché `v5`).

### Sin cambios
- Comportamiento de la app, diseño, datos.

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
