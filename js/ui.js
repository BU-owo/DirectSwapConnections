import {
  CAMPUS_GROUPS,
  BUILDINGS_BY_GROUP,
  ROOM_TYPES,
  OCCUPANCIES,
  getLayoutsForAddress,
  getLayoutsForGroups,
  getBuildingsForGroup,
  getBuildingByName,
  getBuildingByAddress,
} from "./housing-data.js";
import { state } from "./state.js";
import { $, show, hide, esc, setErr, setMsg, getChecked } from "./dom.js";
import { buildRow, showExpandModal } from "./table-formatter.js";

let callbacks = {
  onRequireSignIn: () => {},
  onFiltersChanged: () => {},
};

const normalizeValue = (value) => String(value ?? "").trim().toLowerCase();

function getListingTimestampMs(listing) {
  const timestamp = listing.submittedAt ?? listing.updatedAt;
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function setUiCallbacks(nextCallbacks) {
  callbacks = { ...callbacks, ...nextCallbacks };
}

// ─── Populate all dropdowns and checkboxes on page load ──────────────────────

export function populateOptions() {
  // Form: campus group dropdown for progressive selection
  populateCampusGroupSelect("f-campus-group");

  // Browse: building filter (optgroup too)
  populateBuildingSelect("fi-building");

  // Browse: room type filter
  appendOpts("fi-type", ROOM_TYPES);

  // Browse: occupancy filter
  appendOpts("fi-occ", OCCUPANCIES);

  // Form: "looking for" checkboxes
  appendChecks("w-gender", "wg", ["Male", "Female", "Gender Neutral"]);
  appendChecks("w-campus-group", "wcg", ["Any", ...CAMPUS_GROUPS]);
  updateWantedLayoutStyleOptions();
  appendChecks("w-type", "wt", ROOM_TYPES);
  appendChecks("w-occ", "wo", OCCUPANCIES);
  populateBuildingChecks("w-building", "wb");

  // Progressive current housing flow: campus group -> address -> layout
  $("f-campus-group")?.addEventListener("change", () => updateAddressOptions());
  $("f-building")?.addEventListener("change", updateLayoutOptions);

  // Looking-for flow: selected campus groups control available layout styles
  document.querySelectorAll("[name='wcg']").forEach((checkbox) => {
    checkbox.addEventListener("change", handleWantedCampusGroupChange);
  });

  // Initialize progressive fields as hidden/disabled until previous selections are made
  updateAddressOptions();
}

function populateCampusGroupSelect(selectId) {
  const select = $(selectId);
  if (!select) return;

  CAMPUS_GROUPS.forEach((group) => {
    const opt = document.createElement("option");
    opt.value = group;
    opt.textContent = group;
    select.appendChild(opt);
  });
}

function populateBuildingSelect(selectId) {
  const select = $(selectId);
  if (!select) return;

  for (const [group, buildings] of Object.entries(BUILDINGS_BY_GROUP)) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    buildings.forEach((building) => {
      const opt = document.createElement("option");
      opt.value = building;
      opt.textContent = building;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  }
}

function populateBuildingChecks(wrapperId, name) {
  const wrapper = $(wrapperId);
  if (!wrapper) return;

  for (const [group, buildings] of Object.entries(BUILDINGS_BY_GROUP)) {
    const groupLabel = document.createElement("div");
    groupLabel.className = "check-group-label";
    groupLabel.textContent = group;
    wrapper.appendChild(groupLabel);

    buildings.forEach((building) => {
      const label = document.createElement("label");
      label.className = "check-opt";
      label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(building)}" /> ${esc(building)}`;
      wrapper.appendChild(label);
    });
  }
}

// ─── Layout dropdown (form only) ─────────────────────────────────────────────

export function updateLayoutOptions() {
  const address = $("f-building")?.value;
  const select = $("f-layout");
  const layoutField = $("f-layout-field");
  if (!select) return;

  if (!address) {
    select.innerHTML = `<option value="">Select address first...</option>`;
    select.value = "";
    select.disabled = true;
    hide(layoutField);
    return;
  }

  const layouts = getLayoutsForAddress(address);

  show(layoutField);
  select.disabled = false;

  select.innerHTML = `<option value="">Select layout…</option>`;
  layouts.forEach((layout) => {
    const opt = document.createElement("option");
    opt.value = layout;
    opt.textContent = layout;
    select.appendChild(opt);
  });

  // Reset layout selection when building changes
  select.value = "";
}

function updateAddressOptions(selectedAddress = "") {
  const group = $("f-campus-group")?.value || "";
  const select = $("f-building");
  const addressField = $("f-address-field");
  if (!select) return;

  if (!group) {
    select.disabled = true;
    select.innerHTML = `<option value="">Select campus group first...</option>`;
    select.value = "";
    hide(addressField);
    updateLayoutOptions();
    return;
  }

  const addresses = getBuildingsForGroup(group);
  select.innerHTML = `<option value="">Select address...</option>`;
  addresses.forEach((building) => {
    const opt = document.createElement("option");
    opt.value = building.address;
    opt.textContent = building.name === building.address
      ? building.address
      : `${building.address} (${building.name})`;
    select.appendChild(opt);
  });

  select.disabled = false;
  show(addressField);

  const hasSelectedAddress = selectedAddress && addresses.some((entry) => entry.address === selectedAddress);
  select.value = hasSelectedAddress ? selectedAddress : "";
  updateLayoutOptions();
}

function getSelectedWantedCampusGroups() {
  const selected = getChecked("wcg");
  return selected.includes("Any") ? [...CAMPUS_GROUPS] : selected;
}

function handleWantedCampusGroupChange(event) {
  const changed = event.target;
  const anyCheckbox = document.querySelector("[name='wcg'][value='Any']");
  const groupCheckboxes = [...document.querySelectorAll("[name='wcg']")].filter((checkbox) => checkbox.value !== "Any");
  const previouslySelectedLayouts = getChecked("wls");

  if (changed.value === "Any") {
    groupCheckboxes.forEach((checkbox) => {
      checkbox.checked = changed.checked;
    });
  } else {
    if (!changed.checked && anyCheckbox) anyCheckbox.checked = false;
    if (anyCheckbox && groupCheckboxes.every((checkbox) => checkbox.checked)) {
      anyCheckbox.checked = true;
    }
  }

  updateWantedLayoutStyleOptions(previouslySelectedLayouts);
}

function updateWantedLayoutStyleOptions(selectedLayouts = []) {
  const wrapper = $("w-layout-style");
  if (!wrapper) return;

  const selectedGroups = getSelectedWantedCampusGroups();
  const layouts = getLayoutsForGroups(selectedGroups);

  wrapper.innerHTML = "";

  if (!selectedGroups.length) {
    wrapper.innerHTML = `<span class="fhint">Select at least one campus group first.</span>`;
    return;
  }

  layouts.forEach((layout) => {
    const label = document.createElement("label");
    label.className = "check-opt";
    label.innerHTML = `<input type="checkbox" name="wls" value="${esc(layout)}" /> ${esc(layout)}`;

    const checkbox = label.querySelector("input");
    if (checkbox) checkbox.checked = selectedLayouts.includes(layout);

    wrapper.appendChild(label);
  });
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function appendOpts(selectId, items) {
  const select = $(selectId);
  if (!select) return;
  items.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
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

// ─── Panel switching ──────────────────────────────────────────────────────────

export function showPanel(name) {
  $("panel-browse")?.classList.toggle("hidden", name !== "browse");
  $("panel-submit")?.classList.toggle("hidden", name !== "submit");
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === name);
  });
}

