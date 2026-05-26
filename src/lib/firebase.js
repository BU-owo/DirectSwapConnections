/**
 * Firebase Bootstrap & Initialization
 * Initializes Firebase SDK clients from runtime config injected by firebase-config.js.
 * Exports nullable SDK instances (can be null if config is missing) so the app can render a readable config error state.
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Retrieve Firebase config from global window object (set by firebase-config.js)
const firebaseConfig = window.__FIREBASE_CONFIG__;

/**
 * Error message if Firebase config is missing - displayed to user if initialization fails
 * @type {string}
 */
export const firebaseConfigError = !firebaseConfig?.apiKey
  ? "Missing Firebase config. Ensure firebase-config.js sets window.__FIREBASE_CONFIG__."
  : "";

// Initialize Firebase SDK instances as nullable so app remains runnable even if config is missing

// Firebase app instance
let app = null;
// Firebase Authentication instance
let auth = null;
// Firestore database instance
let db = null;
// Google OAuth provider for sign-in
let provider = null;

// Only initialize Firebase if config is present (keep startup resilient)
// UI will show firebaseConfigError message if config is missing
if (!firebaseConfigError) {
  // Initialize Firebase app with config credentials
  app = initializeApp(firebaseConfig);
  // Get auth instance for sign-in operations
  auth = getAuth(app);
  // Get Firestore database instance for data operations
  db = getFirestore(app);
  // Create Google OAuth provider and restrict to BU domain
  provider = new GoogleAuthProvider();
  // Set custom parameter to hint Google sign-in to use bu.edu domain
  provider.setCustomParameters({ hd: "bu.edu" });
}

// Export all instances (some may be null if Firebase not initialized)
export { app, auth, db, provider };
