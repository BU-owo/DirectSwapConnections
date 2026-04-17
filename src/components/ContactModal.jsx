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

export default function ContactModal({ listing, contact, onClose }) {
  const showLargeDetails = useMemo(
    () => (listing.wantedCampusGroups || []).includes("Large Traditional-Style Residences"),
    [listing]
  );

  if (!listing) return null;

  return (
    <div className="expand-modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expand-modal" role="dialog" aria-modal="true" aria-label="Contact information">
        <button className="modal-close" onClick={onClose}>x</button>
        <h3>Contact Information</h3>

        <div className="modal-section" style={{ marginBottom: 20, padding: 16, backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 8 }}>
          <h4 style={{ color: '#856404', margin: '0 0 12px 0', fontSize: '1.1rem' }}>⚠️ Important: Please read before contacting</h4>
          <p style={{ color: '#856404', margin: 0, fontSize: '0.95rem', lineHeight: 1.4 }}>
            <strong>Don't contact this person unless you have what they're looking for.</strong> They are specifically seeking the housing criteria listed below. Contacting them about other options may waste both your time and theirs.
          </p>
        </div>

        <div className="modal-section">
          <h4 className="modal-section-title">What They're Looking For</h4>
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

        <div className="modal-section" style={{ marginTop: 20, padding: 16, backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 8 }}>
          <h4 className="modal-section-title">Contact Details</h4>
          <div className="modal-details">
            {listing.email && (
              <p><strong>Email:</strong> <a href={`mailto:${listing.email}`} className="contact-link">{listing.email}</a></p>
            )}
            {contact?.redditUsername && (
              <p><strong>Reddit:</strong> <span style={{color: 'var(--sub)'}}>{contact.redditUsername}</span></p>
            )}
            {contact?.phone && (
              <p><strong>Phone:</strong> <span style={{color: 'var(--sub)'}}>{contact.phone}</span></p>
            )}
            {contact?.otherContact && (
              <p><strong>Other:</strong> <span style={{color: 'var(--sub)'}}>{contact.otherContact}</span></p>
            )}
            {!listing.email && !contact?.redditUsername && !contact?.phone && !contact?.otherContact && (
              <p style={{color: '#aaa'}}>No contact information provided</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}