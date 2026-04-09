import { state } from "./state.js";
import { $, show, hide } from "./dom.js";
import { auth, signOut } from "./firebase-client.js";
import { doSignIn } from "./auth.js";
import { showPanel, updateFilterActive, clearFilters, renderTable } from "./ui.js";
import { handleSubmit, handleDelete } from "./data.js";

export function bindEvents() {
  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => showPanel(button.dataset.panel));
  });

  document.querySelectorAll("[data-action='signin']").forEach((button) => {
    button.addEventListener("click", doSignIn);
  });

  $("btn-signin-nav")?.addEventListener("click", doSignIn);
  $("btn-signout")?.addEventListener("click", () => signOut(auth));
  $("preview-edit-btn")?.addEventListener("click", () => showPanel("submit"));

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

  ["fi-gender", "fi-building", "fi-type", "fi-occ", "fi-roommate", "fi-sort"].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      updateFilterActive(id);
      renderTable();
    });
  });

  $("btn-clear")?.addEventListener("click", clearFilters);
  $("the-form")?.addEventListener("submit", handleSubmit);
  $("btn-delete")?.addEventListener("click", handleDelete);

  $("btn-sel-all")?.addEventListener("click", () => {
    document.querySelectorAll("[name='wb']").forEach((checkbox) => {
      checkbox.checked = true;
    });
  });

  $("btn-clr-all")?.addEventListener("click", () => {
    document.querySelectorAll("[name='wb']").forEach((checkbox) => {
      checkbox.checked = false;
    });
  });

  $("f-pitch")?.addEventListener("input", () => {
    $("ct-pitch").textContent = $("f-pitch").value.length;
  });

  $("f-details")?.addEventListener("input", () => {
    $("ct-details").textContent = $("f-details").value.length;
  });
}
