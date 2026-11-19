# DOMI — Contexto del Proyecto

> Documento de referencia para cualquier persona (o IA) que trabaje en DOMI.
> Leerlo completo antes de hacer cualquier cambio.

---

## 1. ¿Qué es DOMI?

DOMI (también llamada **Finanzas Moto**) es una **Progressive Web App (PWA)** desarrollada con **JavaScript Vanilla y Firebase**.

El objetivo **NO** es ser una simple aplicación para registrar domicilios.

El objetivo es convertirse en un **sistema profesional para repartidores independientes** que les permita administrar completamente su trabajo diario.

La aplicación debe ser **extremadamente rápida, sencilla y funcionar correctamente desde un teléfono móvil**.

### Usuario objetivo
- Repartidor independiente (moto), principalmente en Colombia.
- Usa la app muchas veces al día, en la calle, con una sola mano y a veces con mala señal.
- Necesita saber rápido: cuánto lleva hoy, cuánto le deben, cuánto gastó y si va a cumplir la meta.

---

## 2. Objetivo final

DOMI debe convertirse en una aplicación profesional que pueda **comercializarse en el futuro**.

Cada cambio debe acercar el proyecto a ese objetivo.

### Qué debe permitir administrar
- Domicilios
- Ingresos
- Gastos
- Cobros
- Clientes
- Estadísticas
- Metas
- Productividad

No solamente registrar información: **debe ayudar al usuario a tomar mejores decisiones**.

---

## 3. Tecnologías

| Área | Tecnología |
|---|---|
| Lenguaje | JavaScript Vanilla |
| Autenticación | Firebase Authentication (correo/contraseña, `browserLocalPersistence`) |
| Base de datos | Firestore |
| App instalable | PWA (`manifest`) |
| Offline / caché | Service Worker |
| Publicación | GitHub Pages (o hosting estático similar) |

### Reglas tecnológicas
- **NO** usar React, Vue, Angular ni TypeScript.
- **No agregar frameworks nuevos.**
- **No cambiar la tecnología.**
- No agregar dependencias innecesarias.

---

## 4. Estado actual del proyecto

- **Versión actual:** v1.13.0 (el historial completo está en `CHANGELOG.md`).
  El número se cambia en un solo sitio: `VERSION_APP` en `js/config.js`.
- **Diseño:** verde y blanco, inspirado en iPhone.

### Archivos actuales
```
index.html            → todas las pantallas, hojas y modales
style.css
script.js             → punto de entrada: carga los módulos y arranca la sesión
sw.js                 → service worker (caché offline, "red primero" para la app)
manifest.json         → PWA instalable
firebase-config.js    → claves públicas de Firebase
firestore.rules       → reglas de seguridad (copiar a la consola de Firebase)
firestore.indexes.json→ índices compuestos que necesita la app
icons/                → íconos de la PWA (logo-fuente.png es el diseño original, no se usa en la app)
js/
  config.js           → constantes (versión, meta por defecto, categorías de gasto, navegación)
  utils.js            → fechas, formato de dinero, funciones puras
  firebase.js         → inicialización del SDK y referencias a Firestore
  dom.js              → referencias a elementos, hojas, modales, toast
  state.js            → estado en memoria compartido
  calculos.js         → totales y datos derivados
  data.js             → lecturas/escrituras a Firestore, tiempo real, migración
  render-bus.js       → puente para pedir un repintado
  render.js           → Inicio, Semana, Registros, Gastos, Frecuentes, historial
  sheets.js           → hojas de domicilio, frecuente, gasto; modales detalle, cálculo, meta
  cobros.js           → pantalla Cobros (agrupada por cliente) y registro de pagos
  cobro-whatsapp.js   → cobrar por WhatsApp (mensaje, teléfono) y "Datos de pago"
  clientes.js         → lista y edición de clientes (en "Más")
  respaldo.js         → "Respaldo de mis datos": exporta CSV + JSON (SOLO lee)
  navigation.js       → cambio de pantallas y barra inferior
  auth.js             → login, registro y configuración de cuenta
  actualizacion.js    → registro del service worker y aviso de versión nueva
CHANGELOG.md, README.md, DOMI-CONTEXTO.md, CLAUDE.md
```

### Navegación (barra inferior)
**Inicio · Cobros · Registros · Semana · Más.** "Gastos" es una subpantalla que
se abre desde "Más". Los nombres internos de pantalla son `inicio`, `deben`
(Cobros), `registros`, `semana`, `frecuentes` (Más) y `gastos`; no cambiarlos sin
motivo (la última pestaña abierta se guarda en el teléfono con ese nombre).

