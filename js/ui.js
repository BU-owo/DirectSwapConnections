import {
  CAMPUS_GROUPS,
  BUILDINGS_BY_GROUP,
  LARGE_STYLE_RESIDENCES_GROUP,
  getLargeResidenceAreas,
  getLargeResidenceBuildings,
  getLayoutsForLargeResidenceSelections,
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

const LAYOUT_COLUMNS = ["Apartment", "Studio", "Traditional", "Suite", "Semi Suite"];
const OCCUPANCY_ORDER = { Single: 1, Double: 2, Triple: 3, Quad: 4 };
const LAYOUT_TYPE_ORDER = {
  Apartment: 1,
  Studio: 2,
  Traditional: 3,
  Suite: 4,
  "Semi Suite": 5,
};
const CAMPUS_GROUP_BLOCKS = [
  {
    title: "Apartments",
    groups: [
      "South Campus Apartments",
      "East Campus Apartments",
      "Central Campus Apartments",
      "Student Village",
    ],
  },
  {
    title: "Large Traditional-Style Residences",
    groups: ["Large Traditional-Style Residences"],
  },
  {
    title: "Fenway Campus",
    groups: ["Fenway Campus"],
  },
  {
    title: "Brownstones",
    groups: [
      "Central Campus Traditional Brownstones",
      "East Campus Traditional Brownstones",
      "South Campus Traditional Brownstones",
    ],
  },
];

const normalizeValue = (value) => String(value ?? "").trim().toLowerCase();
const naturalSort = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

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

  // Browse: campus group + layout filters
  appendOpts("fi-campus-group", [...CAMPUS_GROUPS].sort((a, b) => naturalSort.compare(a, b)));
  appendOpts("fi-layout", getLayoutsForGroups(CAMPUS_GROUPS).sort((a, b) => naturalSort.compare(a, b)));

  // Form: "looking for" checkboxes
  appendChecks("w-gender", "wg", ["Male", "Female", "Gender Neutral"]);
  populateCampusGroupChecks("w-campus-group", "wcg");
  updateWantedLayoutStyleOptions();

  // Progressive current housing flow: campus group -> address -> layout
  $("f-gender")?.addEventListener("change", syncWantedGenderOptions);
  $("f-campus-group")?.addEventListener("change", () => updateAddressOptions());
  $("f-large-area")?.addEventListener("change", () => updateAddressOptions());
  $("f-building")?.addEventListener("change", updateLayoutOptions);

  // Looking-for flow: selected campus groups control available layout styles
  document.querySelectorAll("[name='wcg']").forEach((checkbox) => {
    checkbox.addEventListener("change", handleWantedCampusGroupChange);
  });

  populateLargeResidenceAreaChecks();
  $("w-large-area")?.addEventListener("change", () => {
    const previousLayouts = getChecked("wls");
    const previousBuildings = getChecked("wlb");
    updateLargeResidenceBuildingOptions(previousBuildings);
    updateWantedLayoutStyleOptions(previousLayouts);
  });

  $("w-large-building")?.addEventListener("change", () => {
    const previousLayouts = getChecked("wls");
    updateWantedLayoutStyleOptions(previousLayouts);
  });

  // Initialize progressive fields as hidden/disabled until previous selections are made
  updateAddressOptions();
  syncLargeResidenceLookingForFilters();
  syncWantedGenderOptions();
}

export function syncWantedGenderOptions() {
  const currentHousingGender = $("f-gender")?.value || "";
  const genderChecks = [...document.querySelectorAll("[name='wg']")];

  const allowedByCurrent = {
    Male: new Set(["Male", "Gender Neutral"]),
    Female: new Set(["Female", "Gender Neutral"]),
    "Gender Neutral": new Set(["Male", "Female", "Gender Neutral"]),
  };

  const allowed = allowedByCurrent[currentHousingGender] || new Set(["Male", "Female", "Gender Neutral"]);

  genderChecks.forEach((checkbox) => {
    const label = checkbox.closest("label");
    const enabled = allowed.has(checkbox.value);

    checkbox.disabled = !enabled;
    if (!enabled) checkbox.checked = false;

    if (label) label.classList.toggle("is-disabled", !enabled);
  });
}

