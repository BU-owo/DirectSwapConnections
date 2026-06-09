/**
 * Main Application Entry Point (Vanilla JavaScript Version)
 * Initializes the application by setting up UI, event handlers, and real-time listeners.
 * Manages auth state changes, form callbacks, and DOM event binding.
 * Orchestrates the flow between authentication, form submission, and data display.
 */
import { state } from "./js/state.js";
import { $, show, hide } from "./js/dom.js";
import { auth, onAuthStateChanged } from "./js/firebase-client.js";
import {
  populateOptions,
  renderTable,
  renderMyPreview,
  resetForm,
  setUiCallbacks,
} from "./js/ui.js";
import { bindEvents } from "./js/events.js";
import { doSignIn } from "./js/auth.js";
import { startListingsListener, loadUserListing, refreshContacts } from "./js/data.js";

/**
 * Initialize app when DOM is fully loaded
 * Sets up all UI elements, event listeners, and Firebase listeners
 */
document.addEventListener("DOMContentLoaded", () => {
  // Populate all form dropdowns and checkboxes with housing options
  populateOptions();

  // Register callback functions for form events
  setUiCallbacks({
    // Callback when user tries to interact before signing in
    onRequireSignIn: doSignIn,
    // Callback when filter selections change - triggers table re-render
    onFiltersChanged: renderTable,
  });

  // Bind all DOM event listeners (clicks, inputs, form submissions, etc.)
  bindEvents();

  // Start real-time listener for all listings from Firestore
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
