/**
 * Expand Modal Component - Listing Details View
 * Displays full details of a housing listing in a modal dialog.
 * Shows what the lister is looking for with compatibility highlighting if user has their own listing.
 */
import React, { useMemo } from "react";
import { BUILDINGS } from "../../js/housing-data.js";

/**
 * Named building groups that require explicit building selection (not campus group).
 * These groups don't use campus group filters - instead, users select specific buildings.
 * @type {Set<string>}
 */
const NAMED_BUILDING_GROUPS = new Set([
  "Large Traditional-Style Residences",
  "Fenway Campus",
  "Student Village",
]);

/**
 * Ordering for building types - determines visual grouping and display order.
 * Apartments appear first, then brownstones, large residences, Fenway, Student Village.
 * @type {Object}
 */
const BUILDING_TYPE_ORDER = {
  "tone-apartment": 1,      // South/East/Central Campus Apartments
  "tone-brownstone": 2,     // Traditional brownstones
  "tone-large": 3,          // Large Traditional-Style Residences
  "tone-fenway": 4,         // Fenway Campus buildings
  "tone-stuvi": 5,          // Student Village
  "tone-generic": 99,       // Unknown/other types
};

/**
 * Ordering for room occupancy sizes - single rooms appear before doubles, etc.
 * @type {Object}
 */
const LAYOUT_OCCUPANCY_ORDER = {
  Single: 1,
  Double: 2,
  Triple: 3,
  Quad: 4,
};

/**
 * ExpandModal Component - Display full listing details with compatibility matching
 * Shows what the lister is looking for and highlights matches if user has their own listing.
 * @param {Object} props - Component props
 * @param {Object} props.listing - Listing data to display
 * @param {Object|null} props.myListing - Current user's listing (null if no listing)
 * @param {Function} props.onClose - Callback to close the modal
 */
