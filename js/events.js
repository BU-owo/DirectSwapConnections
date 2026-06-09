/**
 * Event Binding
 * Centralizes all DOM event listeners for navigation, filtering, form submission, and interactive elements.
 */
import { state } from "./state.js";
import { $, show, hide } from "./dom.js";
import { auth, signOut } from "./firebase-client.js";
import { doSignIn } from "./auth.js";
import { showPanel, updateFilterActive, clearFilters, renderTable, syncRoommateTotalPeopleField } from "./ui.js";
import { handleSubmit, handleDelete } from "./data.js";

/**
 * Set up all event listeners for the application.
 * Called once on page load to bind click handlers, input events, and navigation.
 */
export function bindEvents() {
  // Get navigation elements for mobile menu control
  const nav = document.querySelector("nav");
  const navMenu = $("nav-menu");
  const navToggle = $("nav-menu-toggle");

  /**
   * Close mobile navigation menu and reset aria attributes.
   */
  const closeNavMenu = () => {
    // Exit early if nav elements don't exist
    if (!nav || !navToggle) return;
    // Remove open state from nav to hide menu
    nav.classList.remove("menu-open");
    // Update aria attribute for accessibility
    navToggle.setAttribute("aria-expanded", "false");
  };

  /**
   * Check if viewport is in mobile breakpoint (980px or smaller).
   * @returns {boolean} True if mobile view
   */
  const isMobileNav = () => window.matchMedia("(max-width: 980px)").matches;

  // ─── Navigation Menu Toggle ────────────────────────────────────────────────────

  // Toggle mobile menu open/closed on hamburger button click
  navToggle?.addEventListener("click", () => {
    // Exit early if nav doesn't exist
    if (!nav) return;
    // Toggle menu-open class to show/hide menu
    const isOpen = nav.classList.toggle("menu-open");
    // Update aria attribute for screen readers
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  // ─── Panel Navigation (Browse/Submit/Home) ─────────────────────────────────────

  // Bind all panel navigation buttons to show the appropriate panel
  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      // Show the panel specified in data-panel attribute
      showPanel(button.dataset.panel);
      // Close mobile menu after navigation
      closeNavMenu();
    });
  });

  // ─── Sign In Handlers ──────────────────────────────────────────────────────────

  // Sign in buttons throughout the page
  document.querySelectorAll("[data-action='signin']").forEach((button) => {
    button.addEventListener("click", () => {
      // Close mobile menu first
      closeNavMenu();
      // Trigger sign-in flow
      doSignIn();
    });
  });

  // Sign in button in nav
  $("btn-signin-nav")?.addEventListener("click", () => {
    closeNavMenu();
    doSignIn();
  });

  // ─── Sign Out Handler ─────────────────────────────────────────────────────────

  // Sign out button - sign user out via Firebase
  $("btn-signout")?.addEventListener("click", () => {
    closeNavMenu();
    // Firebase sign out
    signOut(auth);
  });

  // ─── Edit Listing ─────────────────────────────────────────────────────────────

  // Button to edit existing listing - navigates to submit form
  $("preview-edit-btn")?.addEventListener("click", () => {
    // Show the submit panel with existing listing data
    showPanel("submit");
    closeNavMenu();
  });

  // ─── Search Input ─────────────────────────────────────────────────────────────

  // Search input for filtering listings by text
  const searchInput = $("fi-search");
  searchInput?.addEventListener("input", () => {
    // Get current search value
    const value = searchInput.value;
    // Show clear button if search has text, hide if empty
    value.trim() ? show($("fi-search-clear")) : hide($("fi-search-clear"));

    // Debounce search to avoid excessive re-renders while typing
    // Clear previous timer if it exists
    clearTimeout(state.searchTimer);
    // Set new timer to render table after user stops typing
    state.searchTimer = setTimeout(renderTable, 280);
  });

  // Clear search button - reset search input and re-render
  $("fi-search-clear")?.addEventListener("click", () => {
    // Get the search input element
    const input = $("fi-search");
    // Clear the input value
    if (input) input.value = "";
    // Hide the clear button
    hide($("fi-search-clear"));
    // Re-render table with no search filter
    renderTable();
  });

  // ─── Browse Filters ────────────────────────────────────────────────────────────

  // Listen for changes to all browse filter dropdowns
  ["fi-gender", "fi-campus-group", "fi-building", "fi-layout", "fi-roommate", "fi-sort"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      // Update visual indicator for active filters
      updateFilterActive(id);
      // Re-render table with new filter applied
      renderTable();
    });
  });

  // Clear filters button - reset all filters and re-render
  $("btn-clear")?.addEventListener("click", clearFilters);

  // ─── Form Submission ──────────────────────────────────────────────────────────

  // Main form submission for creating/updating listings
  $("the-form")?.addEventListener("submit", handleSubmit);

  // Delete listing button - remove user's current listing
  $("btn-delete")?.addEventListener("click", handleDelete);

  // ─── Roommate Group Size Field ────────────────────────────────────────────────

  // Radio buttons for "bringing roommate" option
  document.querySelectorAll("[name='f-roommate']").forEach((radio) => {
    radio.addEventListener("change", syncRoommateTotalPeopleField);
  });
  // Initialize field visibility on load
  syncRoommateTotalPeopleField();

  // ─── Character Counters for Text Areas ─────────────────────────────────────────

  // Update character counter for room pitch textarea
  $("f-pitch")?.addEventListener("input", () => {
    // Update the displayed character count
    $("ct-pitch").textContent = $("f-pitch").value.length;
  });

  // Update character counter for additional details textarea
  $("f-details")?.addEventListener("input", () => {
    // Update the displayed character count
    $("ct-details").textContent = $("f-details").value.length;
  });

  // ─── Mobile Menu Close on Outside Click ────────────────────────────────────────

  // Close mobile menu when clicking outside of it
  document.addEventListener("click", (event) => {
    // Only handle if on mobile viewport and menu is open
    if (!isMobileNav() || !nav || !nav.classList.contains("menu-open")) return;
    // Don't close menu if click was inside nav (user might be interacting with menu)
    if (nav.contains(event.target)) return;
    // Close menu for any outside clicks
    closeNavMenu();
  });

  // ─── Mobile Menu Close on Resize ──────────────────────────────────────────────

  // Close mobile menu when window is resized back to desktop
  window.addEventListener("resize", () => {
    // Close menu if now in desktop view
    if (!isMobileNav()) closeNavMenu();
  });
}

  navToggle?.addEventListener("click", () => {
    if (!nav) return;
    const isOpen = nav.classList.toggle("menu-open");
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      showPanel(button.dataset.panel);
      closeNavMenu();
    });
  });

  document.querySelectorAll("[data-action='signin']").forEach((button) => {
    button.addEventListener("click", () => {
      closeNavMenu();
      doSignIn();
    });
  });

  $("btn-signin-nav")?.addEventListener("click", () => {
    closeNavMenu();
    doSignIn();
  });
  $("btn-signout")?.addEventListener("click", () => {
    closeNavMenu();
    signOut(auth);
  });
  $("preview-edit-btn")?.addEventListener("click", () => {
    showPanel("submit");
    closeNavMenu();
  });

  const searchInput = $("fi-search");
  searchInput?.addEventListener("input", () => {
    const value = searchInput.value;
    value.trim() ? show($("fi-search-clear")) : hide($("fi-search-clear"));

    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderTable, 280);
  });

  $("fi-search-clear")?.addEventListener("click", () => {
    const input = $("fi-search");
    if (input) input.value = "";
    hide($("fi-search-clear"));
    renderTable();
  });

  ["fi-gender", "fi-campus-group", "fi-building", "fi-layout", "fi-roommate", "fi-sort"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      updateFilterActive(id);
      renderTable();
    });
  });

  $("btn-clear")?.addEventListener("click", clearFilters);
  $("the-form")?.addEventListener("submit", handleSubmit);
  $("btn-delete")?.addEventListener("click", handleDelete);

  document.querySelectorAll("[name='f-roommate']").forEach((radio) => {
    radio.addEventListener("change", syncRoommateTotalPeopleField);
  });
  syncRoommateTotalPeopleField();

  $("f-pitch")?.addEventListener("input", () => {
    $("ct-pitch").textContent = $("f-pitch").value.length;
  });

  $("f-details")?.addEventListener("input", () => {
    $("ct-details").textContent = $("f-details").value.length;
  });

  document.addEventListener("click", (event) => {
    if (!isMobileNav() || !nav || !nav.classList.contains("menu-open")) return;
    if (nav.contains(event.target)) return;
    closeNavMenu();
  });

  window.addEventListener("resize", () => {
    if (!isMobileNav()) closeNavMenu();
  });
}
