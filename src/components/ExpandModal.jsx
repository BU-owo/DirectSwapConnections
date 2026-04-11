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
          <strong>Laundry in building:</strong> {listing.laundryInBuilding ? "Yes" : "No"}<br />
          <strong>Bringing roommate:</strong> {listing.bringingRoommate ? `Yes${listing.totalPeople ? ` (${listing.totalPeople} total)` : ""}` : "No"}
        </div>
        <p className="modal-pitch">{listing.pitch || "-"}</p>
        {listing.otherDetails ? <p className="modal-details"><strong>Other details:</strong> {listing.otherDetails}</p> : null}
        <div className="modal-section" style={{ marginTop: 12 }}>
          <h4 className="modal-section-title">Looking For</h4>
          <div className="modal-details">
            <strong>Looking for gender:</strong> {joinOrDash(listing.wantedGenders)}
          </div>
          <div className="modal-list-block">
            <strong>Area:</strong>
            <BulletList values={listing.wantedCampusGroups} />
          </div>
          {showLargeDetails ? (
            <>
              <div className="modal-details"><strong>Large residence areas:</strong> {joinOrDash(listing.wantedLargeResidenceAreas)}</div>
              <div className="modal-details"><strong>Large residence buildings:</strong> {joinOrDash(listing.wantedLargeResidenceBuildings)}</div>
            </>
          ) : null}
          <div className="modal-list-block">
            <strong>Layout styles:</strong>
            <BulletList values={listing.wantedLayoutStyles} />
          </div>
        </div>
      </div>
    </div>
  );
}
