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

export default function ExpandModal({ listing, onClose }) {
  const showLargeDetails = useMemo(
    () => (listing.wantedCampusGroups || []).includes("Large Traditional-Style Residences"),
    [listing]
  );

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
          <div className="modal-filters">
            <div className="modal-filter-group">
              <strong>Gender:</strong> {joinOrDash(listing.wantedGenders) || "Any"}
            </div>
            <div className="modal-filter-group">
              <strong>Quick filters:</strong>
              <div className="modal-quick-options">
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Apartment") || layout.includes("Studio")) && <span className="quick-tag">Any Apartment</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Single")) && <span className="quick-tag">Any Single</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Double")) && <span className="quick-tag">Any Double</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Triple")) && <span className="quick-tag">Any Triple</span>}
                {listing.wantedLayoutStyles?.some(layout => layout.includes("Quad")) && <span className="quick-tag">Any Quad</span>}
              </div>
            </div>
            <div className="modal-filter-group">
              <strong>Areas:</strong> {joinOrDash(listing.wantedCampusGroups) || "Any"}
            </div>
            {showLargeDetails && (
              <>
                <div className="modal-filter-group">
                  <strong>Large residence areas:</strong> {joinOrDash(listing.wantedLargeResidenceAreas)}
                </div>
                <div className="modal-filter-group">
                  <strong>Large residence buildings:</strong> {joinOrDash(listing.wantedLargeResidenceBuildings)}
                </div>
              </>
            )}
            <div className="modal-filter-group">
              <strong>Layout styles:</strong>
              <div className="modal-layout-options">
                {listing.wantedLayoutStyles?.map(style => (
                  <span key={style} className="layout-tag">{style}</span>
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
