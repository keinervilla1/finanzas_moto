DOMI - Contexto del Proyecto
¿Qué es DOMI?

DOMI es una Progressive Web App (PWA) desarrollada con JavaScript Vanilla y Firebase.

El objetivo NO es ser una simple aplicación para registrar domicilios.

El objetivo es convertirse en un sistema profesional para repartidores independientes que les permita administrar completamente su trabajo diario.

La aplicación debe ser extremadamente rápida, sencilla y funcionar correctamente desde un teléfono móvil.

Tecnologías
JavaScript Vanilla (NO React, Vue, Angular o TypeScript)
Firebase Authentication
Firestore
PWA
Service Worker

No agregar frameworks nuevos.

No cambiar la tecnología.

Filosofía del proyecto

La aplicación será utilizada muchas veces al día.

Cada acción importante debe tomar menos de 10 segundos.

La interfaz debe ser limpia.

Debe sentirse como una aplicación nativa.

Debe poder crecer durante años sin convertirse en un proyecto difícil de mantener.

Objetivos

La aplicación debe permitir administrar:

Domicilios
Ingresos
Gastos
Cobros
Clientes
Estadísticas
Metas
Productividad

No solamente registrar información.

Debe ayudar al usuario a tomar mejores decisiones.

Principios de desarrollo

Cada cambio debe cumplir estas reglas.

No romper funcionalidades existentes.
Mantener compatibilidad con los datos actuales.
Mantener compatibilidad con Firebase.
No agregar dependencias innecesarias.
Mantener JavaScript Vanilla.
Mantener el diseño existente.
Siempre priorizar simplicidad.
Arquitectura

Actualmente el proyecto está en proceso de refactorización.

El objetivo es llegar a una arquitectura limpia.

La lógica debe estar separada por responsabilidades.

Cuando sea posible dividir el código en módulos.

Ejemplo futuro:

config.js

auth.js

firebase.js

ui.js

navigation.js

domicilios.js

gastos.js

cobros.js

clientes.js

estadisticas.js

utils.js

app.js

La migración debe hacerse progresivamente.

Nunca romper el proyecto por dividir archivos.

Forma de trabajar

No implementar muchas funciones en una sola versión.

Trabajar por versiones pequeñas.

Cada versión debe ser completamente funcional.

Cada versión debe actualizar CHANGELOG.md.

Estilo de código

Priorizar:

legibilidad
simplicidad
mantenibilidad
escalabilidad
rendimiento

No escribir funciones gigantes.

No duplicar código.

No usar variables globales innecesarias.

Agrupar constantes.

Usar nombres claros.

Experiencia de usuario

La aplicación debe poder usarse con una sola mano.

Reducir toques innecesarios.

Reducir formularios largos.

Recordar preferencias del usuario.

Optimizar la velocidad.

Rendimiento

Preparar la aplicación para miles de registros.

Optimizar consultas.

Optimizar renderizados.

Optimizar filtros.

Optimizar historial.

Seguridad

Validar todos los datos.

No confiar en información del cliente.

Mantener Firestore seguro.

Objetivo final

DOMI debe convertirse en una aplicación profesional que pueda comercializarse en el futuro.

Cada cambio debe acercar el proyecto a ese objetivo.