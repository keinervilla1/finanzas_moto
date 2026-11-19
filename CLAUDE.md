# CLAUDE.md

Antes de hacer cualquier cosa en este proyecto, lee completo **[DOMI-CONTEXTO.md](DOMI-CONTEXTO.md)**.
Ahí están el objetivo, las reglas, la estructura de datos de Firestore y la hoja de ruta.

Reglas que nunca se rompen (detalle en DOMI-CONTEXTO.md, sección 5):

- Los datos del usuario en Firestore **no se pueden perder ni dañar**.
  No borrar, renombrar ni cambiar el tipo de ningún campo existente.
- Si un cambio puede afectar los datos, **avisar y esperar aprobación** antes de tocar código.
- JavaScript Vanilla + Firebase. Sin frameworks ni dependencias nuevas.
- Versiones pequeñas: cada una actualiza `CHANGELOG.md`, `VERSION_APP` en
  `js/config.js` y la versión de la caché en `sw.js` (y agrega ahí los archivos nuevos).
- Explicar en lenguaje sencillo y en español.
