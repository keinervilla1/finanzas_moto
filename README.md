# Domi - Control de domicilios

PWA para repartidores independientes: registrar domicilios del dia, gastos,
deudas por cobrar y metas semanales, con sincronizacion en la nube y uso sin
conexion. Pensada para usarse con una sola mano desde el celular, muchas veces
al dia.

En produccion: https://finanzas-moto.vercel.app (deploy automatico al hacer
push a `main`).

## Stack

- **JavaScript Vanilla** (sin frameworks) con modulos ES.
- **Firebase Authentication** (correo y contrasena).
- **Cloud Firestore** con cache local persistente.
- **PWA**: `manifest.json` + service worker (`sw.js`).

No se agregan frameworks ni se cambia la tecnologia. Ver `COPILOT_CONTEXT.md`
para la filosofia y los principios del proyecto.

## Estructura

Raiz:

| Archivo | Que es |
|---|---|
| `index.html` | Marcado de todas las pantallas y hojas emergentes. |
| `style.css` | Estilos y tokens de diseno. |
| `script.js` | Orquestador: carga los modulos, arranca la sesion y el service worker. |
| `firebase-config.js` | Claves publicas de Firebase. Unico archivo a personalizar. |
| `sw.js` | Service worker (cache offline). |
| `manifest.json` | Metadatos de la PWA. |
| `firestore.rules` | Reglas de seguridad para publicar en Firebase. |
| `firestore.indexes.json` | Indices compuestos que necesitan las consultas. |
| `icons/` | Iconos de la app (192, 512, maskable) + `logo-fuente.png` (el diseño original, sin usar en runtime). |
| `CHANGELOG.md` | Historial de versiones. |

Modulos (`js/`):

| Modulo | Responsabilidad |
|---|---|
| `config.js` | Constantes de la app. |
| `utils.js` | Funciones puras (formato de dinero/fechas, escape, ids). |
| `firebase.js` | Inicializa Firebase, expone `auth`/`db` y las referencias. |
| `dom.js` | Cache de referencias por `#id` + helpers de UI (hojas, modales, toast). |
| `state.js` | Estado en memoria compartido. |
| `calculos.js` | Datos derivados del estado para el render. |
| `data.js` | Escrituras, suscripciones en tiempo real y guardado del perfil. |
| `render-bus.js` | Puente que rompe la dependencia circular datos <-> render. |
| `render.js` | Pinta todas las pantallas. |
| `sheets.js` | Abrir/cerrar/guardar en hojas inferiores y modales. |
| `navigation.js` | Router de pantallas y barra inferior. |
| `auth.js` | Login/registro y configuracion de cuenta. |
| `clientes.js` | Clientes registrados (crear/editar/borrar en "Mas"). |
| `cobros.js` | Pantalla "Cobros": agrupa deudas por cliente y registra pagos. |
| `actualizacion.js` | Registro del service worker + aviso de version nueva. |
| `pull-refresh.js` | Arrastrar el contenido hacia abajo desde el tope recarga la app. |

## Puesta en marcha

1. Crear un proyecto en [Firebase Console](https://console.firebase.google.com):
   activar **Authentication -> correo/contrasena** y **Firestore Database**.
2. Copiar la configuracion web del proyecto en `firebase-config.js`.
3. Publicar `firestore.rules` en Firestore -> Reglas.
4. Crear los indices de `firestore.indexes.json` (Firestore -> Indices, o
   `firebase deploy --only firestore:indexes`). Sin ellos, "Semanas anteriores"
   y las deudas cobradas esta semana no cargan.
5. Servir la carpeta con cualquier servidor estatico sobre HTTPS (o `localhost`),
   necesario para el service worker. Por ejemplo:

   ```
   npx serve .
   ```

## Datos en Firestore

```
usuarios/{uid}                 -> documento pequeno: frecuentes + meta
usuarios/{uid}/entregas/{id}   -> un documento por domicilio
usuarios/{uid}/gastos/{id}     -> un documento por gasto
usuarios/{uid}/clientes/{id}   -> un documento por cliente (nombre + telefono)
```

Se usan subcolecciones (en vez de un documento con arreglos grandes) para poder
pedir a Firestore solo "lo de esta semana" y mantener la app rapida con miles de
registros.