function populateCampusGroupSelect(selectId) {
  const select = $(selectId);
  if (!select) return;

  const used = new Set();

  CAMPUS_GROUP_BLOCKS.forEach((block) => {
    const groups = block.groups.filter((group) => CAMPUS_GROUPS.includes(group));
    if (!groups.length) return;

    const optgroup = document.createElement("optgroup");
    optgroup.label = block.title;

    groups.forEach((group) => {
      used.add(group);
      const opt = document.createElement("option");
      opt.value = group;
      opt.textContent = group;
      optgroup.appendChild(opt);
    });

    select.appendChild(optgroup);
  });

  const leftovers = CAMPUS_GROUPS.filter((group) => !used.has(group));
  if (leftovers.length) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = "Other";
    leftovers.forEach((group) => {
      const opt = document.createElement("option");
      opt.value = group;
      opt.textContent = group;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  }
}

function populateCampusGroupChecks(wrapperId, name) {
  const wrapper = $(wrapperId);
  if (!wrapper) return;

  wrapper.innerHTML = "";

  const anyLabel = document.createElement("label");
  anyLabel.className = "check-opt campus-any";
  anyLabel.innerHTML = `<input type="checkbox" name="${name}" value="Any" /> Any`;
  wrapper.appendChild(anyLabel);

  const used = new Set();

  CAMPUS_GROUP_BLOCKS.forEach((block) => {
    const groups = block.groups.filter((group) => CAMPUS_GROUPS.includes(group));
    if (!groups.length) return;

    const blockNode = document.createElement("div");
    blockNode.className = "campus-group-block";

    const title = document.createElement("h4");
    title.className = "campus-group-block-title";
    title.textContent = block.title;
    blockNode.appendChild(title);

    const list = document.createElement("div");
    list.className = "campus-group-check-list";

    groups.forEach((group) => {
      used.add(group);
      const label = document.createElement("label");
      label.className = "check-opt";
      label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(group)}" /> ${esc(group)}`;
      list.appendChild(label);
    });

    blockNode.appendChild(list);
    wrapper.appendChild(blockNode);
  });

  const leftovers = CAMPUS_GROUPS.filter((group) => !used.has(group));
  if (leftovers.length) {
    const blockNode = document.createElement("div");
    blockNode.className = "campus-group-block";

    const title = document.createElement("h4");
    title.className = "campus-group-block-title";
    title.textContent = "Other";
    blockNode.appendChild(title);

    const list = document.createElement("div");
    list.className = "campus-group-check-list";

    leftovers.forEach((group) => {
      const label = document.createElement("label");
      label.className = "check-opt";
      label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(group)}" /> ${esc(group)}`;
      list.appendChild(label);
    });

    blockNode.appendChild(list);
    wrapper.appendChild(blockNode);
  }
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

  const groupedLayouts = layouts.reduce((acc, layout) => {
    const { layoutType, occupancy } = splitLayout(layout);
    const normalizedType = layoutType.replace(/-/g, " ");
    if (!acc[normalizedType]) acc[normalizedType] = [];
    acc[normalizedType].push({ layout, occupancy });
    return acc;
  }, {});

  Object.keys(groupedLayouts)
    .sort((a, b) => {
      const rankA = LAYOUT_TYPE_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
      const rankB = LAYOUT_TYPE_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    })
    .forEach((layoutType) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = layoutType;

      groupedLayouts[layoutType]
        .sort((a, b) => {
          const rankA = OCCUPANCY_ORDER[a.occupancy] ?? Number.MAX_SAFE_INTEGER;
          const rankB = OCCUPANCY_ORDER[b.occupancy] ?? Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
          return a.layout.localeCompare(b.layout);
        })
        .forEach(({ layout }) => {
          const opt = document.createElement("option");
          opt.value = layout;
          opt.textContent = layout;
          optgroup.appendChild(opt);
        });

      select.appendChild(optgroup);
  });

  // Reset layout selection when building changes
  select.value = "";
}