### Funciones que ya existen (NO romper)
- Inicio de sesión con Firebase (sesión persistente) y sincronización en tiempo real.
- Funciona sin conexión (caché de Firestore + service worker) y avisa cuando hay versión nueva.
- **Inicio:** ganancia neta de hoy, anillo de meta semanal, "Esta semana" y "Por cobrar",
  botón "Agregar domicilio", "Ver cálculo del día" y lista de domicilios de hoy (más reciente arriba).
- **Agregar / editar domicilio:** frecuentes como chips, cliente opcional, tipo
  **Normal / Contrata**, ¿pagó ya? (sí/no), medio de pago (efectivo/transferencia), observación.
- **Detalle del domicilio:** ver, editar y eliminar (con confirmación).
- **Cobros:** domicilios sin pagar agrupados por cliente; pagar marcando domicilios o
  escribiendo un monto (paga del más antiguo al más nuevo); el sobrante queda como
  **abono del cliente** (solo clientes registrados).
- **Cobrar por WhatsApp:** botón en cada tarjeta de Cobros. Con teléfono abre el chat directo
  con el mensaje listo (pendientes por día, total, abono y datos de pago); sin teléfono deja
  escribirlo (se guarda en `clientes/{id}.telefono`); los grupos sin cliente eligen el chat.
  Siempre se puede "Compartir de otra forma".
- **Registros:** historial con filtros (semana, mes, 3 meses, todo) y "Cargar más".
- **Semana:** meta, mejor día, promedio diario, días de la semana y semanas anteriores.
- **Gastos:** por categoría, con filtros (hoy, semana, mes, todo); editar y eliminar.
- **Más:** Datos (frecuentes, clientes y respaldo), Finanzas (gastos, meta semanal y datos de
  pago para cobrar), Cuenta
  (configuración y cerrar sesión).
- **Respaldo:** exporta domicilios, gastos y clientes a CSV (Excel, `;`, con tildes) y un
  JSON completo. Lee directo del servidor (necesita internet) y nunca escribe en Firestore.
  Muestra "Último respaldo: …" (guardado en el teléfono).
- Barra "Sincronizando…", pantalla de carga, protección contra doble toque,
  recordar la última pestaña.
- La app **no** se recarga al deslizar hacia abajo (se quitó en v1.11.1). Las versiones
  nuevas llegan con el aviso "Hay una versión nueva · Actualizar".
- Migración automática de datos antiguos (arreglo `entregas` del perfil → subcolección).

### Trabajo pendiente conocido
- Ver la hoja de ruta (sección 14).

---

## 5. Datos y compatibilidad (MUY IMPORTANTE)

El usuario ya tiene **información real e importante guardada**. Perder datos es el peor error posible.

### Estructura actual en Firestore

**Ruta base:** `usuarios/{uid}`. Cada usuario solo ve lo suyo (`firestore.rules`).

**`usuarios/{uid}`** (perfil, un solo documento)
- `frecuentes`: lista de `{ id, nombre, valor }`
- `meta`: número (por defecto 800000)
- `datosPago`: texto libre (ej. "Nequi 300 123 4567") que va al final del mensaje de cobro por
  WhatsApp. **Opcional** (v1.13): si no existe se toma como vacío. Se guarda solo ese campo con
  `merge`, sin tocar `frecuentes` ni `meta`. Va incluido en el respaldo JSON (perfil).
- `entregas`: lista antigua (versión vieja). La migración la pasa a la subcolección y luego **la borra**. Ya no debería existir.

**`usuarios/{uid}/entregas/{id}`** (un documento por domicilio; en Firestore se llama "entregas", no "domicilios")
- `nombre` (texto), `valor` (número), `hora` ("HH:MM"), `fecha` ("AAAA-MM-DD", el día en que se hizo)
- `descripcion` (texto, puede estar vacío)
- `tipo`: `"normal"` o `"contrata"`. Si no existe, se toma como normal.
- `clienteId`: id de un cliente o `null`. **Los domicilios viejos no lo tienen.**
- `pagado` (sí/no), `medioPago` (`"efectivo"`, `"transferencia"` o `null`), `fechaPago` ("AAAA-MM-DD" o `null`)
- `creadoEn`: fecha y hora del servidor (sirve para desempatar el orden). Puede faltar en registros muy viejos.

**`usuarios/{uid}/gastos/{id}`**
- `valor`, `categoria` (`gasolina`, `comida`, `mantenimiento`, `peajes` u `otros`), `descripcion`, `fecha`, `creadoEn`

**`usuarios/{uid}/clientes/{id}`**
- `nombre`, `telefono` (puede estar vacío; se guarda tal cual se escribió y solo se convierte
  a formato WhatsApp +57 al armar el enlace), `creadoEn`