// ─── Filter state ─────────────────────────────────────────────────────────────

export function updateFilterActive(id) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("f-active", el.value !== "" && el.value !== "newest");
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
    const el = $(id);
    if (!el) return;
    el.value = "";
    el.classList.remove("f-active");
  });
  const search = $("fi-search");
  if (search) search.value = "";
  hide($("fi-search-clear"));
  const sort = $("fi-sort");
  if (sort) { sort.value = "newest"; sort.classList.remove("f-active"); }
  hide($("active-badge"));
  callbacks.onFiltersChanged();
}

// ─── Browse table rendering ───────────────────────────────────────────────────

export function renderTable() {
  const tbody = $("listings-tbody");
  if (!tbody) return;

  const searchValue = normalizeValue($("fi-search")?.value || "");
  const filterGender = normalizeValue($("fi-gender")?.value || "");
  const filterBuilding = normalizeValue($("fi-building")?.value || "");
  const filterType = normalizeValue($("fi-type")?.value || "");      // e.g. "traditional"
  const filterOcc = normalizeValue($("fi-occ")?.value || "");        // e.g. "single"
  const filterRoommate = $("fi-roommate")?.value || "";
  const filterSort = $("fi-sort")?.value || "newest";

  const myId = state.currentUser?.uid;
  let list = state.allListings.filter((l) => l.id !== myId);

  if (filterGender)   list = list.filter((l) => normalizeValue(l.housingGender) === filterGender);
  if (filterBuilding) list = list.filter((l) => normalizeValue(l.currentBuilding) === filterBuilding);

  // Type and occupancy filter against the stored roomType / occupancy fields
  // (split from layout at save time — see data.js handleSubmit)
  if (filterType) list = list.filter((l) => normalizeValue(l.roomType) === filterType);
  if (filterOcc)  list = list.filter((l) => normalizeValue(l.occupancy) === filterOcc);

  if (filterRoommate !== "") list = list.filter((l) => String(l.bringingRoommate) === filterRoommate);

  if (searchValue) {
    const terms = searchValue.split(/\s+/).filter(Boolean);
    list = list.filter((l) => {
      const blob = [
        l.currentBuilding, l.layout, l.roomType, l.occupancy,
        l.housingGender, l.pitch, l.otherDetails,
        l.currentCampusGroup, l.currentAddress,
        ...(l.wantedBuildings || []),
        ...(l.wantedCampusGroups || []),
        ...(l.wantedLayoutStyles || []),
        ...(l.wantedTypes || []),
        ...(l.wantedOccupancies || []),
        ...(l.wantedGenders || []),
      ].join(" ").toLowerCase();
      return terms.every((t) => blob.includes(t));
    });
  }

  if (filterSort === "newest") list = [...list].sort((a, b) => getListingTimestampMs(b) - getListingTimestampMs(a));
  if (filterSort === "oldest") list = [...list].sort((a, b) => getListingTimestampMs(a) - getListingTimestampMs(b));
  if (filterSort === "building") {
    list = [...list].sort((a, b) => {
      const cmp = normalizeValue(a.currentBuilding).localeCompare(normalizeValue(b.currentBuilding));
      return cmp !== 0 ? cmp : getListingTimestampMs(b) - getListingTimestampMs(a);
    });
  }

  const totalListings = state.allListings.filter((l) => l.id !== myId).length;
  const resultCount = $("result-count");
  if (resultCount) {
    const anyFilter = searchValue || filterGender || filterBuilding || filterType || filterOcc || filterRoommate;
    resultCount.textContent = anyFilter
      ? `Showing ${list.length} of ${totalListings} listings`
      : `${totalListings} listing${totalListings !== 1 ? "s" : ""}`;
  }

  updateActiveBadge();

  if (!list.length) {
    const anyFilter = searchValue || filterGender || filterBuilding || filterType || filterOcc || filterRoommate;
    tbody.innerHTML = `<tr><td colspan="6" class="td-empty">
      <div class="td-empty-icon">🏠</div>
      <p>${anyFilter
        ? `No listings match your search.<br><button class="clr-link" id="td-clear-btn">Clear all filters →</button>`
        : "No listings yet — be the first to submit!"
      }</p>
    </td></tr>`;
    $("td-clear-btn")?.addEventListener("click", clearFilters);
    return;
  }

  tbody.innerHTML = list.map((l) => buildRow(l, state.currentUser, state.contactsMap)).join("");

  tbody.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showExpandModal(btn.dataset.listingId, state.allListings);
    });
  });

  tbody.querySelectorAll(".contact-locked").forEach((el) => {
    el.addEventListener("click", () => {
      showPanel("submit");
      callbacks.onRequireSignIn();
    });
  });
}