function updateAddressOptions(selectedAddress = "", selectedLargeArea = "") {
  const group = $("f-campus-group")?.value || "";
  const largeAreaField = $("f-large-area-field");
  const largeAreaSelect = $("f-large-area");
  const previousLargeArea = largeAreaSelect?.value || "";
  const select = $("f-building");
  const addressField = $("f-address-field");
  const buildingLabel = $("f-building-label");
  const buildingHint = $("f-building-hint");
  if (!select) return;

  const isLargeResidence = group === LARGE_STYLE_RESIDENCES_GROUP;

  if (largeAreaSelect) {
    largeAreaSelect.innerHTML = `<option value="">Select area first...</option>`;
    getLargeResidenceAreas().forEach((area) => {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = area;
      largeAreaSelect.appendChild(opt);
    });
  }

  if (!group) {
    hide(largeAreaField);
    if (largeAreaSelect) {
      largeAreaSelect.disabled = true;
      largeAreaSelect.value = "";
    }
    select.disabled = true;
    select.innerHTML = `<option value="">Select campus group first...</option>`;
    select.value = "";
    hide(addressField);
    updateLayoutOptions();
    return;
  }

  if (isLargeResidence) {
    show(largeAreaField);
    if (largeAreaSelect) {
      largeAreaSelect.disabled = false;
      const nextArea = selectedLargeArea || previousLargeArea;
      largeAreaSelect.value = getLargeResidenceAreas().includes(nextArea) ? nextArea : "";
    }
  } else {
    hide(largeAreaField);
    if (largeAreaSelect) {
      largeAreaSelect.disabled = true;
      largeAreaSelect.value = "";
    }
  }

  if (buildingLabel) {
    buildingLabel.innerHTML = isLargeResidence
      ? "Current Building Name <span class=\"req\">*</span> <em class=\"hint\">Private</em>"
      : "Current Address <span class=\"req\">*</span> <em class=\"hint\">Private</em>";
  }

  if (buildingHint) {
    buildingHint.textContent = isLargeResidence
      ? "For Large Traditional-Style Residences, choose your area first, then your building."
      : "This is private and only used to match the correct layout options.";
  }

  const addresses = getBuildingsForGroup(group);
  select.innerHTML = `<option value="">Select address...</option>`;

  const activeLargeArea = largeAreaSelect?.value || "";
  const filteredAddresses = isLargeResidence
    ? addresses.filter((building) => building.area === activeLargeArea)
    : addresses;

  const sortedAddresses = [...filteredAddresses].sort((a, b) => {
    const keyA = isLargeResidence ? a.name : a.address;
    const keyB = isLargeResidence ? b.name : b.address;
    return naturalSort.compare(keyA, keyB);
  });

  if (isLargeResidence && !activeLargeArea) {
    select.disabled = true;
    select.innerHTML = `<option value="">Select area first...</option>`;
    show(addressField);
    select.value = "";
    updateLayoutOptions();
    return;
  }

  sortedAddresses.forEach((building) => {
    const opt = document.createElement("option");
    opt.value = building.address;
    opt.textContent = isLargeResidence
      ? `${building.name}${building.address ? ` (${building.address})` : ""}`
      : (building.name === building.address ? building.address : `${building.address} (${building.name})`);
    select.appendChild(opt);
  });

  select.disabled = false;
  show(addressField);

  const hasSelectedAddress = selectedAddress && sortedAddresses.some((entry) => entry.address === selectedAddress);
  select.value = hasSelectedAddress ? selectedAddress : "";
  updateLayoutOptions();
}

function getSelectedWantedCampusGroups() {
  const selected = getChecked("wcg");
  return selected.includes("Any") ? [...CAMPUS_GROUPS] : selected;
}

function getSelectedLargeResidenceAreas() {
  return getChecked("wla");
}