export default function ExpandModal({ listing, myListing, onClose }) {
  // Extract user's housing details for matching logic
  const myLayout = myListing?.layout || "";
  const myCampusGroup = myListing?.currentCampusGroup || "";
  const myBuilding = myListing?.currentBuilding || "";
  const myHousingGender = myListing?.housingGender || "";
  const wantedGenders = listing.wantedGenders || [];

  // Determine what location label to show based on campus group type
  // Named groups (Large Residences, Fenway) show building name; others show campus group
  const currentLocation = NAMED_BUILDING_GROUPS.has(listing.currentCampusGroup)
    ? listing.currentBuilding || listing.currentCampusGroup || "-"
    : listing.currentCampusGroup || listing.currentBuilding || "-";

  // ─── Memoized Utilities ────────────────────────────────────────────────────────

  /**
   * Collator for numeric and case-insensitive string sorting
   * Memoized to prevent recreating on every render
   */
  const collator = useMemo(
    () => new Intl.Collator("en", { numeric: true, sensitivity: "base" }),
    []
  );

  /**
   * Map of building name to campus group
   * Memoized for O(1) lookup of building groups
   */
  const buildingGroupByName = useMemo(
    () => new Map(BUILDINGS.map((building) => [building.name, building.group])),
    []
  );

  /**
   * Map campus group name to a visual tone/color class for display
   * Used to color-code buildings by type (apartments, brownstones, etc.)
   * @param {string} groupName - Campus group name
   * @returns {string} CSS class tone name (e.g., "tone-apartment")
   */
  function buildingToneForGroup(groupName) {
    // Default to generic if no group
    if (!groupName) return "tone-generic";
    // Color apartments
    if (groupName.includes("Apartments")) return "tone-apartment";
    // Color brownstones
    if (groupName.includes("Brownstones")) return "tone-brownstone";
    // Color large residences
    if (groupName === "Large Traditional-Style Residences") return "tone-large";
    // Color Fenway buildings
    if (groupName === "Fenway Campus") return "tone-fenway";
    // Color Student Village
    if (groupName === "Student Village") return "tone-stuvi";
    // Default tone for unknown groups
    return "tone-generic";
  }

  /**
   * Split a layout string like "Traditional Double" into type and occupancy
   * @param {string} layout - Layout string to split
   * @returns {Object} {layoutType: "Traditional", occupancy: "Double"}
   */
  function splitLayout(layout) {
    // Split string into words
    const parts = String(layout || "").trim().split(" ");
    // If only one word or less, can't split - treat entire string as layout type
    if (parts.length < 2) return { layoutType: String(layout || ""), occupancy: "" };
    // Last word is occupancy (Single, Double, Triple, Quad)
    // Everything before is layout type (Traditional, Suite, etc.)
    return {
      occupancy: parts[parts.length - 1],
      layoutType: parts.slice(0, -1).join(" "),
    };
  }

  // ─── Memoized Derived Data ─────────────────────────────────────────────────────

  /**
   * Build and sort list of wanted buildings/campus groups with match highlighting
   * Memoized to prevent recalculation when props don't change
   */
  const wantedBuildings = useMemo(() => {
    // Track already-seen labels to avoid duplicates
    const seenLabels = new Set();
    const items = [];

    // Get list of campus groups this lister is interested in
    const selectedGroups = listing.wantedCampusGroups || [];

    // Add campus groups (excluding named-building groups which use explicit buildings)
    selectedGroups.forEach((groupName) => {
      // Skip named-building groups - they only show as explicit buildings
      if (NAMED_BUILDING_GROUPS.has(groupName)) {
        return;
      }

      // Skip if already added (shouldn't happen, but safe to check)
      if (seenLabels.has(groupName)) return;
      seenLabels.add(groupName);

      // Create item for this campus group with match status
      items.push({
        key: `group:${groupName}`,
        label: groupName,
        tone: buildingToneForGroup(groupName),
        // Mark as match if user's campus group equals this one
        isMatch: Boolean(myListing && groupName === myCampusGroup),
      });
    });

    // Add specific large residence buildings (with match highlighting)
    (listing.wantedLargeResidenceBuildings || []).forEach((buildingName) => {
      // Skip if already added
      if (seenLabels.has(buildingName)) return;
      seenLabels.add(buildingName);

      // Create item for this specific building
      items.push({
        key: `building:${buildingName}`,
        label: buildingName,
        tone: buildingToneForGroup(buildingGroupByName.get(buildingName)),
        // Mark as match if user's building equals this one
        isMatch: Boolean(myListing && buildingName === myBuilding),
      });
    });

    // Sort by building tone first (apartments before brownstones, etc.), then alphabetically
    return items.sort((a, b) => {
      // Get display order for each tone (apartments=1, brownstones=2, etc.)
      const toneRankA = BUILDING_TYPE_ORDER[a.tone] ?? BUILDING_TYPE_ORDER["tone-generic"];
      const toneRankB = BUILDING_TYPE_ORDER[b.tone] ?? BUILDING_TYPE_ORDER["tone-generic"];
      // Sort by tone rank first
      if (toneRankA !== toneRankB) return toneRankA - toneRankB;
      // For same tone, sort alphabetically (natural sort handles numbers correctly)
      return collator.compare(a.label, b.label);
    });
  }, [buildingGroupByName, collator, listing.wantedCampusGroups, listing.wantedLargeResidenceBuildings, myBuilding, myCampusGroup, myListing]);

  /**
   * Sort layout styles by occupancy size, then alphabetically
   * Single rooms appear first, then doubles, triples, quads
   */
  const sortedLayoutStyles = useMemo(() => {
    // Get list of layout styles this lister wants
    const styles = listing.wantedLayoutStyles || [];
    // Create sorted copy
    return [...styles].sort((a, b) => {
      // Split each layout into type and occupancy
      const splitA = splitLayout(a);
      const splitB = splitLayout(b);
      // Get occupancy rank for sorting (Single=1, Double=2, etc.)
      const occRankA = LAYOUT_OCCUPANCY_ORDER[splitA.occupancy] ?? Number.MAX_SAFE_INTEGER;
      const occRankB = LAYOUT_OCCUPANCY_ORDER[splitB.occupancy] ?? Number.MAX_SAFE_INTEGER;
      // Sort by occupancy first (singles before doubles, etc.)
      if (occRankA !== occRankB) return occRankA - occRankB;
      // For same occupancy, sort alphabetically
      return collator.compare(a, b);
    });
  }, [collator, listing.wantedLayoutStyles]);

  /**
   * Determine if there's a compatibility match between this listing and user's listing
   * Match requires: gender compatibility AND (building match OR layout match)
   */
  const hasMatch = useMemo(() => {
    // No match if user doesn't have a listing
    if (!myListing) return false;
    // Check if user's gender is in lister's wanted genders
    const isGenderCompatible = Boolean(myHousingGender && wantedGenders.includes(myHousingGender));
    // Check if user's building is in lister's wanted buildings
    const buildingMatch = wantedBuildings.some((item) => item.isMatch);
    // Check if user's layout is in lister's wanted layouts
    const layoutMatch = Boolean(myLayout && sortedLayoutStyles.includes(myLayout));
    // Match if gender matches AND at least one building or layout matches
    return isGenderCompatible && (buildingMatch || layoutMatch);
  }, [myListing, myHousingGender, wantedGenders, myLayout, sortedLayoutStyles, wantedBuildings]);

  /**
   * CSS class for gender compatibility styling
   * "is-compatible" if user's gender matches, "is-incompatible" if doesn't, "" if no comparison
   */
  const genderCompatibilityClass = myListing && wantedGenders.length
    ? (myHousingGender && wantedGenders.includes(myHousingGender) ? "is-compatible" : "is-incompatible")
    : "";

  // Don't render modal if no listing provided
  if (!listing) return null;

  // ─── Render Modal ─────────────────────────────────────────────────────────────

  return (
    // Overlay that closes modal when clicking outside the modal box
    <div className="expand-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      {/* Modal dialog box */}
      <div className="expand-modal" role="dialog" aria-modal="true" aria-label="Listing details">
        {/* Close button */}
        <button className="modal-close" onClick={onClose}>x</button>

        {/* Listing header - room type and location */}
        <h3>{listing.layout || "-"} - {currentLocation}</h3>

        {/* Listing details section - housing gender and roommate info */}
        <div className="modal-details" style={{ marginBottom: 12 }}>
          <strong>Housing gender:</strong> {listing.housingGender || "-"}<br />
          <strong>Bringing roommate:</strong> {listing.bringingRoommate ? `Yes${listing.totalPeople ? ` (${listing.totalPeople} total)` : ""}` : "No"}
        </div>

        {/* Room pitch/description */}
        <p className="modal-pitch">{listing.pitch || "-"}</p>

        {/* Additional details if provided */}
        {listing.otherDetails ? <p className="modal-details"><strong>Other details:</strong> {listing.otherDetails}</p> : null}

        {/* "Looking for" section showing matching criteria */}
        <div className="modal-section" style={{ marginTop: 12 }}>
          <h4 className="modal-section-title">What I'm Looking For</h4>

          {/* Match indicator if user has listing and it matches */}
          {hasMatch && (
            <div className="match-legend">✓ Highlighted items match your current housing</div>
          )}

          {/* Filter groups showing lister's preferences */}
          <div className="modal-filters">
            {/* Gender preferences */}
            <div className="modal-filter-group">
              <strong>Gender:</strong>
              <div className="modal-layout-options" style={{ marginTop: 4 }}>
                {wantedGenders.map((gender) => (
                  <span
                    key={gender}
                    className={`layout-tag gender-tag ${genderCompatibilityClass}`.trim()}
                  >
                    {gender}
                  </span>
                ))}
                {!wantedGenders.length ? "Any" : null}
              </div>
            </div>

            {/* Building/campus group preferences */}
            <div className="modal-filter-group">
              <strong>Buildings:</strong>
              {wantedBuildings.length ? (
                <div className="modal-layout-options" style={{ marginTop: 4 }}>
                  {wantedBuildings.map((item) => (
                    <span
                      key={item.key}
                      className={`layout-tag building-tag ${item.tone}${item.isMatch ? " match-highlight" : ""}`}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : " Any"}
            </div>

            {/* Layout style preferences */}
            <div className="modal-filter-group">
              <strong>Layout styles:</strong>
              <div className="modal-layout-options">
                {sortedLayoutStyles.map(style => (
                  <span
                    key={style}
                    className={`layout-tag${myListing && myLayout && style === myLayout ? " match-highlight" : ""}`}
                  >
                    {style}
                  </span>
                ))}
                {!sortedLayoutStyles.length ? "Any" : null}
              </div>
            </div>

            {/* Any additional preference details */}
            {listing.wantedOtherDetails && (
              <div className="modal-filter-group">
                <strong>Additional details:</strong> {listing.wantedOtherDetails}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
