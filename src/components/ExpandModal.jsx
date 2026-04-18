import React, { useMemo } from "react";
import { BUILDINGS } from "../../js/housing-data.js";

const NAMED_BUILDING_GROUPS = new Set([
  "Large Traditional-Style Residences",
  "Fenway Campus",
  "Student Village",
]);

const BUILDING_TYPE_ORDER = {
  "tone-apartment": 1,
  "tone-brownstone": 2,
  "tone-large": 3,
  "tone-fenway": 4,
  "tone-stuvi": 5,
  "tone-generic": 99,
};

const LAYOUT_OCCUPANCY_ORDER = {
  Single: 1,
  Double: 2,
  Triple: 3,
  Quad: 4,
};

export default function ExpandModal({ listing, myListing, onClose }) {
  const myLayout = myListing?.layout || "";
  const myCampusGroup = myListing?.currentCampusGroup || "";
  const myBuilding = myListing?.currentBuilding || "";
  const myHousingGender = myListing?.housingGender || "";
  const wantedGenders = listing.wantedGenders || [];

  const collator = useMemo(
    () => new Intl.Collator("en", { numeric: true, sensitivity: "base" }),
    []
  );

  const buildingGroupByName = useMemo(
    () => new Map(BUILDINGS.map((building) => [building.name, building.group])),
    []
  );

  function buildingToneForGroup(groupName) {
    if (!groupName) return "tone-generic";
    if (groupName.includes("Apartments")) return "tone-apartment";
    if (groupName.includes("Brownstones")) return "tone-brownstone";
    if (groupName === "Large Traditional-Style Residences") return "tone-large";
    if (groupName === "Fenway Campus") return "tone-fenway";
    if (groupName === "Student Village") return "tone-stuvi";
    return "tone-generic";
  }

  function splitLayout(layout) {
    const parts = String(layout || "").trim().split(" ");
    if (parts.length < 2) return { layoutType: String(layout || ""), occupancy: "" };
    return {
      occupancy: parts[parts.length - 1],
      layoutType: parts.slice(0, -1).join(" "),
    };
  }

  const wantedBuildings = useMemo(() => {
    const seenLabels = new Set();
    const items = [];

    const selectedGroups = listing.wantedCampusGroups || [];

    selectedGroups.forEach((groupName) => {
      // For named-building groups, only explicit building checkboxes should appear.
      if (NAMED_BUILDING_GROUPS.has(groupName)) {
        return;
      }

      if (seenLabels.has(groupName)) return;
      seenLabels.add(groupName);
      items.push({
        key: `group:${groupName}`,
        label: groupName,
        tone: buildingToneForGroup(groupName),
        isMatch: Boolean(myListing && groupName === myCampusGroup),
      });
    });

    (listing.wantedLargeResidenceBuildings || []).forEach((buildingName) => {
      if (seenLabels.has(buildingName)) return;
      seenLabels.add(buildingName);
      items.push({
        key: `building:${buildingName}`,
        label: buildingName,
        tone: buildingToneForGroup(buildingGroupByName.get(buildingName)),
        isMatch: Boolean(myListing && buildingName === myBuilding),
      });
    });

    return items.sort((a, b) => {
      const toneRankA = BUILDING_TYPE_ORDER[a.tone] ?? BUILDING_TYPE_ORDER["tone-generic"];
      const toneRankB = BUILDING_TYPE_ORDER[b.tone] ?? BUILDING_TYPE_ORDER["tone-generic"];
      if (toneRankA !== toneRankB) return toneRankA - toneRankB;
      return collator.compare(a.label, b.label);
    });
  }, [buildingGroupByName, collator, listing.wantedCampusGroups, listing.wantedLargeResidenceBuildings, myBuilding, myCampusGroup, myListing]);

  const sortedLayoutStyles = useMemo(() => {
    const styles = listing.wantedLayoutStyles || [];
    return [...styles].sort((a, b) => {
      const splitA = splitLayout(a);
      const splitB = splitLayout(b);
      const occRankA = LAYOUT_OCCUPANCY_ORDER[splitA.occupancy] ?? Number.MAX_SAFE_INTEGER;
      const occRankB = LAYOUT_OCCUPANCY_ORDER[splitB.occupancy] ?? Number.MAX_SAFE_INTEGER;
      if (occRankA !== occRankB) return occRankA - occRankB;
      return collator.compare(a, b);
    });
  }, [collator, listing.wantedLayoutStyles]);

  const hasMatch = useMemo(() => {
    if (!myListing) return false;
    const isGenderCompatible = Boolean(myHousingGender && wantedGenders.includes(myHousingGender));
    const buildingMatch = wantedBuildings.some((item) => item.isMatch);
    const layoutMatch = Boolean(myLayout && sortedLayoutStyles.includes(myLayout));
    return isGenderCompatible && (buildingMatch || layoutMatch);
  }, [myListing, myHousingGender, wantedGenders, myLayout, sortedLayoutStyles, wantedBuildings]);

  const genderCompatibilityClass = myListing && wantedGenders.length
    ? (myHousingGender && wantedGenders.includes(myHousingGender) ? "is-compatible" : "is-incompatible")
    : "";

  if (!listing) return null;

  return (
    <div className="expand-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expand-modal" role="dialog" aria-modal="true" aria-label="Listing details">
        <button className="modal-close" onClick={onClose}>x</button>
        <h3>{listing.layout || "-"} - {listing.currentCampusGroup || "-"}</h3>
        <div className="modal-details" style={{ marginBottom: 12 }}>
          <strong>Housing gender:</strong> {listing.housingGender || "-"}<br />
          <strong>Bringing roommate:</strong> {listing.bringingRoommate ? `Yes${listing.totalPeople ? ` (${listing.totalPeople} total)` : ""}` : "No"}
        </div>
        <p className="modal-pitch">{listing.pitch || "-"}</p>
        {listing.otherDetails ? <p className="modal-details"><strong>Other details:</strong> {listing.otherDetails}</p> : null}
        <div className="modal-section" style={{ marginTop: 12 }}>
          <h4 className="modal-section-title">What I'm Looking For</h4>
          {hasMatch && (
            <div className="match-legend">✓ Highlighted items match your current housing</div>
          )}
          <div className="modal-filters">
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