function getSelectedLargeResidenceBuildings() {
  return getChecked("wlb");
}

function isLargeResidenceLookingForSelected() {
  return getSelectedWantedCampusGroups().includes(LARGE_STYLE_RESIDENCES_GROUP);
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

  syncLargeResidenceLookingForFilters(undefined, undefined, previouslySelectedLayouts);
}

function populateLargeResidenceAreaChecks(selectedAreas = []) {
  const wrapper = $("w-large-area");
  if (!wrapper) return;

  wrapper.innerHTML = "";
  getLargeResidenceAreas().forEach((area) => {
    const label = document.createElement("label");
    label.className = "check-opt";
    label.innerHTML = `<input type="checkbox" name="wla" value="${esc(area)}" /> ${esc(area)}`;

    const checkbox = label.querySelector("input");
    if (checkbox) checkbox.checked = selectedAreas.includes(area);

    wrapper.appendChild(label);
  });
}

function updateLargeResidenceBuildingOptions(selectedBuildings = []) {
  const wrapper = $("w-large-building");
  if (!wrapper) return;

  const selectedAreas = getSelectedLargeResidenceAreas();
  wrapper.innerHTML = "";

  if (!selectedAreas.length) {
    wrapper.innerHTML = `<p class="fhint" style="margin:0">Select at least one area to choose building names.</p>`;
    return;
  }

  const buildings = getLargeResidenceBuildings(selectedAreas)
    .sort((a, b) => naturalSort.compare(a.name, b.name));

  buildings.forEach((building) => {
    const label = document.createElement("label");
    label.className = "check-opt";
    label.innerHTML = `<input type="checkbox" name="wlb" value="${esc(building.name)}" /> ${esc(building.name)}`;

    const checkbox = label.querySelector("input");
    if (checkbox) checkbox.checked = selectedBuildings.includes(building.name);

    wrapper.appendChild(label);
  });
}

function syncLargeResidenceLookingForFilters(
  selectedAreas = getSelectedLargeResidenceAreas(),
  selectedBuildings = getSelectedLargeResidenceBuildings(),
  selectedLayouts = getChecked("wls")
) {
  const field = $("w-large-filters-field");
  if (!field) return;

  if (!isLargeResidenceLookingForSelected()) {
    hide(field);
    populateLargeResidenceAreaChecks([]);
    updateLargeResidenceBuildingOptions([]);
    updateWantedLayoutStyleOptions(selectedLayouts);
    return;
  }

  show(field);
  populateLargeResidenceAreaChecks(selectedAreas);
  updateLargeResidenceBuildingOptions(selectedBuildings);
  updateWantedLayoutStyleOptions(selectedLayouts);
}

