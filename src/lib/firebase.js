import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = window.__FIREBASE_CONFIG__;
export const firebaseConfigError = !firebaseConfig?.apiKey
  ? "Missing Firebase config. Ensure firebase-config.js sets window.__FIREBASE_CONFIG__."
  : "";

let app = null;
let auth = null;
let db = null;
let provider = null;

if (!firebaseConfigError) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: "bu.edu" });
}

export { app, auth, db, provider };
