/**
 * Authentication Handler
 * Manages Google sign-in flow with BU email domain verification.
 */
import { auth, provider, signInWithPopup, signOut } from "./firebase-client.js";
import { $, show, setErr } from "./dom.js";
import { showPanel } from "./ui.js";

/**
 * Initiate Google sign-in with validation that only BU students can access the platform.
 * Shows error modal if user tries to sign in with non-BU account.
 * Handles popup-related errors and Firebase configuration errors gracefully.
 */
export async function doSignIn() {
  // Clear any previous sign-in errors
  setErr("gate-error", "");

  try {
    // Open Google sign-in popup
    const result = await signInWithPopup(auth, provider);

    // Verify user email ends with @bu.edu domain
    if (!result.user.email?.endsWith("@bu.edu")) {
      // Sign out the user immediately if they don't have BU email
      await signOut(auth);
      // Display error explaining BU email requirement
      setErr("gate-error", `You signed in as ${result.user.email}. Please use your @bu.edu account.`);
      // Make error message visible
      show($("gate-error"));
      return;
    }

    // Successful sign-in with valid BU email - navigate to submit listing page
    showPanel("submit");
  } catch (err) {
    // Silently ignore user-cancelled sign-in attempts
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code)) return;

    // Construct domain authorization error message based on environment
    const unauthorizedDomainMessage =
      location.hostname === "127.0.0.1"
        ? "Domain not authorized. Use http://localhost:4173 for local testing or add both 127.0.0.1 and localhost in Firebase Console -> Authentication -> Settings -> Authorized domains."
        : `Domain not authorized. Firebase Console -> Authentication -> Settings -> Authorized domains -> add \"${location.hostname}\".`;

    // Map Firebase error codes to user-friendly error messages
    const messages = {
      "auth/popup-blocked": "Your browser blocked the sign-in popup — allow popups and try again.",
      "auth/operation-not-allowed": "Google sign-in isn't enabled. Firebase Console -> Authentication -> Sign-in method -> Google -> Enable.",
      "auth/unauthorized-domain": unauthorizedDomainMessage,
    };

    // Display error message corresponding to the error code, or generic error if code not in map
    setErr("gate-error", messages[err.code] || `Sign-in failed (${err.code}): ${err.message}`);
    // Make error message visible
    show($("gate-error"));
  }
}
