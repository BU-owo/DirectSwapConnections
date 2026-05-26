/**
 * Table & Modal Formatting
 * Generates HTML for listings table rows and the expanded modal for viewing full listing details.
 */
import { esc } from "./dom.js";

/**
 * Campus group constants for special handling in display.
 */
const LARGE_STYLE_RESIDENCES_GROUP = "Large Traditional-Style Residences";
const FENWAY_CAMPUS_GROUP = "Fenway Campus";

/**
 * Maximum characters to show for preview text before truncating.
 */
const PITCH_PREVIEW_MAX = 140;
const FIELD_PREVIEW_MAX = 80;
const CARD_CONTENT_PREVIEW_MAX = 320;

/**
 * Truncate text to a maximum length and indicate if truncation occurred.
 * @param {*} value - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {Object} {text: truncated text, truncated: boolean}
 */
function truncateText(value, maxLength) {
  // Convert value to string
  const text = String(value ?? "");
  // Return as-is if under limit
  if (text.length <= maxLength) return { text, truncated: false };
  // Truncate and add ellipsis indicator
  return { text: `${text.slice(0, maxLength - 3)}...`, truncated: true };
}

/**
 * Join array values with comma separator, or return em-dash if empty.
 * @param {Array|*} values - Values to join
 * @returns {string} Joined string or "—"
 */
function joinOrDash(values) {
  // Ensure we have an array (default to empty array if not array-like)
  const arr = Array.isArray(values) ? values : [];
  // Join with comma if array has items, otherwise return em-dash
  return arr.length ? arr.join(", ") : "—";
}

/**
 * Render array of values as an HTML unordered list or em-dash if empty.
 * @param {Array|*} values - Items to render in list
 * @returns {string} HTML string for list or em-dash
 */
