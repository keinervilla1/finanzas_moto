# Changelog — Domi

Todas las versiones notables de la aplicación se documentan en este archivo.
Formato: lo más reciente arriba. Cada versión es funcional por sí sola.

---

## [1.9.9] — "Desliza para actualizar" como pestañita visible

### Cambiado
- El pull-to-refresh deja de ser un gesto libre sobre la lista (que se confundía
  con el scroll). Ahora es una **pestañita** que baja de detrás de la barra
  superior **solo cuando estás arriba de todo**. Se toca o se arrastra hacia
  abajo para recargar. Como el gesto se hace sobre la pestañita y no sobre la
  lista, es imposible dispararlo por accidente al scrollear.
- Service worker: caché `v19`.

---

## [1.9.8] — Pull to refresh que ya no choca con el scroll

### Corregido
- Subir y bajar rápido la pantalla ya no se toma como "refrescar". Ahora el
  gesto de recarga:
  - **No se puede iniciar mientras estás scrolleando**: la lista tiene que
    estar quieta arriba de todo (sin scroll en los últimos 250 ms).
  - **Ignora los movimientos rápidos** (flicks): un pull es lento y deliberado.
  - Cualquier movimiento hacia arriba lo cancela de una y devuelve el scroll.
  - Umbral más largo: 40 px de "zona muerta" + 130 px de arrastre real.
- Service worker: caché `v18`.

---

## [1.9.7] — Cobro por monto y abono

Completa la pantalla Cobros con la segunda forma de registrar un pago.

### Agregado
- **Campo "O escribe cuánto te dio"** en la hoja de cobro. Al escribir un monto,
  se marcan automáticamente los domicilios que quedan cubiertos por completo,
  del más antiguo al más nuevo. Tocar el checklist vuelve al modo manual.
- **Abono** para clientes registrados: si sobra dinero que no alcanza para otro
  domicilio, queda guardado como abono del cliente (`clientes/{id}.abono`) y se
  muestra en su tarjeta de Cobros. La próxima vez, la hoja arranca con ese
  abono ya puesto en el campo de monto.
- Para grupos de nombre libre (sin cliente registrado), el sobrante solo se
  avisa; no se guarda.

### Notas
- Service worker: caché `v17`.

---

## [1.9.6] — Pull to refresh más natural

### Corregido
- El pull-to-refresh de v1.9.3 se enganchaba con muy poco arrastre y bloqueaba
  el scroll normal (se sentía "pegado" al intentar volver a subir, y recargaba
  casi con cualquier gesto). Ahora:
  - **Zona muerta** de 16 px antes de activarse: los toques y scrolls pequeños
    funcionan igual que siempre, sin interferencia.
  - **Umbral más largo** (115 px de arrastre real) para disparar la recarga.
  - Si el dedo se mueve hacia arriba en cualquier momento, el gesto se suelta al
    instante y el scroll vuelve a mandar.
- Service worker: caché `v16`.

---

## [1.9.5] — Pantalla Cobros (agrupada por cliente)

"Deben" pasa a llamarse **Cobros** y deja de ser una lista plana de domicilios.

### Cambiado
- **La pantalla agrupa los domicilios sin pagar por cliente.** Cada tarjeta
  muestra el cliente, cuántos domicilios debe y el total. Se agrupa por
  `clienteId` (si el domicilio se vinculó a un cliente) o, si no, por el
  nombre escrito — así los datos viejos siguen funcionando.
- **Registrar pago**: tocar un cliente abre una hoja con la lista de sus
  domicilios pendientes, todos marcados por defecto ("pagó todo"). Se
  desmarca lo que no pagó, se elige medio de pago y listo: los marcados
  quedan pagados con fecha de hoy y cuentan como ingreso.
- Textos: pestaña "Deben" → "Cobros"; chip de Inicio "Te deben" → "Por cobrar".

### Quitado
- La hoja "Marcar como pagado" de un solo domicilio (v1.4): la reemplaza la
  hoja de cobro por cliente. `js/cobros.js` nuevo; se limpió el código muerto
  en `sheets.js` y `render.js`.

### Pendiente (v1.9.6)
- Campo de "monto recibido" en la hoja de cobro (paga del más antiguo al más
  nuevo) y abono pendiente para clientes registrados.

### Notas
- Service worker: caché `v15`.

---

## [1.9.4] — Elegir cliente al agregar un domicilio

### Agregado
- En la hoja de **agregar / editar domicilio**, debajo de los frecuentes, una
  fila de chips **"Cliente (opcional)"** con los clientes registrados. Al elegir
  uno se rellena el nombre y el domicilio queda vinculado (`entrega.clienteId`).
  Si no hay clientes registrados, la fila no aparece.
- Elegir un frecuente o un cliente deselecciona al otro (ambos dicen "para
  quién es"). Tocar de nuevo el cliente elegido lo desvincula.

### Notas
- Los domicilios viejos y los que se guarden sin elegir cliente siguen igual
  (nombre libre). El `clienteId` todavía no se usa en ninguna pantalla — eso
  llega en v1.9.5 (pantalla Cobros).
- Service worker: caché `v14`.

---

## [1.9.3] — Pull to refresh

### Agregado
- **Arrastrar hacia abajo desde el tope recarga la app** (como en cualquier app
  nativa), con indicador circular y umbral. Con el service worker "red primero",
  esto también trae la última versión desplegada. `js/pull-refresh.js`.

### Cambiado
- Se quitó el botón "🔄 Recargar la app" de v1.9.2: el gesto lo reemplaza.
- `.screens` usa `overscroll-behavior-y: contain` para que el gesto no choque
  con el "pull to refresh" del navegador.
- Service worker: caché `v13`.

---

## [1.9.2] — Aviso de nueva versión

Como la PWA instalada no tiene barra de navegador, no había forma de saber que
había una versión nueva.

### Agregado
- **Banner "Hay una versión nueva de Domi · Actualizar"** que aparece solo
  cuando el service worker detecta una versión desplegada más reciente (al
  abrir la app o al volver a ella).
- `js/actualizacion.js` — registro del service worker + esta lógica (antes el
  registro estaba suelto en `script.js`).

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