- `abono`: número. Solo existe si alguna vez sobró dinero en un cobro.

**Índices:** `entregas` por `pagado` + `fechaPago`, uno ascendente y otro descendente (`firestore.indexes.json`).

**En el teléfono (no en Firestore):** `localStorage.domi_ultima_pestana` y
`localStorage.domi_ultimo_respaldo_{uid}` (fecha ISO del último respaldo descargado).

> No hay "abonos" por domicilio: cada domicilio está pagado o no. El abono se guarda en el **cliente**.

### Reglas de datos
1. **Nunca borrar, renombrar ni cambiar el tipo de un campo existente.**
2. Los campos nuevos se **agregan**, siempre con un valor por defecto para los registros viejos que no lo tienen.
3. El código debe funcionar con registros **antiguos y nuevos** al mismo tiempo.
4. Cualquier migración debe:
   - ser **automática y segura** (si falla, no toca nada),
   - poder ejecutarse más de una vez sin duplicar datos,
   - dejar los datos originales intactos hasta confirmar que la migración salió bien.
5. Antes de un cambio grande en los datos: **hacer un respaldo** (exportar los datos del usuario).
6. Mantener la compatibilidad con Firebase y con las reglas de seguridad actuales.

---

## 6. Filosofía del proyecto

- La aplicación será utilizada **muchas veces al día**.
- Cada acción importante debe tomar **menos de 10 segundos**.
- La interfaz debe ser **limpia**.
- Debe sentirse como una **aplicación nativa**.
- Debe poder **crecer durante años** sin convertirse en un proyecto difícil de mantener.

---

## 7. Principios de desarrollo

Cada cambio debe cumplir estas reglas:

- No romper funcionalidades existentes.
- Mantener compatibilidad con los datos actuales.
- Mantener compatibilidad con Firebase.
- No agregar dependencias innecesarias.
- Mantener JavaScript Vanilla.
- Mantener el diseño existente.
- Siempre priorizar simplicidad.

---

## 8. Arquitectura

Actualmente el proyecto está en **proceso de refactorización**.

El objetivo es llegar a una **arquitectura limpia**, con la lógica separada por responsabilidades y dividida en módulos cuando sea posible.

### Estructura objetivo (futura)
```
config.js        → constantes y configuración
firebase.js      → inicialización de Firebase
auth.js          → inicio/cierre de sesión
ui.js            → modales, toasts, spinner, componentes comunes
navigation.js    → pestañas y menú
domicilios.js    → crear, editar, listar domicilios
gastos.js        → gastos
cobros.js        → lo que deben / abonos
clientes.js      → clientes
estadisticas.js  → resúmenes y gráficas
utils.js         → fechas, formato de dinero, validaciones
app.js           → arranque de la aplicación
```

### Cómo migrar
- La migración debe hacerse **progresivamente**: un módulo por versión.
- **Nunca romper el proyecto por dividir archivos.**
- Usar módulos nativos del navegador (`<script type="module">`, `import` / `export`) sin herramientas de compilación.
- Al crear un archivo nuevo, **agregarlo a la caché del Service Worker** y subir la versión de la caché.

---

## 9. Forma de trabajar

- No implementar muchas funciones en una sola versión.
- Trabajar por **versiones pequeñas**.
- Cada versión debe ser **completamente funcional**.
- Cada versión debe **actualizar `CHANGELOG.md`**.

### Numeración de versiones
- `1.5 → 1.6`: función nueva o mejora visible.
- `1.6 → 1.6.1`: corrección de errores.
- `1.x → 2.0`: cambio grande (por ejemplo, terminar de dividir en módulos o cambiar el modelo de datos).

### Lista de revisión antes de publicar cada versión
- [ ] Los datos que ya existían se ven correctamente.
- [ ] Se puede crear, editar y eliminar un domicilio.
- [ ] Se puede registrar un gasto.
- [ ] Deben / cobros calcula bien los saldos.
- [ ] La meta semanal y el cálculo diario dan los números correctos.
- [ ] Funciona en el teléfono (pantalla pequeña, una mano).
- [ ] Funciona sin internet y se sincroniza al volver la señal.
- [ ] Se actualizó la versión de la caché del Service Worker.
- [ ] No hay errores en la consola.
- [ ] Se actualizó `CHANGELOG.md`.

---

## 10. Estilo de código

Priorizar:
- legibilidad
- simplicidad
- mantenibilidad
- escalabilidad
- rendimiento

