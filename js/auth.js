import { auth, provider, signInWithPopup, signOut } from "./firebase-client.js";
import { $, show, setErr } from "./dom.js";
import { showPanel } from "./ui.js";

export async function doSignIn() {
  setErr("gate-error", "");

  try {
    const result = await signInWithPopup(auth, provider);
    if (!result.user.email?.endsWith("@bu.edu")) {
      await signOut(auth);
      setErr("gate-error", `You signed in as ${result.user.email}. Please use your @bu.edu account.`);
      show($("gate-error"));
      return;
    }

    showPanel("submit");
  } catch (err) {
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code)) return;

    const unauthorizedDomainMessage =
      location.hostname === "127.0.0.1"
        ? "Domain not authorized. Use http://localhost:4173 for local testing or add both 127.0.0.1 and localhost in Firebase Console -> Authentication -> Settings -> Authorized domains."
        : `Domain not authorized. Firebase Console -> Authentication -> Settings -> Authorized domains -> add \"${location.hostname}\".`;

    const messages = {
      "auth/popup-blocked": "Your browser blocked the sign-in popup — allow popups and try again.",
      "auth/operation-not-allowed": "Google sign-in isn't enabled. Firebase Console -> Authentication -> Sign-in method -> Google -> Enable.",
      "auth/unauthorized-domain": unauthorizedDomainMessage,
    };

    setErr("gate-error", messages[err.code] || `Sign-in failed (${err.code}): ${err.message}`);
    show($("gate-error"));
  }
}
