import { BUILDINGS, ROOM_TYPES, OCCUPANCIES, GENDERS } from "./constants.js";
import { state } from "./state.js";
import { $, show, hide, esc, setErr, setMsg } from "./dom.js";

let callbacks = {
  onRequireSignIn: () => {},
  onFiltersChanged: () => {},
};

export function setUiCallbacks(nextCallbacks) {
  callbacks = { ...callbacks, ...nextCallbacks };
}

export function populateOptions() {
  appendOpts("fi-building", BUILDINGS);
  appendOpts("fi-occ", OCCUPANCIES);
  appendOpts("f-building", BUILDINGS);
  appendOpts("f-occ", OCCUPANCIES);
  appendChecks("w-gender", "wg", GENDERS);
  appendChecks("w-type", "wt", ROOM_TYPES);
  appendChecks("w-occ", "wo", OCCUPANCIES);
  appendChecks("w-building", "wb", BUILDINGS);
}

function appendOpts(selectId, items) {
  const select = $(selectId);
  if (!select) return;
  items.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function appendChecks(wrapperId, name, items) {
  const wrapper = $(wrapperId);
  if (!wrapper) return;

  items.forEach((value) => {
    const label = document.createElement("label");
    label.className = "check-opt";
    label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(value)}" /> ${esc(value)}`;
    wrapper.appendChild(label);
  });
}

export function showPanel(name) {
  $("panel-browse")?.classList.toggle("hidden", name !== "browse");
  $("panel-submit")?.classList.toggle("hidden", name !== "submit");
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === name);
  });
}

export function updateFilterActive(id) {
  const element = $(id);
  if (!element) return;
  element.classList.toggle("f-active", element.value !== "" && element.value !== "newest");
}

function updateActiveBadge() {
  const filterIds = ["fi-gender", "fi-building", "fi-type", "fi-occ", "fi-roommate"];
  const searchValue = ($("fi-search")?.value || "").trim();
  const activeCount = filterIds.filter((id) => $(id)?.value).length + (searchValue ? 1 : 0);
  const badge = $("active-badge");
  const countEl = $("active-count");

  if (!badge || !countEl) return;

  if (activeCount > 0) {
    countEl.textContent = `${activeCount} filter${activeCount > 1 ? "s" : ""} active`;
    show(badge);
  } else {
    hide(badge);
  }
}

export function clearFilters() {
  ["fi-gender", "fi-building", "fi-type", "fi-occ", "fi-roommate"].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.value = "";
    element.classList.remove("f-active");
  });

  const search = $("fi-search");
  if (search) search.value = "";

  hide($("fi-search-clear"));

  const sort = $("fi-sort");
  if (sort) sort.value = "newest";

  hide($("active-badge"));
  callbacks.onFiltersChanged();
}

export function renderMyPreview() {
  const container = $("my-preview");
  const body = $("my-preview-body");
  if (!container || !body) return;

  if (!state.currentUser || !state.hasListing || !state.myListing) {
    hide(container);
    return;
  }

  const listing = state.myListing;
  const wantedGenders = (listing.wantedGenders || []).join(", ") || "—";
  const wantedTypes = (listing.wantedTypes || []).join(", ") || "—";
  const wantedOccupancies = (listing.wantedOccupancies || []).join(", ") || "—";
  const wantedBuildings = (listing.wantedBuildings || []).join(", ") || "—";

  body.innerHTML = `
    <div class="preview-col">
      <div class="preview-badges">
        <span class="badge badge-red">${esc(listing.currentBuilding || "—")}</span>
        <span class="badge badge-grey">${esc(listing.roomType || "—")}</span>
        <span class="badge badge-grey">${esc(listing.occupancy || "—")}</span>
        <span class="badge badge-blue">${esc(listing.housingGender || "—")}</span>
        ${listing.bringingRoommate ? `<span class="badge badge-gold">+Roommate</span>` : ""}
      </div>
      <div>
        <div class="preview-pitch-label">Your pitch</div>
        <div class="preview-pitch">${esc(listing.pitch || "—")}</div>
        ${
          listing.otherDetails
            ? `<div style="font-size:.82rem;color:var(--sub);font-style:italic;margin-top:4px">${esc(listing.otherDetails)}</div>`
            : ""
        }
      </div>
    </div>
    <div class="preview-col">
      <div class="preview-looking">
        <div><b>Looking for gender:</b> ${esc(wantedGenders)}</div>
        <div><b>Room types:</b> ${esc(wantedTypes)}</div>
        <div><b>Occupancies:</b> ${esc(wantedOccupancies)}</div>
        <div><b>Would consider:</b> ${esc(wantedBuildings)}</div>
      </div>
      <div class="preview-contact-note">
        ✅ Your contact info is visible to signed-in BU students
      </div>
    </div>`;

  show(container);
}

