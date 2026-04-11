import { esc } from "./dom.js";

const LARGE_STYLE_RESIDENCES_GROUP = "Large Traditional-Style Residences";
const FENWAY_CAMPUS_GROUP = "Fenway Campus";
const PITCH_PREVIEW_MAX = 140;
const FIELD_PREVIEW_MAX = 80;
const CARD_CONTENT_PREVIEW_MAX = 320;

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return { text, truncated: false };
  return { text: `${text.slice(0, maxLength - 3)}...`, truncated: true };
}

function joinOrDash(values) {
  const arr = Array.isArray(values) ? values : [];
  return arr.length ? arr.join(", ") : "—";
}

function renderBulletList(values) {
  const arr = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!arr.length) return `<p class="modal-details">—</p>`;
  return `<ul class="modal-list">${arr.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

export function buildRow(listing, currentUser, contactsMap) {
  const date = listing.submittedAt?.toDate
    ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  const cardPrimaryLocation =
    listing.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP || listing.currentCampusGroup === FENWAY_CAMPUS_GROUP
      ? (listing.currentBuilding || "—")
      : (listing.currentCampusGroup || listing.currentBuilding || "—");

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
  const laundryBadge = `<span class="badge badge-grey">Laundry: ${listing.laundryInBuilding ? "Yes" : "No"}</span>`;
  const savedTotal = Number(listing.totalPeople);
  const movingCount = listing.bringingRoommate
    ? (Number.isInteger(savedTotal) && savedTotal >= 2 ? savedTotal : 2)
    : 1;
  const movingBadge = `<span class="badge badge-gold">Number of people swapping: ${esc(movingCount)}</span>`;
  const largeAreaBadge = listing.currentLargeResidenceArea
    ? `<span class="badge badge-grey">${esc(listing.currentLargeResidenceArea)}</span>`
    : "";
  const infoBadges = `${genderBadge} ${typeBadge} ${occBadge} ${laundryBadge} ${movingBadge} ${largeAreaBadge}`;

  // Looking for compact display
  // Preview truncation for card readability
  const pitchPreviewData = truncateText(listing.pitch || "—", PITCH_PREVIEW_MAX);
  const otherDetailsPreview = truncateText(listing.otherDetails || "", FIELD_PREVIEW_MAX);

  const shouldShowReadMore = true;

  const expandBtn = shouldShowReadMore
    ? `<button class="expand-btn" data-listing-id="${listing.id}">Read more</button>`
    : "";

  return `<tr data-listing-id="${listing.id}">
    <td class="td-building">
      <span class="badge badge-building">${esc(cardPrimaryLocation)}</span>
    </td>
    <td class="td-info">
      <div class="info-badges">${infoBadges}</div>
    </td>
    <td class="td-pitch">
      <div class="pitch-text">${esc(pitchPreviewData.text)}</div>
      ${listing.otherDetails ? `<div style="font-size:.75rem;color:var(--sub);font-style:italic;margin-top:3px">${esc(otherDetailsPreview.text)}</div>` : ""}
    </td>
    <td class="td-looking">
      <div class="looking-collapsed-note">Shown in expanded view</div>
    </td>
    <td class="td-contact">${contactCell}</td>
    <td class="td-posted">
      <div>${date}</div>
      ${expandBtn}
    </td>
  </tr>`;
}

// Expand modal for full card details
export function showExpandModal(listingId, allListings) {
  const listing = allListings.find(l => l.id === listingId);
  if (!listing) return;

  const fullWantedGenders = joinOrDash(listing.wantedGenders);
  const fullWantedLargeAreas = joinOrDash(listing.wantedLargeResidenceAreas);
  const fullWantedLargeBuildings = joinOrDash(listing.wantedLargeResidenceBuildings);
  const campusGroupBullets = renderBulletList(listing.wantedCampusGroups);
  const layoutStyleBullets = renderBulletList(listing.wantedLayoutStyles);
  const showLargeDetails = (listing.wantedCampusGroups || []).includes(LARGE_STYLE_RESIDENCES_GROUP);

  const modal = document.createElement("div");
  modal.className = "expand-modal-overlay";
  modal.innerHTML = `
    <div class="expand-modal">
      <button class="modal-close">×</button>
      <h3>${esc(listing.layout || "—")} - ${esc(listing.currentCampusGroup)}</h3>
      <div class="modal-details" style="margin-bottom:12px">
        <strong>Housing gender:</strong> ${esc(listing.housingGender || "—")}<br>
        <strong>Laundry in building:</strong> ${listing.laundryInBuilding ? "Yes" : "No"}<br>
        <strong>Bringing roommate:</strong> ${listing.bringingRoommate ? `Yes${listing.totalPeople ? ` (${esc(listing.totalPeople)} total)` : ""}` : "No"}
      </div>
      <p class="modal-pitch">${esc(listing.pitch)}</p>
      ${listing.otherDetails ? `<p class="modal-details"><strong>Other details:</strong> ${esc(listing.otherDetails)}</p>` : ""}
      <div class="modal-section" style="margin-top:12px">
        <h4 class="modal-section-title">Looking For</h4>
        <div class="modal-details">
        <strong>Looking for gender:</strong> ${esc(fullWantedGenders)}<br>
        </div>
        <div class="modal-list-block">
          <strong>Area:</strong>
          ${campusGroupBullets}
        </div>
        ${showLargeDetails
          ? `<div class="modal-details"><strong>Large residence areas:</strong> ${esc(fullWantedLargeAreas)}</div>
             <div class="modal-details"><strong>Large residence buildings:</strong> ${esc(fullWantedLargeBuildings)}</div>`
          : ""}
        <div class="modal-list-block">
          <strong>Layout styles:</strong>
          ${layoutStyleBullets}
        </div>
      </div>
    </div>
  `;
  
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
}