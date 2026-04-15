/**
 * Browse Page
 * Shows active listings with filter/search/sort controls and a signed-in user's listing preview.
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExpandModal from "../components/ExpandModal";
import ContactModal from "../components/ContactModal";
import { useAppContext } from "../context/AppContext";
import {
  BUILDINGS,
  CAMPUS_GROUPS,
  getLargeResidenceAreas,
  getLargeResidenceBuildings,
  getLayoutsForGroups,
  getLayoutsForLargeResidenceSelections,
  getBuildingsWithApartmentLayouts,
  getBuildingsWithOccupancy,
} from "../../js/housing-data.js";
import { LARGE_STYLE_RESIDENCES_GROUP, toMs } from "../lib/listing-helpers";

const FENWAY_CAMPUS_GROUP = "Fenway Campus";
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
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

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Splits "Layout Occupancy" strings (for example, "Suite Double") into sortable parts.
 */
function splitLayout(layout) {
  const parts = String(layout || "").trim().split(" ");
  if (parts.length < 2) return { layoutType: layout, occupancy: "" };
  return {
    occupancy: parts[parts.length - 1],
    layoutType: parts.slice(0, -1).join(" "),
  };
}

/**
 * Applies the same layout ordering used in submit flow so UI is consistent across pages.
 */
function orderLayouts(layouts) {
  return [...layouts].sort((a, b) => {
    const splitA = splitLayout(a);
    const splitB = splitLayout(b);
    const typeA = splitA.layoutType.replace(/-/g, " ");
    const typeB = splitB.layoutType.replace(/-/g, " ");
    const typeRankA = LAYOUT_TYPE_ORDER[typeA] ?? Number.MAX_SAFE_INTEGER;
    const typeRankB = LAYOUT_TYPE_ORDER[typeB] ?? Number.MAX_SAFE_INTEGER;

    if (typeRankA !== typeRankB) return typeRankA - typeRankB;

    const occA = OCCUPANCY_ORDER[splitA.occupancy] ?? Number.MAX_SAFE_INTEGER;
    const occB = OCCUPANCY_ORDER[splitB.occupancy] ?? Number.MAX_SAFE_INTEGER;
    if (occA !== occB) return occA - occB;
    return collator.compare(a, b);
  });
}

