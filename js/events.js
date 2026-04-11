import { state } from "./state.js";
import { $, show, hide } from "./dom.js";
import { auth, signOut } from "./firebase-client.js";
import { doSignIn } from "./auth.js";
import { showPanel, updateFilterActive, clearFilters, renderTable, syncRoommateTotalPeopleField } from "./ui.js";
import { handleSubmit, handleDelete } from "./data.js";

export function bindEvents() {
  const nav = document.querySelector("nav");
  const navMenu = $("nav-menu");
  const navToggle = $("nav-menu-toggle");

  const closeNavMenu = () => {
    if (!nav || !navToggle) return;
    nav.classList.remove("menu-open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  const isMobileNav = () => window.matchMedia("(max-width: 980px)").matches;

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

  ["fi-gender", "fi-campus-group", "fi-building", "fi-layout", "fi-laundry", "fi-roommate", "fi-sort"].forEach((id) => {
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