// ─── My listing preview ───────────────────────────────────────────────────────

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
  const wantedCampusGroups = (listing.wantedCampusGroups || []).join(", ") || "—";
  const wantedLayoutStyles = (listing.wantedLayoutStyles || []).join(", ") || "—";
  const wantedTypes = (listing.wantedTypes || []).join(", ") || "—";
  const wantedOccs = (listing.wantedOccupancies || []).join(", ") || "—";
  const wantedBuildings = (listing.wantedBuildings || []).join(", ") || "—";

  body.innerHTML = `
    <div class="preview-col">
      <div class="preview-badges">
        <span class="badge badge-red">${esc(listing.currentBuilding || "—")}</span>
        <span class="badge badge-grey">${esc(listing.layout || "—")}</span>
        <span class="badge badge-blue">${esc(listing.housingGender || "—")}</span>
        ${listing.bringingRoommate ? `<span class="badge badge-gold">+Roommate</span>` : ""}
      </div>
      <div>
        <div class="preview-pitch-label">Your pitch</div>
        <div class="preview-pitch">${esc(listing.pitch || "—")}</div>
        ${listing.otherDetails
          ? `<div style="font-size:.82rem;color:var(--sub);font-style:italic;margin-top:4px">${esc(listing.otherDetails)}</div>`
          : ""}
      </div>
    </div>
    <div class="preview-col">
      <div class="preview-looking">
        <div><b>Looking for gender:</b> ${esc(wantedGenders)}</div>
        <div><b>Campus groups:</b> ${esc(wantedCampusGroups)}</div>
        <div><b>Layout styles:</b> ${esc(wantedLayoutStyles)}</div>
        <div><b>Room types:</b> ${esc(wantedTypes)}</div>
        <div><b>Occupancies:</b> ${esc(wantedOccs)}</div>
        <div><b>Would consider:</b> ${esc(wantedBuildings)}</div>
      </div>
      <div class="preview-contact-note">
        ✅ Your contact info is visible to signed-in BU students
      </div>
    </div>`;

  show(container);
}

