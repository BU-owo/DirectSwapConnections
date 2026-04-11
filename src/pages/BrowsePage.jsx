/**
 * Browse Page
 * Shows active listings with filter/search/sort controls and a signed-in user's listing preview.
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExpandModal from "../components/ExpandModal";
import { useAppContext } from "../context/AppContext";
import {
  CAMPUS_GROUPS,
  getLargeResidenceAreas,
  getLargeResidenceBuildings,
  getLayoutsForGroups,
  getLayoutsForLargeResidenceSelections,
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
  const [expandedId, setExpandedId] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    gender: "",
    campusGroup: "",
    largeResidenceArea: "",
    layout: "",
    laundry: "",
    roommate: "",
    sort: "newest",
  });
  const navigate = useNavigate();

  const largeResidenceAreas = useMemo(() => getLargeResidenceAreas(), []);

  const allLayouts = useMemo(() => {
    // Filter cascade: campus group -> large residence area (if applicable) -> available layouts.
    if (!filters.campusGroup) {
      return orderLayouts(getLayoutsForGroups(CAMPUS_GROUPS));
    }

    if (filters.campusGroup !== LARGE_STYLE_RESIDENCES_GROUP) {
      return orderLayouts(getLayoutsForGroups([filters.campusGroup]));
    }

    if (!filters.largeResidenceArea) {
      return orderLayouts(getLayoutsForGroups([LARGE_STYLE_RESIDENCES_GROUP]));
    }

    const selectedBuildingNames = getLargeResidenceBuildings([filters.largeResidenceArea]).map(
      (building) => building.name
    );
    return orderLayouts(
      getLayoutsForLargeResidenceSelections([filters.largeResidenceArea], selectedBuildingNames)
    );
  }, [filters.campusGroup, filters.largeResidenceArea]);

  const filteredListings = useMemo(() => {
    // Do not show your own listing in the browse table; it appears in the preview card.
    const mineExcluded = listings.filter((item) => item.id !== user?.uid);

    let next = mineExcluded;
    if (filters.gender) next = next.filter((item) => normalize(item.housingGender) === normalize(filters.gender));
    if (filters.campusGroup) next = next.filter((item) => normalize(item.currentCampusGroup) === normalize(filters.campusGroup));
    if (filters.largeResidenceArea) {
      next = next.filter((item) => normalize(item.currentLargeResidenceArea) === normalize(filters.largeResidenceArea));
    }
    if (filters.layout) next = next.filter((item) => normalize(item.layout) === normalize(filters.layout));
    if (filters.laundry !== "") next = next.filter((item) => String(Boolean(item.laundryInBuilding)) === filters.laundry);
    if (filters.roommate !== "") next = next.filter((item) => String(Boolean(item.bringingRoommate)) === filters.roommate);

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
          item.laundryInBuilding ? "laundry yes" : "laundry no",
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
    filters.gender ||
    filters.campusGroup ||
    filters.largeResidenceArea ||
    filters.layout ||
    filters.laundry !== "" ||
    filters.roommate !== "";

  const expandedListing = filteredListings.find((item) => item.id === expandedId) || listings.find((item) => item.id === expandedId) || null;

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
            <p className="result-count">Login with BU email to unlock cards and search filters.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="panel-browse" className="panel">
      {user && myListing ? (
        <div className="my-preview">
          <div className="my-preview-head">
            <div className="my-preview-label">
              <span className="preview-dot"></span>
              Your Active Listing - this is what others see
            </div>
            <button className="btn-ghost-xs" onClick={() => navigate("/submit")}>Edit</button>
          </div>
          <div className="my-preview-body">
            <div className="preview-col">
              <div className="preview-badges">
                <span className="badge badge-red">{myListing.currentCampusGroup || "-"}</span>
                {myListing.currentLargeResidenceArea ? (
                  <span className="badge badge-grey">{myListing.currentLargeResidenceArea}</span>
                ) : null}
                <span className="badge badge-grey">{myListing.layout || "-"}</span>
                <span className="badge badge-blue">{myListing.housingGender || "-"}</span>
                <span className="badge badge-grey">Laundry: {myListing.laundryInBuilding ? "Yes" : "No"}</span>
                {myListing.bringingRoommate ? (
                  <span className="badge badge-gold">
                    +Roommate{myListing.totalPeople ? ` (${myListing.totalPeople} total)` : ""}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="preview-pitch-label">Your pitch</div>
                <div className="preview-pitch">{myListing.pitch || "-"}</div>
                {myListing.otherDetails ? (
                  <div style={{ fontSize: ".82rem", color: "var(--sub)", fontStyle: "italic", marginTop: 4 }}>
                    {myListing.otherDetails}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="preview-col">
              <div className="preview-looking">
                <div><b>Looking for gender:</b> {(myListing.wantedGenders || []).join(", ") || "-"}</div>
                <div><b>Campus groups:</b> {(myListing.wantedCampusGroups || []).join(", ") || "-"}</div>
                {(myListing.wantedCampusGroups || []).includes(LARGE_STYLE_RESIDENCES_GROUP) ? (
                  <>
                    <div><b>Large residence areas:</b> {(myListing.wantedLargeResidenceAreas || []).join(", ") || "-"}</div>
                    <div><b>Large residence buildings:</b> {(myListing.wantedLargeResidenceBuildings || []).join(", ") || "-"}</div>
                  </>
                ) : null}
                <div><b>Layout styles:</b> {(myListing.wantedLayoutStyles || []).join(", ") || "-"}</div>
              </div>
              <div className="preview-contact-note">
                Contact info is visible to signed-in BU students
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
            onClick={() =>
              setFilters({
                search: "",
                gender: "",
                campusGroup: "",
                largeResidenceArea: "",
                layout: "",
                laundry: "",
                roommate: "",
                sort: "newest",
              })
            }
          >
            Clear all
          </button>
        </div>

        <div className="filter-chips">
          <select value={filters.gender} onChange={(event) => setFilters((prev) => ({ ...prev, gender: event.target.value }))}>
            <option value="">All genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Gender Neutral">Gender Neutral</option>
          </select>
          <select
            value={filters.campusGroup}
            onChange={(event) => {
              const nextGroup = event.target.value;
              setFilters((prev) => ({
                ...prev,
                campusGroup: nextGroup,
                largeResidenceArea: "",
                layout: "",
              }));
            }}
          >
            <option value="">All campus groups</option>
            {CAMPUS_GROUP_BLOCKS.map((block) => {
              const groups = block.groups.filter((group) => CAMPUS_GROUPS.includes(group));
              if (!groups.length) return null;
              return (
                <optgroup key={block.title} label={block.title}>
                  {groups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {filters.campusGroup === LARGE_STYLE_RESIDENCES_GROUP ? (
            <select
              value={filters.largeResidenceArea}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  largeResidenceArea: event.target.value,
                  layout: "",
                }))
              }
            >
              <option value="">Large residence area: any</option>
              {largeResidenceAreas.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          ) : null}

          <select
            value={filters.layout}
            onChange={(event) => setFilters((prev) => ({ ...prev, layout: event.target.value }))}
          >
            <option value="">All layouts</option>
            {allLayouts.map((layout) => (
              <option key={layout} value={layout}>{layout}</option>
            ))}
          </select>
          <select value={filters.laundry} onChange={(event) => setFilters((prev) => ({ ...prev, laundry: event.target.value }))}>
            <option value="">Laundry: any</option>
            <option value="true">Laundry: yes</option>
            <option value="false">Laundry: no</option>
          </select>
          <select value={filters.roommate} onChange={(event) => setFilters((prev) => ({ ...prev, roommate: event.target.value }))}>
            <option value="">Roommate: any</option>
            <option value="true">Bringing +1</option>
            <option value="false">Not bringing</option>
          </select>
          <div className="sort-wrap">
            <span className="sort-label">Sort:</span>
            <select value={filters.sort} onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="building">Building A-Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Listing Info</th>
              <th>Room Pitch</th>
              <th className="hidden-mobile">Looking For</th>
              <th>Contact</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {!filteredListings.length ? (
              <tr>
                <td colSpan={6} className="td-empty">
                  <div className="td-empty-icon">🏠</div>
                  <p>{hasAnyFilter ? "No listings match your search." : "No listings yet - be the first to submit!"}</p>
                </td>
              </tr>
            ) : (
              filteredListings.map((listing) => {
                const contact = contactsMap[listing.id] || {};
                const date = listing.submittedAt?.toDate
                  ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "-";

                const cardPrimaryLocation =
                  listing.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP || listing.currentCampusGroup === FENWAY_CAMPUS_GROUP
                    ? listing.currentBuilding || "-"
                    : listing.currentCampusGroup || listing.currentBuilding || "-";

                const movingCount = listing.bringingRoommate ? Number(listing.totalPeople || 2) : 1;

                return (
                  <tr key={listing.id}>
                    <td><span className="badge badge-red">{cardPrimaryLocation}</span></td>
                    <td>
                      <div className="info-badges">
                        <span className="badge badge-blue">{listing.housingGender || "-"}</span>{" "}
                        <span className="badge badge-grey">{listing.roomType || "-"}</span>{" "}
                        <span className="badge badge-grey">{listing.occupancy || "-"}</span>{" "}
                        <span className="badge badge-grey">Laundry: {listing.laundryInBuilding ? "Yes" : "No"}</span>{" "}
                        <span className="badge badge-gold">Number of people swapping: {movingCount}</span>
                      </div>
                    </td>
                    <td>
                      <div>{listing.pitch || "-"}</div>
                      {listing.otherDetails ? <div className="td-sub">{listing.otherDetails}</div> : null}
                    </td>
                    <td className="hidden-mobile">
                      <div className="td-sub">Shown in expanded view</div>
                    </td>
                    <td>
                      <>
                        {listing.email ? <a className="contact-link" href={`mailto:${listing.email}`}>{listing.email}</a> : <span>-</span>}
                        {contact.redditUsername ? <div className="td-sub">{contact.redditUsername}</div> : null}
                        {contact.phone ? <div className="td-sub">{contact.phone}</div> : null}
                        {contact.otherContact ? <div className="td-sub">{contact.otherContact}</div> : null}
                      </>
                    </td>
                    <td>
                      <div>{date}</div>
                      <button className="expand-btn" onClick={() => setExpandedId(listing.id)}>Read more</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {expandedListing ? <ExpandModal listing={expandedListing} onClose={() => setExpandedId("")} /> : null}
    </div>
  );
}