function renderBulletList(values) {
  // Ensure we have an array and filter out falsy values
  const arr = Array.isArray(values) ? values.filter(Boolean) : [];
  // Return em-dash if no items
  if (!arr.length) return `<p class="modal-details">—</p>`;
  // Render HTML list with escaped items to prevent XSS
  return `<ul class="modal-list">${arr.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

/**
 * Build HTML table row for a single listing in the browse table.
 * Handles special display logic for different campus groups and contact visibility.
 * @param {Object} listing - Listing data object from Firestore
 * @param {Object|null} currentUser - Currently logged-in user (null if not authenticated)
 * @param {Object} contactsMap - Map of user ID to contact info {userId: contactData}
 * @returns {string} HTML string for table row
 */
export function buildRow(listing, currentUser, contactsMap) {
  // Format submission date for display
  const date = listing.submittedAt?.toDate
    // If Firebase Timestamp, convert to Date and format as locale string
    ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    // Otherwise show em-dash as fallback
    : "—";

  // Determine which location to display as primary (building name for Large/Fenway, campus group for others)
  const cardPrimaryLocation =
    listing.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP || listing.currentCampusGroup === FENWAY_CAMPUS_GROUP
      // For large residences and Fenway, show building name
      ? (listing.currentBuilding || "—")
      // For other groups, show campus group, fallback to building name
      : (listing.currentCampusGroup || listing.currentBuilding || "—");

  // ─── Contact Information Cell ─────────────────────────────────────────────────

  // Build contact cell content - shows contact info only if user is signed in
  let contactCell;
  if (!currentUser) {
    // Not signed in - show lock icon prompting sign-in
    contactCell = `<span class="contact-locked" title="Sign in to view">🔒 Sign in</span>`;
  } else {
    // Signed in - show available contact methods
    const c = contactsMap[listing.id] || {};
    const parts = [];

    // Always show email if available
    if (listing.email) parts.push(`<a href="mailto:${esc(listing.email)}" class="contact-link">${esc(listing.email)}</a>`);
    // Show Reddit username if provided
    if (c.redditUsername) parts.push(`<small style="color:var(--sub)">${esc(c.redditUsername)}</small>`);
    // Show phone number if provided
    if (c.phone) parts.push(`<small style="color:var(--sub)">${esc(c.phone)}</small>`);
    // Show other contact method if provided
    if (c.otherContact) parts.push(`<small style="color:var(--sub)">${esc(c.otherContact)}</small>`);

    // Join contact methods with line breaks, or show em-dash if no contacts available
    contactCell = parts.join("<br>") || `<span style="color:#aaa">—</span>`;
  }

  // ─── Info Badges Row ──────────────────────────────────────────────────────────

  // Build inline badges showing housing gender, room type, occupancy, and group size
  const genderBadge = `<span class="badge badge-gender">${esc(listing.housingGender || "—")}</span>`;
  const typeBadge = `<span class="badge badge-type">${esc(listing.roomType || "—")}</span>`;
  const occBadge = `<span class="badge badge-occ">${esc(listing.occupancy || "—")}</span>`;

  // Calculate number of people moving based on roommate status
  const savedTotal = Number(listing.totalPeople);
  const movingCount = listing.bringingRoommate
    ? (Number.isInteger(savedTotal) && savedTotal >= 2 ? savedTotal : 2)
    : 1;

  const movingBadge = `<span class="badge badge-gold">Number of people swapping: ${esc(movingCount)}</span>`;

  // Show large residence area if applicable (e.g., "West Campus")
  const largeAreaBadge = listing.currentLargeResidenceArea
    ? `<span class="badge badge-grey">${esc(listing.currentLargeResidenceArea)}</span>`
    : "";

  // Combine all info badges
  const infoBadges = `${genderBadge} ${typeBadge} ${occBadge} ${movingBadge} ${largeAreaBadge}`;

  // ─── Pitch Preview ────────────────────────────────────────────────────────────

  // Truncate pitch text to preview length for table display
  const pitchPreviewData = truncateText(listing.pitch || "—", PITCH_PREVIEW_MAX);
  // Truncate other details text for preview
  const otherDetailsPreview = truncateText(listing.otherDetails || "", FIELD_PREVIEW_MAX);

  // Always show "Read more" button to expand to full view
  const shouldShowReadMore = true;

  const expandBtn = shouldShowReadMore
    ? `<button class="expand-btn" data-listing-id="${listing.id}">Read more</button>`
    : "";

  // ─── Build and Return Table Row HTML ────────────────────────────────────────────

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

/**
 * Display expanded modal with full listing details including what user is looking for.
 * Modal is appended to document body and can be closed by button or outside click.
 * @param {string} listingId - ID of the listing to expand
 * @param {Array} allListings - Array of all listings to find the target listing
 */
export function showExpandModal(listingId, allListings) {
  // Find the listing with matching ID
  const listing = allListings.find(l => l.id === listingId);
  // Exit if listing not found
  if (!listing) return;

  // Format "looking for" fields as joined strings or em-dash if empty
  const fullWantedGenders = joinOrDash(listing.wantedGenders);
  const fullWantedLargeAreas = joinOrDash(listing.wantedLargeResidenceAreas);
  const fullWantedLargeBuildings = joinOrDash(listing.wantedLargeResidenceBuildings);

  // Render campus groups and layout styles as bullet lists
  const campusGroupBullets = renderBulletList(listing.wantedCampusGroups);
  const layoutStyleBullets = renderBulletList(listing.wantedLayoutStyles);

  // Show large residence details section only if user is looking at Large Residences
  const showLargeDetails = (listing.wantedCampusGroups || []).includes(LARGE_STYLE_RESIDENCES_GROUP);

  // Create modal overlay element
  const modal = document.createElement("div");
  modal.className = "expand-modal-overlay";

  // Build complete modal HTML with all listing details
  modal.innerHTML = `
    <div class="expand-modal">
      <button class="modal-close">×</button>
      <h3>${esc(listing.layout || "—")} - ${esc(listing.currentCampusGroup)}</h3>
      <div class="modal-details" style="margin-bottom:12px">
        <strong>Housing gender:</strong> ${esc(listing.housingGender || "—")}<br>
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

  // Close button in modal header
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());

  // Click outside modal to close it (click on the overlay background)
  modal.addEventListener("click", (e) => {
    // Only close if clicking on the overlay itself, not the modal content
    if (e.target === modal) modal.remove();
  });

  // Add modal to page
  document.body.appendChild(modal);
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
  const savedTotal = Number(listing.totalPeople);
  const movingCount = listing.bringingRoommate
    ? (Number.isInteger(savedTotal) && savedTotal >= 2 ? savedTotal : 2)
    : 1;
  const movingBadge = `<span class="badge badge-gold">Number of people swapping: ${esc(movingCount)}</span>`;
  const largeAreaBadge = listing.currentLargeResidenceArea
    ? `<span class="badge badge-grey">${esc(listing.currentLargeResidenceArea)}</span>`
    : "";
  const infoBadges = `${genderBadge} ${typeBadge} ${occBadge} ${movingBadge} ${largeAreaBadge}`;

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