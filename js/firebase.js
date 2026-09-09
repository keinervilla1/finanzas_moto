/* =========================================================================
   DOMI — Firebase: inicialización y acceso a datos
   Único módulo que conoce la versión del SDK de Firebase y crea las
   instancias `auth` y `db`. El resto de la app importa desde aquí (no desde
   gstatic) para que actualizar la versión sea un cambio de un solo sitio.

   Arquitectura de datos:
   - usuarios/{uid}                → documento pequeño: frecuentes + meta
   - usuarios/{uid}/entregas/{id}  → un documento por domicilio
   - usuarios/{uid}/gastos/{id}    → un documento por gasto
   ========================================================================= */

import { firebaseConfig } from '../firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager, doc, collection
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

// Mantiene la sesión iniciada en este dispositivo aunque se cierre el
// navegador o la app (hasta que el usuario cierre sesión manualmente).
setPersistence(auth, browserLocalPersistence)
  .catch(err => console.warn('Persistencia de sesión:', err));

/* --------------------------- Referencias -------------------------------- */

export function refPerfil(uid) {
  return doc(db, 'usuarios', uid);
}
export function coleccion(uid, nombre) {
  return collection(db, 'usuarios', uid, nombre);
}
export function refDocumento(uid, nombreColeccion, id) {
  return doc(db, 'usuarios', uid, nombreColeccion, id);
}

/* --- Reexport del SDK que usa el resto de la app (así solo este archivo
       depende directamente de la URL de gstatic) --- */
export {
  onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
export {
  setDoc, updateDoc, deleteDoc, deleteField, addDoc,
  onSnapshot, getDocs, query, where, orderBy, limit, startAfter, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
