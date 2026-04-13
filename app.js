import { state } from "./js/state.js";
import { $, show, hide } from "./js/dom.js";
import { auth, onAuthStateChanged } from "./js/firebase-client.js";
import {
  populateOptions,
  renderTable,
  renderMyPreview,
  resetForm,
  setUiCallbacks,
  showPanel,
} from "./js/ui.js";
import { bindEvents } from "./js/events.js";
import { doSignIn } from "./js/auth.js";
import { startListingsListener, loadUserListing, refreshContacts } from "./js/data.js";

document.addEventListener("DOMContentLoaded", () => {
  populateOptions();
  showPanel("home");
  setUiCallbacks({
    onRequireSignIn: doSignIn,
    onFiltersChanged: renderTable,
  });
  bindEvents();
  startListingsListener();

  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    if (user) {
      const navAvatar = $("nav-avatar");
      if (navAvatar) {
        navAvatar.src = user.photoURL || "";
        user.photoURL ? show(navAvatar) : hide(navAvatar);
      }

      const navEmail = $("nav-email");
      if (navEmail) navEmail.textContent = user.email;

      hide($("state-out"));
      show($("state-in"));

      hide($("submit-gate"));
      show($("submit-form"));

      const pillAvatar = $("pill-avatar");
      if (pillAvatar) pillAvatar.src = user.photoURL || "";

      const pillEmail = $("pill-email");
      if (pillEmail) pillEmail.textContent = user.email;

      hide($("notice-contact"));

      await loadUserListing();
      await refreshContacts();
      renderTable();
      renderMyPreview();
      return;
    }

    show($("state-out"));
    hide($("state-in"));
    show($("submit-gate"));
    hide($("submit-form"));
    show($("notice-contact"));
    hide($("my-preview"));

    state.hasListing = false;
    state.myListing = null;
    state.contactsMap = {};

    resetForm();
    renderTable();
  });
});