export function renderTable() {
  const tbody = $("listings-tbody");
  if (!tbody) return;

  const searchValue = ($("fi-search")?.value || "").trim().toLowerCase();
  const filterGender = $("fi-gender")?.value || "";
  const filterBuilding = $("fi-building")?.value || "";
  const filterType = $("fi-type")?.value || "";
  const filterOccupancy = $("fi-occ")?.value || "";
  const filterRoommate = $("fi-roommate")?.value || "";
  const filterSort = $("fi-sort")?.value || "newest";

  const myId = state.currentUser?.uid;
  let list = state.allListings.filter((listing) => listing.id !== myId);

  if (filterGender) list = list.filter((listing) => listing.housingGender === filterGender);
  if (filterBuilding) list = list.filter((listing) => listing.currentBuilding === filterBuilding);
  if (filterType) list = list.filter((listing) => listing.roomType === filterType);
  if (filterOccupancy) list = list.filter((listing) => listing.occupancy === filterOccupancy);
  if (filterRoommate !== "") list = list.filter((listing) => String(listing.bringingRoommate) === filterRoommate);

  if (searchValue) {
    const terms = searchValue.split(/\s+/).filter(Boolean);
    list = list.filter((listing) => {
      const blob = [
        listing.currentBuilding,
        listing.roomType,
        listing.occupancy,
        listing.housingGender,
        listing.pitch,
        listing.otherDetails,
        ...(listing.wantedBuildings || []),
        ...(listing.wantedTypes || []),
        ...(listing.wantedOccupancies || []),
        ...(listing.wantedGenders || []),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => blob.includes(term));
    });
  }

  if (filterSort === "oldest") list = [...list].reverse();
  if (filterSort === "building") {
    list = [...list].sort((a, b) => (a.currentBuilding || "").localeCompare(b.currentBuilding || ""));
  }

  const totalListings = state.allListings.filter((listing) => listing.id !== myId).length;
  const resultCount = $("result-count");
  if (resultCount) {
    const anyFilter = searchValue || filterGender || filterBuilding || filterType || filterOccupancy || filterRoommate;
    resultCount.textContent = anyFilter
      ? `Showing ${list.length} of ${totalListings} listings`
      : `${totalListings} listing${totalListings !== 1 ? "s" : ""}`;
  }

  updateActiveBadge();

  if (!list.length) {
    const anyFilter = searchValue || filterGender || filterBuilding || filterType || filterOccupancy || filterRoommate;
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">
      <div class="td-empty-icon">🏠</div>
      <p>${
        anyFilter
          ? `No listings match your search.<br><button class="clr-link" id="td-clear-btn">Clear all filters →</button>`
          : "No listings yet — be the first to submit!"
      }</p>
    </td></tr>`;

    $("td-clear-btn")?.addEventListener("click", clearFilters);
    return;
  }

  tbody.innerHTML = list.map(buildRow).join("");
  tbody.querySelectorAll(".contact-locked").forEach((element) => {
    element.addEventListener("click", () => {
      showPanel("submit");
      callbacks.onRequireSignIn();
    });
  });
}

function buildRow(listing) {
  const date = listing.submittedAt?.toDate
    ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  const wantedGenders = (listing.wantedGenders || []).join(", ") || "—";
  const wantedTypes = (listing.wantedTypes || []).join(", ") || "—";
  const wantedOccupancies = (listing.wantedOccupancies || []).join(", ") || "—";
  const wantedBuildings = (listing.wantedBuildings || []).join(", ") || "—";

  let contactCell;
  if (!state.currentUser) {
    contactCell = `<span class="contact-locked" title="Sign in to view">🔒 Sign in to view</span>`;
  } else {
    const contact = state.contactsMap[listing.id] || {};
    const parts = [];

    if (listing.email) parts.push(`<a href="mailto:${esc(listing.email)}" class="contact-link">${esc(listing.email)}</a>`);
    if (contact.redditUsername) parts.push(`<small style="color:var(--sub)">${esc(contact.redditUsername)}</small>`);
    if (contact.phone) parts.push(`<small style="color:var(--sub)">${esc(contact.phone)}</small>`);
    if (contact.otherContact) parts.push(`<small style="color:var(--sub)">${esc(contact.otherContact)}</small>`);

    contactCell = parts.join("<br>") || `<span style="color:#aaa">—</span>`;
  }

  return `<tr>
    <td><span class="badge badge-red">${esc(listing.currentBuilding || "—")}</span></td>
    <td class="td-sub">${esc(listing.roomType || "—")}</td>
    <td class="td-sub">
      ${esc(listing.occupancy || "—")}
      ${listing.bringingRoommate ? `<br><span class="badge badge-gold" style="margin-top:4px">+Roommate</span>` : ""}
    </td>
    <td class="td-sub">${esc(listing.housingGender || "—")}</td>
    <td>
      <div style="max-width:240px">${esc(listing.pitch || "—")}</div>
      ${
        listing.otherDetails
          ? `<div style="font-size:.8rem;color:var(--sub);font-style:italic;margin-top:4px">${esc(listing.otherDetails)}</div>`
          : ""
      }
    </td>
    <td style="font-size:.82rem;min-width:160px;color:var(--sub)">
      <div><b style="color:var(--text)">Gender:</b> ${esc(wantedGenders)}</div>
      <div><b style="color:var(--text)">Type:</b> ${esc(wantedTypes)}</div>
      <div><b style="color:var(--text)">Occ.:</b> ${esc(wantedOccupancies)}</div>
      <div style="max-width:180px"><b style="color:var(--text)">Bldgs:</b> ${esc(wantedBuildings)}</div>
    </td>
    <td style="min-width:140px">${contactCell}</td>
    <td class="td-sub">${date}</td>
  </tr>`;
}

export function fillForm(listing, contact) {
  $("f-gender").value = listing.housingGender || "";
  $("f-building").value = listing.currentBuilding || "";
  $("f-type").value = listing.roomType || "";
  $("f-occ").value = listing.occupancy || "";

  document.querySelectorAll("[name='f-roommate']").forEach((radio) => {
    radio.checked = radio.value === String(listing.bringingRoommate);
  });

  $("f-pitch").value = listing.pitch || "";
  $("ct-pitch").textContent = (listing.pitch || "").length;
  $("f-details").value = listing.otherDetails || "";
  $("ct-details").textContent = (listing.otherDetails || "").length;

  document.querySelectorAll("[name='wg']").forEach((checkbox) => {
    checkbox.checked = (listing.wantedGenders || []).includes(checkbox.value);
  });
  document.querySelectorAll("[name='wt']").forEach((checkbox) => {
    checkbox.checked = (listing.wantedTypes || []).includes(checkbox.value);
  });
  document.querySelectorAll("[name='wo']").forEach((checkbox) => {
    checkbox.checked = (listing.wantedOccupancies || []).includes(checkbox.value);
  });
  document.querySelectorAll("[name='wb']").forEach((checkbox) => {
    checkbox.checked = (listing.wantedBuildings || []).includes(checkbox.value);
  });

  $("f-reddit").value = contact.redditUsername || "";
  $("f-phone").value = contact.phone || "";
  $("f-other").value = contact.otherContact || "";
}

export function resetForm() {
  $("the-form")?.reset();
  document
    .querySelectorAll("#the-form input[type='checkbox'], #the-form input[type='radio']")
    .forEach((input) => {
      input.checked = false;
    });

  $("ct-pitch").textContent = "0";
  $("ct-details").textContent = "0";
  $("form-title").textContent = "Submit Your Swap Listing";
  $("form-sub").textContent = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
  $("btn-submit").textContent = "Submit Listing";

  hide($("btn-delete"));
  setErr("form-err", "");
  setMsg("success-msg", "");
}
