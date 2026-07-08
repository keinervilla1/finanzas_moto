/* =========================================================================
   CONFIGURACIÓN DE FIREBASE
   =========================================================================
   Este es el ÚNICO archivo que tienes que editar con tus propios datos.

   Cómo obtener estos valores:
   1. Ve a https://console.firebase.google.com y crea un proyecto (gratis).
   2. Dentro del proyecto: ⚙️ (ícono de engranaje) → "Configuración del proyecto".
   3. Baja hasta "Tus apps" → clic en el ícono </> (Web) → dale un nombre
      (ej: "Domi Web") → "Registrar app".
   4. Firebase te muestra un objeto `firebaseConfig` — copia esos valores
      exactos y pégalos abajo, reemplazando los que dicen "TU_...".
   5. Guarda este archivo y vuelve a subir los cambios a GitHub.

   No necesitas mantener esto en secreto de forma especial: estas claves
   son públicas por diseño en apps web de Firebase. La seguridad real la
   dan las "Reglas de seguridad" que configuras en Firestore (ver el
   archivo firestore.rules.txt incluido en este proyecto).
   ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA4zdrYZE0CuPkbqfSeovk88jwdoxHbwYY",
  authDomain: "finanzas-moto.firebaseapp.com",
  projectId: "finanzas-moto",
  storageBucket: "finanzas-moto.firebasestorage.app",
  messagingSenderId: "385787435841",
  appId: "1:385787435841:web:aa70f3b42bb49233cc9fc0",
  measurementId: "G-8VGWW818ZV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);