// ─── Form fill / reset ────────────────────────────────────────────────────────

export function fillForm(listing, contact) {
  $("f-gender").value = listing.housingGender || "";

  const legacyBuilding = listing.currentBuilding ? getBuildingByName(listing.currentBuilding) : null;
  const buildingByAddress = listing.currentAddress ? getBuildingByAddress(listing.currentAddress) : null;
  const campusGroup = listing.currentCampusGroup || buildingByAddress?.group || legacyBuilding?.group || "";
  const selectedAddress = listing.currentAddress || legacyBuilding?.address || "";

  $("f-campus-group").value = campusGroup;
  updateAddressOptions(selectedAddress);

  // Repopulate layout options for this building, then restore selection
  updateLayoutOptions();
  if (listing.layout) {
    $("f-layout").value = listing.layout;
  }

  document.querySelectorAll("[name='f-roommate']").forEach((r) => {
    r.checked = r.value === String(listing.bringingRoommate);
  });

  $("f-pitch").value = listing.pitch || "";
  $("ct-pitch").textContent = (listing.pitch || "").length;
  $("f-details").value = listing.otherDetails || "";
  $("ct-details").textContent = (listing.otherDetails || "").length;

  document.querySelectorAll("[name='wg']").forEach((cb) => { cb.checked = (listing.wantedGenders || []).includes(cb.value); });
  const wantedCampusGroups = listing.wantedCampusGroups || [];
  const campusGroupChecks = [...document.querySelectorAll("[name='wcg']")];
  campusGroupChecks.forEach((cb) => {
    if (cb.value === "Any") return;
    cb.checked = wantedCampusGroups.includes(cb.value);
  });
  const anyCampusCheckbox = campusGroupChecks.find((cb) => cb.value === "Any");
  if (anyCampusCheckbox) {
    anyCampusCheckbox.checked =
      CAMPUS_GROUPS.length > 0 && CAMPUS_GROUPS.every((group) => wantedCampusGroups.includes(group));
  }

  updateWantedLayoutStyleOptions(listing.wantedLayoutStyles || []);

  document.querySelectorAll("[name='wt']").forEach((cb) => { cb.checked = (listing.wantedTypes || []).includes(cb.value); });
  document.querySelectorAll("[name='wo']").forEach((cb) => { cb.checked = (listing.wantedOccupancies || []).includes(cb.value); });
  document.querySelectorAll("[name='wb']").forEach((cb) => { cb.checked = (listing.wantedBuildings || []).includes(cb.value); });

  $("f-reddit").value = contact.redditUsername || "";
  $("f-phone").value = contact.phone || "";
  $("f-other").value = contact.otherContact || "";
}

export function resetForm() {
  $("the-form")?.reset();
  document.querySelectorAll("#the-form input[type='checkbox'], #the-form input[type='radio']").forEach((i) => { i.checked = false; });

  $("ct-pitch").textContent = "0";
  $("ct-details").textContent = "0";
  $("form-title").textContent = "Submit Your Swap Listing";
  $("form-sub").textContent = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
  $("btn-submit").textContent = "Submit Listing";

  hide($("btn-delete"));
  setErr("form-err", "");
  setMsg("success-msg", "");

  updateAddressOptions(); // clear progressive address/layout options when form resets
  updateWantedLayoutStyleOptions();
}