export default function BrowsePage() {
  const { listings, user, contactsMap, myListing } = useAppContext();
  const canViewContacts = Boolean(myListing);
  const [expandedId, setExpandedId] = useState("");
  const [contactModalId, setContactModalId] = useState("");
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    gender: [],
    selectedBuildings: [],
    roomTypes: [],
    occupancies: [],
    roommate: [],
    sort: "newest",
  });
  const navigate = useNavigate();

  const largeResidenceAreas = useMemo(() => getLargeResidenceAreas(), []);

  const allLayouts = useMemo(() => {
    // Filter cascade: selected buildings -> available layouts.
    if (!filters.selectedBuildings.length) {
      return orderLayouts(getLayoutsForGroups(CAMPUS_GROUPS));
    }

    // Get unique groups from selected buildings
    const selectedGroups = [...new Set(
      filters.selectedBuildings.map(buildingName => {
        const building = BUILDINGS.find(b => b.name === buildingName);
        return building ? building.group : null;
      }).filter(Boolean)
    )];

    return orderLayouts(getLayoutsForGroups(selectedGroups));
  }, [filters.selectedBuildings]);

  const filteredListings = useMemo(() => {
    // Do not show your own listing in the browse table; it appears in the preview card.
    const mineExcluded = listings.filter((item) => item.id !== user?.uid);

    let next = mineExcluded;
    if (filters.gender.length) next = next.filter((item) => filters.gender.includes(item.housingGender));
    if (filters.selectedBuildings.length) next = next.filter((item) => filters.selectedBuildings.includes(item.currentBuilding));
    if (filters.roomTypes.length) {
      next = next.filter((item) => filters.roomTypes.includes(item.roomType));
    }
    if (filters.occupancies.length) {
      next = next.filter((item) => filters.occupancies.includes(item.occupancy));
    }
    if (filters.roommate.length) next = next.filter((item) => filters.roommate.includes(String(Boolean(item.bringingRoommate))));

    if (filters.search.trim()) {
      const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
      next = next.filter((item) => {
        // Keyword search runs against both current-housing and looking-for fields.
        const haystack = [
          item.currentBuilding,
          item.currentCampusGroup,
          item.currentAddress,
          item.currentLargeResidenceArea,
          item.layout,
          item.roomType,
          item.occupancy,
          item.housingGender,
          item.pitch,
          item.otherDetails,
          ...(item.wantedCampusGroups || []),
          ...(item.wantedLargeResidenceAreas || []),
          ...(item.wantedLargeResidenceBuildings || []),
          ...(item.wantedLayoutStyles || []),
          ...(item.wantedGenders || []),
        ]
          .join(" ")
          .toLowerCase();

        return terms.every((term) => haystack.includes(term));
      });
    }

    if (filters.sort === "newest") {
      next = [...next].sort((a, b) => toMs(b.submittedAt ?? b.updatedAt) - toMs(a.submittedAt ?? a.updatedAt));
    } else if (filters.sort === "oldest") {
      next = [...next].sort((a, b) => toMs(a.submittedAt ?? a.updatedAt) - toMs(b.submittedAt ?? b.updatedAt));
    } else {
      next = [...next].sort((a, b) => collator.compare(a.currentBuilding || "", b.currentBuilding || ""));
    }

    return next;
  }, [filters, listings, user]);

  const totalListings = listings.filter((item) => item.id !== user?.uid).length;
  const hasAnyFilter =
    filters.search ||
    filters.gender.length ||
    filters.selectedBuildings.length ||
    filters.roomTypes.length ||
    filters.occupancies.length ||
    filters.roommate.length;

  const expandedListing = filteredListings.find((item) => item.id === expandedId) || listings.find((item) => item.id === expandedId) || null;

  function openExpandedListing(listingId) {
    setExpandedId(listingId);
  }

  if (!user) {
    return (
      <div id="panel-browse" className="panel">
        <div className="notice-bar">
          <strong>Sign in with your BU Google account</strong> to view listings.
          <button
            className="btn-notice"
            onClick={() => navigate("/submit")}
          >
            login with BU email to see listings
          </button>
        </div>

        <div className="panel-top">
          <div>
            <h2 className="panel-title">Active Swap Listings</h2>
            <p className="result-count">Login with BU email to unlock listings and search filters.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="panel-browse" className="panel">
      {user && myListing ? (() => {
        const myLocation =
          [LARGE_STYLE_RESIDENCES_GROUP, FENWAY_CAMPUS_GROUP, "Student Village"].includes(myListing.currentCampusGroup)
            ? myListing.currentBuilding || "-"
            : myListing.currentCampusGroup || myListing.currentBuilding || "-";
        const myPeopleCount = myListing.bringingRoommate ? Number(myListing.totalPeople || 2) : 1;

        return (
          <div className="my-preview">
            <div className="my-preview-head">
              <div className="my-preview-label">
                <span className="preview-dot"></span>
                Your Active Listing — this is what others see
              </div>
              <button className="btn-ghost-xs" onClick={() => navigate("/submit")}>Edit</button>
            </div>
            <div className="my-preview-row">
              <div className="listing-row-area">
                <span className="badge badge-red">{myLocation}</span>
              </div>
              <div className="listing-row-info">
                <div className="info-details">
                  <span className="badge badge-blue">{myListing.housingGender || "-"}</span>
                  <span className="badge badge-grey">{myListing.roomType || "-"}</span>
                  <span className="badge badge-gold">{myListing.occupancy || "-"}</span>
                  <span className="badge badge-purple">{myPeopleCount} {myPeopleCount === 1 ? "person" : "people"} swapping</span>
                </div>
              </div>
              <div className="listing-row-pitch">
                <div className="pitch-content">
                  <div className="pitch-text">{myListing.pitch || "-"}</div>
                  {myListing.otherDetails && (
                    <div className="pitch-details">{myListing.otherDetails}</div>
                  )}
                </div>
              </div>
              <div className="listing-row-looking">
                <div className="looking-summary">
                  {(myListing.wantedGenders || []).length > 0 && (
                    <div className="looking-val">{myListing.wantedGenders.join(", ")}</div>
                  )}
                  {(myListing.wantedCampusGroups || []).length > 0 && (
                    <div className="looking-val looking-sub">
                      {myListing.wantedCampusGroups.slice(0, 2).join(", ")}
                      {myListing.wantedCampusGroups.length > 2 ? ` +${myListing.wantedCampusGroups.length - 2}` : ""}
                    </div>
                  )}
                  {(myListing.wantedLayoutStyles || []).length > 0 && (
                    <div className="looking-val looking-sub">
                      {myListing.wantedLayoutStyles.slice(0, 2).join(", ")}
                      {myListing.wantedLayoutStyles.length > 2 ? ` +${myListing.wantedLayoutStyles.length - 2}` : ""}
                    </div>
                  )}
                </div>
              </div>
              <div className="listing-row-contact">
                <span className="preview-contact-note">Your contact info is visible to others</span>
              </div>
            </div>
          </div>
        );
      })() : null}

      <div className="panel-top">
        <div>
          <h2 className="panel-title">Active Swap Listings</h2>
          <p className="result-count">
            {hasAnyFilter
              ? `Showing ${filteredListings.length} of ${totalListings} listings`
              : `${totalListings} listing${totalListings === 1 ? "" : "s"}`}
          </p>
        </div>
        <button className="btn-red-sm" onClick={() => navigate("/submit")}>+ Submit Mine</button>
      </div>

      <div className="search-block">
        <div className="search-main-row">
          <div className="search-wrap">
            <input
              className="fi-search-main"
              placeholder="Search by campus group, layout, keywords..."
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </div>
          <button
            className="btn-clear-all"
            onClick={() => {
              setFilters({
                search: "",
                gender: [],
                selectedBuildings: [],
                roomTypes: [],
                occupancies: [],
                roommate: [],
                sort: "newest",
              });
              setFiltersCollapsed(true);
            }}
          >
            Clear all
          </button>
        </div>

        <div className="quick-filters-section">
          <h3 className="section-title">Quick Filters</h3>
          <div className="quick-filters">
            <button
              className={`quick-filter-btn ${filters.roomTypes.includes("Apartment") && filters.roomTypes.includes("Studio") ? "active" : ""}`}
              onClick={() => {
                const hasApartments = filters.roomTypes.includes("Apartment") && filters.roomTypes.includes("Studio");
                const apartmentTypes = ["Apartment", "Studio"];
                const apartmentBuildings = getBuildingsWithApartmentLayouts();

                if (hasApartments) {
                  // Remove all apartment/studio types and apartment buildings
                  setFilters((prev) => ({
                    ...prev,
                    roomTypes: prev.roomTypes.filter((t) => !apartmentTypes.includes(t)),
                    selectedBuildings: prev.selectedBuildings.filter((b) => !apartmentBuildings.includes(b)),
                  }));
                } else {
                  // Add apartment and studio types, and apartment buildings
                  setFilters((prev) => ({
                    ...prev,
                    roomTypes: [...new Set([...prev.roomTypes, ...apartmentTypes])],
                    selectedBuildings: [...new Set([...prev.selectedBuildings, ...apartmentBuildings])],
                  }));
                }
              }}
            >
              Any Apartment
            </button>
            <button
              className={`quick-filter-btn ${filters.occupancies.includes("Single") ? "active" : ""}`}
              onClick={() => {
                const hasSingles = filters.occupancies.includes("Single");
                const singleBuildings = getBuildingsWithOccupancy("Single");

                if (hasSingles) {
                  // Remove single occupancy and single buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: prev.occupancies.filter((o) => o !== "Single"),
                    selectedBuildings: prev.selectedBuildings.filter((b) => !singleBuildings.includes(b)),
                  }));
                } else {
                  // Add single occupancy and single buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: [...new Set([...prev.occupancies, "Single"])],
                    selectedBuildings: [...new Set([...prev.selectedBuildings, ...singleBuildings])],
                  }));
                }
              }}
            >
              Any Single
            </button>
            <button
              className={`quick-filter-btn ${filters.occupancies.includes("Double") ? "active" : ""}`}
              onClick={() => {
                const hasDoubles = filters.occupancies.includes("Double");
                const doubleBuildings = getBuildingsWithOccupancy("Double");

                if (hasDoubles) {
                  // Remove double occupancy and double buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: prev.occupancies.filter((o) => o !== "Double"),
                    selectedBuildings: prev.selectedBuildings.filter((b) => !doubleBuildings.includes(b)),
                  }));
                } else {
                  // Add double occupancy and double buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: [...new Set([...prev.occupancies, "Double"])],
                    selectedBuildings: [...new Set([...prev.selectedBuildings, ...doubleBuildings])],
                  }));
                }
              }}
            >
              Any Double
            </button>
            <button
              className={`quick-filter-btn ${filters.occupancies.includes("Triple") ? "active" : ""}`}
              onClick={() => {
                const hasTriples = filters.occupancies.includes("Triple");
                const tripleBuildings = getBuildingsWithOccupancy("Triple");

                if (hasTriples) {
                  // Remove triple occupancy and triple buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: prev.occupancies.filter((o) => o !== "Triple"),
                    selectedBuildings: prev.selectedBuildings.filter((b) => !tripleBuildings.includes(b)),
                  }));
                } else {
                  // Add triple occupancy and triple buildings
                  setFilters((prev) => ({
                    ...prev,
                    occupancies: [...new Set([...prev.occupancies, "Triple"])],
                    selectedBuildings: [...new Set([...prev.selectedBuildings, ...tripleBuildings])],
                  }));
                }
              }}
            >
              Any Triple
            </button>
          </div>
        </div>

        <div className="fsec">
          <div
            className="fsec-header"
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", cursor: "pointer" }}
          >
            <h3 className="fsec-title" style={{ marginBottom: 0 }}>Detailed Filters</h3>
            <button
              className="btn-ghost-xs"
              onClick={(e) => { e.stopPropagation(); setFiltersCollapsed((prev) => !prev); }}
            >
              {filtersCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          {!filtersCollapsed && (
          <div className="fgrid">
            <div className="ffield">
              <label>Gender Housing</label>
              <div className="checks-inline">
                {["Male", "Female", "Gender Neutral"].map((gender) => (
                  <label className="check-opt" key={gender}>
                    <input
                      type="checkbox"
                      checked={filters.gender.includes(gender)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setFilters((prev) => ({
                          ...prev,
                          gender: checked
                            ? [...prev.gender, gender]
                            : prev.gender.filter((g) => g !== gender),
                        }));
                      }}
                    />
                    {gender}
                  </label>
                ))}
              </div>
            </div>
            <div className="ffield">
              <label>Roommate Status</label>
              <div className="checks-inline">
                <label className="check-opt">
                  <input
                    type="checkbox"
                    checked={filters.roommate.includes("true")}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setFilters((prev) => ({
                        ...prev,
                        roommate: checked
                          ? [...prev.roommate, "true"]
                          : prev.roommate.filter((r) => r !== "true"),
                      }));
                    }}
                  />
                  Bringing +1
                </label>
                <label className="check-opt">
                  <input
                    type="checkbox"
                    checked={filters.roommate.includes("false")}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setFilters((prev) => ({
                        ...prev,
                        roommate: checked
                          ? [...prev.roommate, "false"]
                          : prev.roommate.filter((r) => r !== "false"),
                      }));
                    }}
                  />
                  Not bringing
                </label>
              </div>
            </div>

            <div className="ffield full">
              <label>Campus Groups</label>
              <div className="campus-group-blocks">
                  {CAMPUS_GROUP_BLOCKS.map((block) => {
                    const groups = block.groups.filter((group) => CAMPUS_GROUPS.includes(group));
                    if (!groups.length) return null;

                    return (
                      <div key={block.title} className="campus-group-block">
                        <h4 className="campus-group-block-title">{block.title}</h4>
                        <div className="campus-group-check-list">
                          {block.title === "Large Traditional-Style Residences" ? (
                            // Show individual buildings for Large Traditional
                            BUILDINGS.filter(b => b.group === "Large Traditional-Style Residences").map((building) => (
                              <label key={building.name} className="check-opt">
                                <input
                                  type="checkbox"
                                  checked={filters.selectedBuildings.includes(building.name)}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setFilters((prev) => ({
                                      ...prev,
                                      selectedBuildings: checked
                                        ? [...prev.selectedBuildings, building.name]
                                        : prev.selectedBuildings.filter((b) => b !== building.name),
                                    }));
                                  }}
                                />
                                {building.name}
                              </label>
                            ))
                          ) : block.title === "Fenway Campus" ? (
                            // Show individual buildings for Fenway
                            BUILDINGS.filter(b => b.group === "Fenway Campus").map((building) => (
                              <label key={building.name} className="check-opt">
                                <input
                                  type="checkbox"
                                  checked={filters.selectedBuildings.includes(building.name)}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setFilters((prev) => ({
                                      ...prev,
                                      selectedBuildings: checked
                                        ? [...prev.selectedBuildings, building.name]
                                        : prev.selectedBuildings.filter((b) => b !== building.name),
                                    }));
                                  }}
                                />
                                {building.name}
                              </label>
                            ))
                          ) : (
                            // Show group checkboxes for other blocks
                            groups.map((group) => (
                              <label key={group} className="check-opt">
                                <input
                                  type="checkbox"
                                  checked={filters.selectedBuildings.some(buildingName => {
                                    const building = BUILDINGS.find(b => b.name === buildingName);
                                    return building && building.group === group;
                                  })}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    const groupBuildings = BUILDINGS.filter(b => b.group === group).map(b => b.name);
                                    setFilters((prev) => ({
                                      ...prev,
                                      selectedBuildings: checked
                                        ? [...new Set([...prev.selectedBuildings, ...groupBuildings])]
                                        : prev.selectedBuildings.filter((b) => !groupBuildings.includes(b)),
                                    }));
                                  }}
                                />
                                {group}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="ffield full">
              <label>Room Types</label>
              <div className="checks-inline checks-row">
                {["Traditional", "Suite", "Studio", "Apartment", "Semi-Suite"].map((type) => (
                  <label key={type} className="check-opt">
                    <input
                      type="checkbox"
                      checked={filters.roomTypes.includes(type)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setFilters((prev) => ({
                          ...prev,
                          roomTypes: checked
                            ? [...prev.roomTypes, type]
                            : prev.roomTypes.filter((t) => t !== type),
                        }));
                      }}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <div className="ffield full">
              <label>Occupancy</label>
              <div className="checks-inline checks-row">
                {["Single", "Double", "Triple", "Quad"].map((occ) => (
                  <label key={occ} className="check-opt">
                    <input
                      type="checkbox"
                      checked={filters.occupancies.includes(occ)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setFilters((prev) => ({
                          ...prev,
                          occupancies: checked
                            ? [...prev.occupancies, occ]
                            : prev.occupancies.filter((o) => o !== occ),
                        }));
                      }}
                    />
                    {occ}
                  </label>
                ))}
              </div>
            </div>

          </div>
          )}
          <div className="fsec-sort-row">
            <label className="fsec-sort-label">Sort</label>
            <select value={filters.sort} onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="building">Building A-Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="listings-container">
        <div className="listing-header-row">
          <div className="listing-header-area">Area</div>
          <div className="listing-header-info">Housing Details</div>
          <div className="listing-header-pitch">Room Description</div>
          <div className="listing-header-looking">Looking For</div>
          <div className="listing-header-contact">Contact</div>
          <div className="listing-header-actions">Posted</div>
        </div>

        {!filteredListings.length ? (
          <div className="listing-empty">
            <div className="listing-empty-icon">🏠</div>
            <p>
              {hasAnyFilter
                ? "No listings match your search."
                : myListing
                  ? "No other listings yet, check back soon"
                  : "No listings yet - be the first to submit!"}
            </p>
          </div>
        ) : (
          filteredListings.map((listing) => {
            const contact = contactsMap[listing.id] || {};
            const date = listing.submittedAt?.toDate
              ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "-";

            const cardPrimaryLocation =
              [LARGE_STYLE_RESIDENCES_GROUP, FENWAY_CAMPUS_GROUP, "Student Village"].includes(listing.currentCampusGroup)
                ? listing.currentBuilding || "-"
                : listing.currentCampusGroup || listing.currentBuilding || "-";

            const movingCount = listing.bringingRoommate ? Number(listing.totalPeople || 2) : 1;

            return (
              <div key={listing.id} className="listing-row" onClick={() => setExpandedId(listing.id)} style={{ cursor: "pointer" }}>
                <div className="listing-row-area">
                  <span className="badge badge-red">{cardPrimaryLocation}</span>
                </div>
                <div className="listing-row-info">
                  <div className="info-details">
                    <div className="info-gender">
                      <span className="badge badge-blue">{listing.housingGender || "-"}</span>
                    </div>
                    <div className="info-type">
                      <span className="badge badge-grey">{listing.roomType || "-"}</span>
                    </div>
                    <div className="info-occupancy">
                      <span className="badge badge-gold">{listing.occupancy || "-"}</span>
                    </div>
                    <div className="info-people">
                      <span className="badge badge-purple">{movingCount} {movingCount === 1 ? "person" : "people"} swapping</span>
                    </div>
                  </div>
                </div>
                <div className="listing-row-pitch">
                  <div className="pitch-content">
                    <div className="pitch-text">{listing.pitch || "-"}</div>
                    {listing.otherDetails && (
                      <div className="pitch-details">{listing.otherDetails}</div>
                    )}
                  </div>
                  {(listing.pitch && listing.pitch.length > 100) || (listing.otherDetails && listing.otherDetails.length > 50) ? (
                    <button className="row-expand-btn" onClick={() => setExpandedId(listing.id)}>Read more</button>
                  ) : null}
                </div>
                <div className="listing-row-looking">
                  <div className="looking-summary">
                    {(listing.wantedGenders || []).length > 0 && (
                      <div className="looking-val">{listing.wantedGenders.join(", ")}</div>
                    )}
                    {(listing.wantedCampusGroups || []).length > 0 && (
                      <div className="looking-val looking-sub">
                        {listing.wantedCampusGroups.slice(0, 2).join(", ")}
                        {listing.wantedCampusGroups.length > 2 ? ` +${listing.wantedCampusGroups.length - 2}` : ""}
                      </div>
                    )}
                    {(listing.wantedLayoutStyles || []).length > 0 && (
                      <div className="looking-val looking-sub">
                        {listing.wantedLayoutStyles.slice(0, 2).join(", ")}
                        {listing.wantedLayoutStyles.length > 2 ? ` +${listing.wantedLayoutStyles.length - 2}` : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="listing-row-contact">
                  <button 
                    className="btn-ghost-xs contact-btn" 
                    onClick={(e) => { e.stopPropagation(); setContactModalId(listing.id); }}
                    style={{fontSize: '0.75rem', padding: '4px 8px'}}
                  >
                    Click to see contact
                  </button>
                </div>
                <div className="listing-row-actions">
                  <div className="listing-row-date">{date}</div>
                  <button className="expand-btn" onClick={() => setExpandedId(listing.id)}>Details</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {expandedListing ? <ExpandModal listing={expandedListing} onClose={() => setExpandedId("")} /> : null}
      {contactModalId ? <ContactModal listing={filteredListings.find(l => l.id === contactModalId)} contact={contactsMap[contactModalId]} onClose={() => setContactModalId("")} /> : null}
    </div>
  );
}
