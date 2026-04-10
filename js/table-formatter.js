import { esc } from "./dom.js";

export function buildRow(listing, currentUser, contactsMap) {
  const date = listing.submittedAt?.toDate
    ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  // Contact cell
  let contactCell;
  if (!currentUser) {
    contactCell = `<span class="contact-locked" title="Sign in to view">🔒 Sign in</span>`;
  } else {
    const c = contactsMap[listing.id] || {};
    const parts = [];
    if (listing.email) parts.push(`<a href="mailto:${esc(listing.email)}" class="contact-link">${esc(listing.email)}</a>`);
    if (c.redditUsername) parts.push(`<small style="color:var(--sub)">${esc(c.redditUsername)}</small>`);
    if (c.phone) parts.push(`<small style="color:var(--sub)">${esc(c.phone)}</small>`);
    if (c.otherContact) parts.push(`<small style="color:var(--sub)">${esc(c.otherContact)}</small>`);
    contactCell = parts.join("<br>") || `<span style="color:#aaa">—</span>`;
  }

  // Compact info cell (Gender / Type / Occupancy) with colors
  const genderBadge = `<span class="badge badge-gender">${esc(listing.housingGender || "—")}</span>`;
  const typeBadge = `<span class="badge badge-type">${esc(listing.roomType || "—")}</span>`;
  const occBadge = `<span class="badge badge-occ">${esc(listing.occupancy || "—")}</span>`;
  const infoBadges = `${genderBadge} ${typeBadge} ${occBadge}`;

  // Looking for compact display
  const wg = (listing.wantedGenders || []).join(", ") || "—";
  const wt = (listing.wantedTypes || []).join(", ") || "—";
  const wo = (listing.wantedOccupancies || []).join(", ") || "—";

  // Room pitch (truncated with expand option)
  const pitchPreview = listing.pitch ? (listing.pitch.length > 80 ? listing.pitch.substring(0, 77) + "..." : listing.pitch) : "—";
  const hasLongPitch = listing.pitch && listing.pitch.length > 80;
  const expandBtn = hasLongPitch ? `<button class="expand-btn" data-listing-id="${listing.id}" title="Expand">→</button>` : "";

  // Roommate badge
  const roommateBadge = listing.bringingRoommate ? `<span class="badge badge-roommate">+Roommate</span>` : "";

  return `<tr data-listing-id="${listing.id}">
    <td class="td-building">
      <span class="badge badge-building">${esc(listing.currentBuilding || "—")}</span>
    </td>
    <td class="td-info">
      <div class="info-badges">${infoBadges} ${roommateBadge}</div>
    </td>
    <td class="td-pitch">
      <div class="pitch-text">${esc(pitchPreview)}</div>
      ${expandBtn}
      ${listing.otherDetails ? `<div style="font-size:.75rem;color:var(--sub);font-style:italic;margin-top:3px">${esc(listing.otherDetails)}</div>` : ""}
    </td>
    <td class="td-looking">
      <div class="looking-text">
        <strong>Gender:</strong> ${esc(wg)}<br>
        <strong>Type:</strong> ${esc(wt)}<br>
        <strong>Occ:</strong> ${esc(wo)}
      </div>
    </td>
    <td class="td-contact">${contactCell}</td>
    <td class="td-posted">${date}</td>
  </tr>`;
}

// Expand modal for long pitches
export function showExpandModal(listingId, allListings) {
  const listing = allListings.find(l => l.id === listingId);
  if (!listing) return;

  const modal = document.createElement("div");
  modal.className = "expand-modal-overlay";
  modal.innerHTML = `
    <div class="expand-modal">
      <button class="modal-close">×</button>
      <h3>${esc(listing.currentBuilding)}</h3>
      <p class="modal-pitch">${esc(listing.pitch)}</p>
      ${listing.otherDetails ? `<p class="modal-details"><strong>Other details:</strong> ${esc(listing.otherDetails)}</p>` : ""}
    </div>
  `;
  
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
}