/**
 * Firebase Client SDK Setup
 * Initializes Firebase app with credentials from config and exports auth/database instances and functions.
 */
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

// Retrieve Firebase config from global window object (set in firebase-config.js)
const firebaseConfig = window.__FIREBASE_CONFIG__;

// Validate that Firebase config was loaded before proceeding
if (!firebaseConfig?.apiKey) {
  throw new Error(
    "Missing Firebase config. Create firebase-config.js from firebase-config.example.js and set window.__FIREBASE_CONFIG__."
  );
}

// Initialize Firebase app with config credentials
const app = initializeApp(firebaseConfig);

// Get Firebase Authentication instance for sign-in operations
export const auth = getAuth(app);

// Get Firestore database instance for reading/writing listings and contacts
export const db = getFirestore(app);

// Create Google OAuth provider and restrict to BU domain
export const provider = new GoogleAuthProvider();
// Set custom parameter to hint Google sign-in dialog to use bu.edu domain
provider.setCustomParameters({ hd: "bu.edu" });

// Re-export Firebase functions for use throughout the app
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