function updateWantedLayoutStyleOptions(selectedLayouts = []) {
  const wrapper = $("w-layout-style");
  if (!wrapper) return;

  const selectedGroups = getSelectedWantedCampusGroups();
  const largeSelected = selectedGroups.includes(LARGE_STYLE_RESIDENCES_GROUP);
  const nonLargeGroups = selectedGroups.filter((group) => group !== LARGE_STYLE_RESIDENCES_GROUP);
  const selectedLargeAreas = getSelectedLargeResidenceAreas();
  const selectedLargeBuildings = getSelectedLargeResidenceBuildings();

  const layouts = [
    ...new Set([
      ...(nonLargeGroups.length ? getLayoutsForGroups(nonLargeGroups) : []),
      ...(largeSelected
        ? getLayoutsForLargeResidenceSelections(selectedLargeAreas, selectedLargeBuildings)
        : []),
    ]),
  ];

  wrapper.innerHTML = "";

  if (!selectedGroups.length) {
    wrapper.innerHTML = `<span class="fhint">Select at least one campus group first.</span>`;
    return;
  }

  if (largeSelected && !selectedLargeAreas.length) {
    wrapper.innerHTML = `<span class="fhint">Select at least one Large Residence area first.</span>`;
    return;
  }

  if (largeSelected && !selectedLargeBuildings.length) {
    wrapper.innerHTML = `<span class="fhint">Select at least one Large Residence building before choosing layouts.</span>`;
    return;
  }

  const groupedLayouts = LAYOUT_COLUMNS.reduce((acc, column) => {
    acc[column] = [];
    return acc;
  }, {});

  layouts.forEach((layout) => {
    const { layoutType, occupancy } = splitLayout(layout);
    const normalizedType = layoutType.replace(/-/g, " ");
    const column = normalizedType === "Semi Suite" ? "Semi Suite" : normalizedType;
    if (groupedLayouts[column]) {
      groupedLayouts[column].push({ layout, occupancy });
    }
  });

  LAYOUT_COLUMNS.forEach((column) => {
    const columnNode = document.createElement("div");
    columnNode.className = "layout-col";

    const title = document.createElement("h4");
    title.className = "layout-col-title";
    title.textContent = column;
    columnNode.appendChild(title);

    const items = groupedLayouts[column]
      .sort((a, b) => {
        const rankA = OCCUPANCY_ORDER[a.occupancy] ?? Number.MAX_SAFE_INTEGER;
        const rankB = OCCUPANCY_ORDER[b.occupancy] ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return a.layout.localeCompare(b.layout);
      });

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "layout-col-empty";
      empty.textContent = "No options";
      columnNode.appendChild(empty);
      wrapper.appendChild(columnNode);
      return;
    }

    items.forEach(({ layout }) => {
      const label = document.createElement("label");
      label.className = "check-opt";
      label.innerHTML = `<input type="checkbox" name="wls" value="${esc(layout)}" /> ${esc(layout)}`;

      const checkbox = label.querySelector("input");
      if (checkbox) checkbox.checked = selectedLayouts.includes(layout);

      columnNode.appendChild(label);
    });

    wrapper.appendChild(columnNode);
  });
}