Reglas:
- No escribir funciones gigantes.
- No duplicar código.
- No usar variables globales innecesarias.
- Agrupar constantes.
- Usar nombres claros.
- Comentar el **porqué** de las decisiones que no sean obvias.
- Manejar los errores de Firebase y mostrar un mensaje entendible al usuario.

---

## 11. Experiencia de usuario

- La aplicación debe poder usarse con **una sola mano**.
- Reducir toques innecesarios.
- Reducir formularios largos.
- Recordar preferencias del usuario.
- Optimizar la velocidad.
- Botones importantes en la parte de abajo de la pantalla (zona del pulgar).
- Confirmar antes de eliminar algo.
- Mostrar siempre el estado: guardando, sincronizado o sin conexión.
- Formato de dinero colombiano (`$ 12.000`) y fechas en español.

---

## 12. Rendimiento

Preparar la aplicación para **miles de registros**.

- Optimizar consultas (traer solo lo necesario, por rango de fechas y con paginación).
- Optimizar renderizados (no redibujar toda la lista por un solo cambio).
- Optimizar filtros.
- Optimizar historial.
- Aprovechar la caché offline de Firestore para no repetir lecturas.

---

## 13. Seguridad

- Validar todos los datos (en el formulario **y** en las reglas de Firestore).
- No confiar en información del cliente.
- Mantener Firestore seguro: cada usuario solo puede leer y escribir **sus propios datos**.
- No guardar contraseñas ni datos sensibles en `localStorage`.
- Las claves de configuración de Firebase pueden ser públicas, pero la seguridad depende de las reglas: revisarlas en cada cambio de datos.

---

## 14. Hoja de ruta (propuesta)

Una función por versión, en este orden:

1. **v1.14 — Cierre del día:** efectivo, transferencia, gastos y cuánto efectivo
   debería tener.
2. **v1.15 — Ganancia real:** ingresos menos gastos por día, semana y mes.
3. **v1.16 — Productividad:** mejores horas y días, promedio por domicilio,
   domicilios por hora.
4. **v1.17 — Registrar más rápido:** repetir el último domicilio, frecuentes de un toque.
5. **v1.18 — Modo oscuro.**
6. **v1.19 — Mantenimiento de la moto** (aceite, llantas, kit, SOAT) con avisos.
7. **v2.0 — Pantalla de bienvenida y meta diaria** calculada desde la semanal.

**Tarea técnica continua (sin versión propia):** terminar la arquitectura modular
(separar domicilios, gastos y estadísticas de `render.js` y `sheets.js`). Se hace
poco a poco, dentro de la versión que toque cada parte (por ejemplo, `gastos.js`
al hacer el Cierre del día o la Ganancia real), nunca como una versión aparte que
reescriba todo.

**Versiones que van a tocar los datos** (avisar y pedir aprobación antes):
- v1.14 — si se guarda una "base" de efectivo con la que se arranca el día, sería un
  campo nuevo.
- v1.19 — necesita una subcolección nueva (`mantenimientos`) y una regla nueva en
  `firestore.rules`, que hay que publicar a mano en la consola de Firebase.
- Las demás, en principio, solo leen datos que ya existen.

Ya hechos (ver `CHANGELOG.md`): Cobros agrupado por cliente con abono (v1.9.5–1.9.7),
Clientes vinculados a domicilios y cobros (v1.9.0–1.9.4), menú Más reorganizado
(v1.10.1), navegación y orden de domicilios (v1.11.0), respaldo: exportar datos (v1.12.0), cobrar por WhatsApp (v1.13.0).

> Esta lista se puede cambiar. Lo importante es avanzar en pasos pequeños y sin perder datos.

---

## 15. Glosario

- **Domicilio:** un servicio de entrega realizado.
- **Normal / Contrata:** tipos de domicilio. En el dinero no hay ninguna diferencia
  (los dos suman igual en ganancias, meta y cobros). La única diferencia de
  comportamiento: al **crear** un domicilio, elegir "Contrata" marca por defecto
  "no pagado" (se puede cambiar). Al **editar**, cambiar el tipo no toca el pago.
  Se distinguen visualmente con 📋 y una etiqueta azul "Contrata".
- **Cobros** (antes "Deben"): domicilios que todavía no te han pagado (cuentas por
  cobrar), agrupados por cliente. Internamente la pantalla se sigue llamando `deben`.
- **Abono:** dinero que un **cliente registrado** te dio de más y que no alcanzó para
  pagar otro domicilio completo. Se guarda en el cliente (`clientes/{id}.abono`), no
  en el domicilio, y se usa en el siguiente cobro. Cada domicilio está pagado o no.
- **Gasto:** dinero que sale (gasolina, mantenimiento, comida, etc.).
- **Meta semanal:** valor que el repartidor quiere ganar en la semana.
