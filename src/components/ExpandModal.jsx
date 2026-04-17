import React, { useMemo } from "react";

function joinOrDash(values) {
  return Array.isArray(values) && values.length ? values.join(", ") : "-";
}

function BulletList({ values }) {
  if (!values?.length) return <p className="modal-details">-</p>;
  return (
    <ul className="modal-list">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

export default function ExpandModal({ listing, myListing, onClose }) {
  const showLargeDetails = useMemo(
    () => (listing.wantedCampusGroups || []).includes("Large Traditional-Style Residences"),
    [listing]
  );

  const myLayout = myListing?.layout || "";
  const myCampusGroup = myListing?.currentCampusGroup || "";
  const myBuilding = myListing?.currentBuilding || "";

  const hasMatch = useMemo(() => {
    if (!myListing) return false;
    const wantedStyles = listing.wantedLayoutStyles || [];
    const wantedGroups = listing.wantedCampusGroups || [];
    const wantedBuildings = listing.wantedLargeResidenceBuildings || [];
    if (myLayout && wantedStyles.includes(myLayout)) return true;
    if (myCampusGroup && wantedGroups.includes(myCampusGroup)) return true;
    if (myBuilding && wantedBuildings.includes(myBuilding)) return true;
    const occupancyWords = ["Single", "Double", "Triple", "Quad"];
    for (const word of occupancyWords) {
      if (myLayout.includes(word) && wantedStyles.some((s) => s.includes(word))) return true;
    }
    if (
      (myLayout.includes("Apartment") || myLayout.includes("Studio")) &&
      wantedStyles.some((s) => s.includes("Apartment") || s.includes("Studio"))
    ) return true;
    return false;
  }, [myListing, listing, myLayout, myCampusGroup, myBuilding]);

  function quickTagClass(occupancyWord) {
    if (!myListing || !myLayout) return "quick-tag";
    const matches = occupancyWord === "Apartment"
      ? myLayout.includes("Apartment") || myLayout.includes("Studio")
      : myLayout.includes(occupancyWord);
    return matches ? "quick-tag match-highlight" : "quick-tag";
  }

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
              <strong>Gender:</strong> {joinOrDash(listing.wantedGenders) || "Any"}
            </div>
            <div className="modal-filter-group">
              <strong>Quick filters:</strong>
              <div className="modal-quick-options">
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Apartment") || layout.includes("Studio")) && <span className={quickTagClass("Apartment")}>Any Apartment</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Single")) && <span className={quickTagClass("Single")}>Any Single</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Double")) && <span className={quickTagClass("Double")}>Any Double</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Triple")) && <span className={quickTagClass("Triple")}>Any Triple</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Quad")) && <span className={quickTagClass("Quad")}>Any Quad</span>}
              </div>
            </div>
            <div className="modal-filter-group">
              <strong>Areas:</strong>
              {(listing.wantedCampusGroups || []).length ? (
                <div className="modal-layout-options" style={{ marginTop: 4 }}>
                  {(listing.wantedCampusGroups || []).map((group) => (
                    <span
                      key={group}
                      className={`layout-tag${myListing && group === myCampusGroup ? " match-highlight" : ""}`}
                    >
                      {group}
                    </span>
                  ))}
                </div>
              ) : " Any"}
            </div>
            {showLargeDetails && (
              <div className="modal-filter-group">
                <strong>Large residence buildings:</strong>
                {(listing.wantedLargeResidenceBuildings || []).length ? (
                  <div className="modal-layout-options" style={{ marginTop: 4 }}>
                    {(listing.wantedLargeResidenceBuildings || []).map((b) => (
                      <span
                        key={b}
                        className={`layout-tag${myListing && b === myBuilding ? " match-highlight" : ""}`}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                ) : " -"}
              </div>
            )}
            <div className="modal-filter-group">
              <strong>Layout styles:</strong>
              <div className="modal-layout-options">
                {listing.wantedLayoutStyles?.map(style => (
                  <span
                    key={style}
                    className={`layout-tag${myListing && myLayout && style === myLayout ? " match-highlight" : ""}`}
                  >
                    {style}
                  </span>
                )) || "Any"}
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