function splitLayout(layout) {
  const parts = String(layout || "").trim().split(" ");
  if (parts.length < 2) return { layoutType: layout, occupancy: "" };
  return {
    occupancy: parts[parts.length - 1],
    layoutType: parts.slice(0, -1).join(" "),
  };
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
  $("panel-home")?.classList.toggle("hidden", name !== "home");
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
  const filterIds = ["fi-gender", "fi-campus-group", "fi-building", "fi-layout", "fi-roommate"];
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
  ["fi-gender", "fi-campus-group", "fi-building", "fi-layout", "fi-roommate"].forEach((id) => {
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
  const filterCampusGroup = normalizeValue($("fi-campus-group")?.value || "");
  const filterBuilding = normalizeValue($("fi-building")?.value || "");
  const filterLayout = normalizeValue($("fi-layout")?.value || "");

  const filterRoommate = $("fi-roommate")?.value || "";
  const filterSort = $("fi-sort")?.value || "newest";

  const myId = state.currentUser?.uid;
  let list = state.allListings.filter((l) => l.id !== myId);

  if (filterGender)   list = list.filter((l) => normalizeValue(l.housingGender) === filterGender);
  if (filterCampusGroup) list = list.filter((l) => normalizeValue(l.currentCampusGroup) === filterCampusGroup);
  if (filterBuilding) list = list.filter((l) => normalizeValue(l.currentBuilding) === filterBuilding);
  if (filterLayout) list = list.filter((l) => normalizeValue(l.layout) === filterLayout);

  if (filterRoommate !== "") list = list.filter((l) => String(l.bringingRoommate) === filterRoommate);

  if (searchValue) {
    const terms = searchValue.split(/\s+/).filter(Boolean);
    list = list.filter((l) => {
      const blob = [
        l.currentBuilding, l.layout, l.roomType, l.occupancy,
        l.housingGender, l.pitch, l.otherDetails,
        l.currentCampusGroup, l.currentAddress, l.currentLargeResidenceArea,
        ...(l.wantedCampusGroups || []),
        ...(l.wantedLargeResidenceAreas || []),
        ...(l.wantedLargeResidenceBuildings || []),
        ...(l.wantedLayoutStyles || []),
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
    const anyFilter = searchValue || filterGender || filterCampusGroup || filterBuilding || filterLayout || filterRoommate;
    resultCount.textContent = anyFilter
      ? `Showing ${list.length} of ${totalListings} listings`
      : `${totalListings} listing${totalListings !== 1 ? "s" : ""}`;
  }

  updateActiveBadge();

  if (!list.length) {
    const anyFilter = searchValue || filterGender || filterCampusGroup || filterBuilding || filterLayout || filterRoommate;
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
  const wantedLargeAreas = (listing.wantedLargeResidenceAreas || []).join(", ") || "—";
  const wantedLargeBuildings = (listing.wantedLargeResidenceBuildings || []).join(", ") || "—";
  const wantedLayoutStyles = (listing.wantedLayoutStyles || []).join(", ") || "—";

  body.innerHTML = `
    <div class="preview-col">
      <div class="preview-badges">
        <span class="badge badge-red">${esc(listing.currentBuilding || "—")}</span>
        ${listing.currentLargeResidenceArea ? `<span class="badge badge-grey">${esc(listing.currentLargeResidenceArea)}</span>` : ""}
        <span class="badge badge-grey">${esc(listing.layout || "—")}</span>
        <span class="badge badge-blue">${esc(listing.housingGender || "—")}</span>
        ${listing.bringingRoommate
          ? `<span class="badge badge-gold">+Roommate${listing.totalPeople ? ` (${esc(listing.totalPeople)} total)` : ""}</span>`
          : ""}
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
        ${(listing.wantedCampusGroups || []).includes(LARGE_STYLE_RESIDENCES_GROUP)
          ? `<div><b>Large residence areas:</b> ${esc(wantedLargeAreas)}</div>
             <div><b>Large residence buildings:</b> ${esc(wantedLargeBuildings)}</div>`
          : ""}
        <div><b>Layout styles:</b> ${esc(wantedLayoutStyles)}</div>
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
  const largeResidenceArea = listing.currentLargeResidenceArea || buildingByAddress?.area || legacyBuilding?.area || "";

  $("f-campus-group").value = campusGroup;
  updateAddressOptions(selectedAddress, largeResidenceArea);

  // Repopulate layout options for this building, then restore selection
  updateLayoutOptions();
  if (listing.layout) {
    $("f-layout").value = listing.layout;
  }

  document.querySelectorAll("[name='f-roommate']").forEach((r) => {
    r.checked = r.value === String(listing.bringingRoommate);
  });

  if ($("f-total-people")) {
    $("f-total-people").value = listing.totalPeople ? String(listing.totalPeople) : "";
  }
  syncRoommateTotalPeopleField();

  $("f-pitch").value = listing.pitch || "";
  $("ct-pitch").textContent = (listing.pitch || "").length;
  $("f-details").value = listing.otherDetails || "";
  $("ct-details").textContent = (listing.otherDetails || "").length;

  document.querySelectorAll("[name='wg']").forEach((cb) => { cb.checked = (listing.wantedGenders || []).includes(cb.value); });
  syncWantedGenderOptions();
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

  syncLargeResidenceLookingForFilters(
    listing.wantedLargeResidenceAreas || [],
    listing.wantedLargeResidenceBuildings || [],
    listing.wantedLayoutStyles || []
  );

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
  syncLargeResidenceLookingForFilters([], [], []);
  syncRoommateTotalPeopleField();
  syncWantedGenderOptions();
}

export function syncRoommateTotalPeopleField() {
  const field = $("f-total-people-field");
  const input = $("f-total-people");
  const roommateSelection = document.querySelector("[name='f-roommate']:checked")?.value;
  if (!field || !input) return;

  const withRoommate = roommateSelection === "true";
  if (withRoommate) {
    show(field);
    input.disabled = false;
    return;
  }

  hide(field);
  input.disabled = true;
  input.value = "";
}
