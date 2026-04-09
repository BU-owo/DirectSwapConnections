import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = window.__FIREBASE_CONFIG__;

if (!firebaseConfig?.apiKey) {
  throw new Error(
    "Missing Firebase config. Create firebase-config.js from firebase-config.example.js and set window.__FIREBASE_CONFIG__."
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

provider.setCustomParameters({ hd: "bu.edu" });

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
};
