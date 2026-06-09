/**
 * Data Management & Form Handling
 * Manages Firestore operations for listings, contacts, form submission/deletion, and profanity filtering.
 */
import { state } from "./state.js";
import { $, show, hide, getChecked, esc, setErr, setMsg } from "./dom.js";
import {
  db,
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "./firebase-client.js";
import {
  parseLayout,
  getBuildingByAddress,
  LARGE_STYLE_RESIDENCES_GROUP,
} from "./housing-data.js";
import { renderTable, renderMyPreview, fillForm, resetForm, showPanel } from "./ui.js";

/**
 * Regex pattern to match common profanities for automatic censoring.
 * @type {RegExp}
 */
const PROFANITY_PATTERN = /\b(fuck|fucking|shit|bitch|asshole|dick|bastard|whore|slut|cunt|motherfucker|piss)\b/gi;

/**
 * Replace profanities in text with asterisks matching the word length.
 * @param {*} value - Text to censor (converted to string)
 * @returns {string} Text with profanities replaced by asterisks
 */
function censorProfanityInText(value) {
  // Convert value to string, defaulting to empty string for null/undefined
  return String(value ?? "").replace(PROFANITY_PATTERN, (match) => "*".repeat(match.length));
}

/**
 * Set up real-time listener for all listings from Firestore.
 * Unsubscribes from previous listener if it exists to prevent duplicates.
 * Displays error message if Firestore query fails (usually due to permission issues).
 */
export function startListingsListener() {
  // Unsubscribe from previous listener if one exists to prevent duplicate listeners
  if (state.unsubListings) state.unsubListings();

  // Create query to fetch all listings sorted by submission date (newest first)
  const listingsQuery = query(collection(db, "listings"), orderBy("submittedAt", "desc"));

  // Set up real-time listener that updates on any changes to listings
  state.unsubListings = onSnapshot(
    listingsQuery,
    // Success callback - called whenever listings data changes
    (snapshot) => {
      // Map Firestore documents to objects with id field included
      state.allListings = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
      // Re-render the browse table with updated listings
      renderTable();
      // Re-render user's own listing preview
      renderMyPreview();
    },
    // Error callback - called if query fails
    (error) => {
      // Log error to console for debugging
      console.error("Listings error:", error);
      // Get the table body element where listings are displayed
      const tbody = $("listings-tbody");
      // Exit early if table doesn't exist
      if (!tbody) return;
      // Display user-friendly error message with permission troubleshooting
      tbody.innerHTML = `<tr><td colspan="6" style="padding:2rem;text-align:center;color:#dc2626">
        Error loading listings — check Firestore rules.<br><small>${esc(error.message)}</small>
      </td></tr>`;
    }
  );
}

/**
 * Load current user's listing and contact info from Firestore and populate form.
 * Updates form UI based on whether user already has a listing (submit vs. update mode).
 */
export async function loadUserListing() {
  // Exit early if no user is logged in
  if (!state.currentUser) return;

  // Fetch current user's listing document from Firestore
  const listingSnapshot = await getDoc(doc(db, "listings", state.currentUser.uid));
  // Update state to indicate whether user has existing listing
  state.hasListing = listingSnapshot.exists();

  if (state.hasListing) {
    // User has an existing listing - load both listing and contact data
    const contactSnapshot = await getDoc(doc(db, "contacts", state.currentUser.uid));
    // Store listing data in state for reference during updates
    const listingData = listingSnapshot.data();
    state.myListing = listingData;

    // Pre-fill form fields with user's existing listing data
    fillForm(listingData, contactSnapshot.exists() ? contactSnapshot.data() : {});

    // Update form UI for update mode (user is editing existing listing)
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent = "Your listing is live — edit or remove it below.";
    $("btn-submit").textContent = "Update Listing";
    // Show delete button since user has existing listing
    show($("btn-delete"));
  } else {
    // User doesn't have listing - show empty form for new submission
    state.myListing = null;
    // Update form UI for submit mode (creating new listing)
    $("form-title").textContent = "Submit Your Swap Listing";
    $("form-sub").textContent = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
    $("btn-submit").textContent = "Submit Listing";
    // Hide delete button since there's no listing to delete
    hide($("btn-delete"));
  }
}

/**
 * Fetch all contact information from Firestore and cache in state.
 * Only called after user is authenticated - non-authenticated users get empty contactsMap.
 */
export async function refreshContacts() {
  // If no user is logged in, clear contacts
  if (!state.currentUser) {
    state.contactsMap = {};
    return;
  }
  try {
    // Fetch all documents from contacts collection
    const snapshot = await getDocs(collection(db, "contacts"));
    // Reset contacts map to clear old data
    state.contactsMap = {};
    // Build map of contact info keyed by user ID for O(1) lookup
    snapshot.forEach((docRef) => { state.contactsMap[docRef.id] = docRef.data(); });
  } catch {
    // Silently clear contacts on error to prevent stale data display
    state.contactsMap = {};
  }
}

/**
 * Handle form submission - validate, sanitize, and save listing to Firestore.
 * Performs comprehensive validation of all form fields including gender matching rules.
 * @param {Event} event - Form submit event
 */
export async function handleSubmit(event) {
  // Prevent default form submission behavior
  event.preventDefault();
  // Exit early if user is not logged in
  if (!state.currentUser) return;

  // Clear previous error and success messages
  setErr("form-err", "");
  setMsg("success-msg", "");

  // Extract form field values
  const housingGender = $("f-gender").value;
  const currentCampusGroup = $("f-campus-group").value;
  const currentLargeResidenceArea = $("f-large-area")?.value || "";
  const currentAddress = $("f-building").value;
  // Layout is full string like "Traditional Double" - will be split into roomType and occupancy
  const layout = $("f-layout").value;
  // Get selected radio button for whether user is bringing roommate
  const roommateEl = document.querySelector("[name='f-roommate']:checked");

  // Extract and validate roommate group size
  const totalPeopleInput = $("f-total-people")?.value || "";
  const totalPeople = Number(totalPeopleInput);

  // Censor profanity in user-provided text fields
  const pitch = censorProfanityInText($("f-pitch").value.trim());
  const otherDetails = censorProfanityInText($("f-details").value.trim());

  // Get all checked values from gender preference checkboxes
  const wantedGenders = getChecked("wg");

  // Get campus group preferences, excluding "Any" option
  const wantedCampusGroups = [...document.querySelectorAll("[name='wcg']")]
    .filter((checkbox) => checkbox.value !== "Any" && checkbox.checked)
    .map((checkbox) => checkbox.value);

  // Get large residence area preferences (only relevant if Large Residences selected)
  const wantedLargeResidenceAreas = getChecked("wla");
  // Get specific large residence building preferences
  const wantedLargeResidenceBuildings = getChecked("wlb");
  // Get preferred room layout styles
  const wantedLayoutStyles = getChecked("wls");

  // Censor contact info that may contain user names/words
  const reddit = censorProfanityInText($("f-reddit").value.trim());
  const phone = $("f-phone").value.trim();
  const other = censorProfanityInText($("f-other").value.trim());

  // Check if user agreed to terms and conditions
  const agreedToTerms = $("f-terms")?.checked;

  // ─── Validation Rules ─────────────────────────────────────────────────────────

  // User must select their current housing gender
  if (!housingGender) return setErr("form-err", "Select your housing assignment gender.");
  // User must select which campus area they're currently in
  if (!currentCampusGroup) return setErr("form-err", "Select your campus group.");
  // If selected Large Residences, must also select specific area (West/Central/East)
  if (currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP && !currentLargeResidenceArea) {
    return setErr("form-err", "Select your Large Residence area.");
  }
  // User must specify their current building address
  if (!currentAddress) return setErr("form-err", "Select your current address.");
  // User must specify room type and occupancy
  if (!layout) return setErr("form-err", "Select your room layout.");
  // User must indicate if they're bringing a roommate
  if (!roommateEl) return setErr("form-err", "Indicate whether you're bringing a roommate.");

  // If bringing roommate, validate group size is 2-8 people
  if (roommateEl.value === "true") {
    if (!Number.isInteger(totalPeople) || totalPeople < 2 || totalPeople > 8) {
      return setErr("form-err", "If bringing a roommate, enter total people as a whole number from 2 to 8.");
    }
  }

  // User must describe what makes their room appealing
  if (!pitch) return setErr("form-err", "Describe your room's best features.");
  // User must select at least one gender preference for roommate
  if (!wantedGenders.length) return setErr("form-err", "Select at least one gender housing preference.");

  // Enforce gender matching rules: what types of roommates can each housing gender accept?
  // Males can only match with males or gender-neutral students
  // Females can only match with females or gender-neutral students
  // Gender-neutral can match with anyone
  const allowedWantedByHousing = {
    Male: new Set(["Male", "Gender Neutral"]),
    Female: new Set(["Female", "Gender Neutral"]),
    "Gender Neutral": new Set(["Male", "Female", "Gender Neutral"]),
  };

  // Get the set of allowed target genders based on user's housing assignment
  const allowedWanted = allowedWantedByHousing[housingGender] || new Set(["Male", "Female", "Gender Neutral"]);

  // Validate that all selected genders are allowed for this user's housing assignment
  if (wantedGenders.some((gender) => !allowedWanted.has(gender))) {
    return setErr(
      "form-err",
      housingGender === "Gender Neutral"
        ? "Invalid gender preference selection."
        : `If your housing assignment is ${housingGender}, you can only choose ${housingGender} or Gender Neutral.`
    );
  }

  // User must select at least one campus group they'd consider for swap
  if (!wantedCampusGroups.length) return setErr("form-err", "Select at least one campus group you'd consider.");

  // If Large Residences is one of the options, must select specific areas and buildings
  if (wantedCampusGroups.includes(LARGE_STYLE_RESIDENCES_GROUP) && !wantedLargeResidenceAreas.length) {
    return setErr("form-err", "Select at least one Large Residence area you'd consider.");
  }
  if (wantedCampusGroups.includes(LARGE_STYLE_RESIDENCES_GROUP) && !wantedLargeResidenceBuildings.length) {
    return setErr("form-err", "Select at least one Large Residence building you'd consider.");
  }

  // User must select at least one room layout style they'd accept
  if (!wantedLayoutStyles.length) return setErr("form-err", "Select at least one layout style you'd consider.");

  // User must provide at least one contact method beyond BU email (which is always included)
  if (!reddit && !phone && !other) return setErr("form-err", "Add at least one contact method beyond your BU email.");

  // User must agree to terms and conditions before submitting
  if (!agreedToTerms) return setErr("form-err", "You must agree to the terms and conditions to submit your listing.");

  // Look up building object to get full building name for storage
  const selectedBuilding = getBuildingByAddress(currentAddress);
  if (!selectedBuilding) {
    return setErr("form-err", "Could not match that address to BU housing data. Please reselect your campus group and address.");
  }

  // Verify selected building matches the chosen Large Residence area (if applicable)
  if (currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP && selectedBuilding.area !== currentLargeResidenceArea) {
    return setErr("form-err", "Selected building does not match the chosen Large Residence area.");
  }

  // Parse layout string "Traditional Double" into separate room type and occupancy for query filtering
  const { roomType, occupancy } = parseLayout(layout);

  // Disable submit button and show loading state
  const submitButton = $("btn-submit");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  // Determine if this is a new listing or an update
  const isNew = !state.hasListing;

  // Reference to user's listing document in Firestore
  const listingRef = doc(db, "listings", state.currentUser.uid);
  // Reference to user's contact document in Firestore
  const contactRef = doc(db, "contacts", state.currentUser.uid);

  // Get server timestamp for automatic creation/update tracking
  const now = serverTimestamp();

  try {
    // Build complete listing object to save to Firestore
    const listingData = {
      // BU email of listing owner
      email: state.currentUser.email,
      // User's current housing gender assignment
      housingGender,
      // Full building name where user currently lives
      currentBuilding: selectedBuilding.name,
      // Campus area group (e.g., "South Campus Apartments")
      currentCampusGroup,
      // Large Residence area if applicable (e.g., "West Campus")
      currentLargeResidenceArea: currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP ? currentLargeResidenceArea : "",
      // Full address of current building
      currentAddress,
      // Full layout string like "Traditional Double" - stored for display
      layout,
      // Room type extracted from layout - used for browse filters
      roomType,
      // Occupancy extracted from layout - used for browse filters
      occupancy,
      // Whether user is bringing an existing roommate
      bringingRoommate: roommateEl.value === "true",
      // Total number of people in the group (only if bringing roommate)
      totalPeople: roommateEl.value === "true" ? totalPeople : null,
      // Marketing pitch describing the room
      pitch,
      // Additional details about the room
      otherDetails,
      // Array of genders user is interested in matching with
      wantedGenders,
      // Array of campus groups user would consider
      wantedCampusGroups,
      // Areas within Large Residences user would consider
      wantedLargeResidenceAreas,
      // Specific buildings within Large Residences user would consider
      wantedLargeResidenceBuildings,
      // Room layout styles user would accept
      wantedLayoutStyles,
      // Timestamp of last update (always set, used for sorting current listings)
      updatedAt: now,
      // Timestamp of initial submission (only set for new listings)
      ...(isNew && { submittedAt: now }),
    };

    // Create batch operation to atomically update both listings and contacts
    const batch = writeBatch(db);

    if (isNew) {
      // For new listings, use set to create the document
      batch.set(listingRef, listingData);
    } else {
      // For existing listings, use update to modify fields (preserves unmapped fields)
      batch.update(listingRef, listingData);
    }

    // Set contact info in separate collection for privacy (only visible to authenticated users)
    batch.set(
      contactRef,
      {
        // User's BU email (always stored for sorting/matching)
        email: state.currentUser.email,
        // Reddit username if provided
        redditUsername: reddit,
        // Phone number if provided
        phone,
        // Other contact method if provided
        otherContact: other,
        // Timestamp of contact info update
        updatedAt: now,
      },
      // Use merge: true to not overwrite other fields
      { merge: true }
    );

    // Execute batch operation atomically
    await batch.commit();

    // Update local state to reflect successful save
    state.hasListing = true;
    state.myListing = listingData;

    // Update form UI to show "update" mode
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent = "Your listing is live — edit or remove it below.";
    // Show delete button now that user has a listing
    show($("btn-delete"));

    // Refresh contacts map and re-render tables to show latest data
    await refreshContacts();
    renderTable();
    renderMyPreview();

    // Show success message
    setMsg("success-msg", isNew
      ? "Listing submitted! Switch to Browse Listings to see what others see."
      : "Listing updated!");

    // If new listing, automatically navigate to browse page after brief delay
    if (isNew) setTimeout(() => showPanel("browse"), 1800);
  } catch (error) {
    // Log error for debugging
    console.error("Submit error:", error);
    // Display user-friendly error message with troubleshooting hint
    setErr("form-err", `Save failed (${error.code || error.message}) — check your Firestore rules.`);
  } finally {
    // Re-enable submit button and restore text
    submitButton.disabled = false;
    submitButton.textContent = state.hasListing ? "Update Listing" : "Submit Listing";
  }
}

/**
 * Delete current user's listing and contact info from Firestore after confirmation.
 */
export async function handleDelete() {
  // Exit early if user is not logged in
  if (!state.currentUser) return;
  // Require explicit confirmation before deleting
  if (!confirm("Remove your listing? You'll no longer appear in the database.")) return;

  try {
    // Create batch operation to delete both listing and contact documents
    const batch = writeBatch(db);
    // Mark listing document for deletion
    batch.delete(doc(db, "listings", state.currentUser.uid));
    // Mark contact document for deletion
    batch.delete(doc(db, "contacts", state.currentUser.uid));
    // Execute batch operation to delete both atomically
    await batch.commit();

    // Update local state after successful deletion
    state.hasListing = false;
    state.myListing = null;
    state.contactsMap = {};
    // Remove user's listing from the all-listings array for UI update
    state.allListings = state.allListings.filter((l) => l.id !== state.currentUser.uid);

    // Re-render tables to remove deleted listing
    renderTable();
    renderMyPreview();
    // Clear form fields for a fresh start
    resetForm();
    // Show success message
    setMsg("success-msg", "Your listing has been removed.");
  } catch (error) {
    // Log error for debugging
    console.error("Delete error:", error);
    // Show user-friendly error message
    alert("Failed to delete. Please try again.");
  }
}

export function startListingsListener() {
  if (state.unsubListings) state.unsubListings();

  const listingsQuery = query(collection(db, "listings"), orderBy("submittedAt", "desc"));
  state.unsubListings = onSnapshot(
    listingsQuery,
    (snapshot) => {
      state.allListings = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
      renderTable();
      renderMyPreview();
    },
    (error) => {
      console.error("Listings error:", error);
      const tbody = $("listings-tbody");
      if (!tbody) return;
      tbody.innerHTML = `<tr><td colspan="6" style="padding:2rem;text-align:center;color:#dc2626">
        Error loading listings — check Firestore rules.<br><small>${esc(error.message)}</small>
      </td></tr>`;
    }
  );
}

export async function loadUserListing() {
  if (!state.currentUser) return;

  const listingSnapshot = await getDoc(doc(db, "listings", state.currentUser.uid));
  state.hasListing = listingSnapshot.exists();

  if (state.hasListing) {
    const contactSnapshot = await getDoc(doc(db, "contacts", state.currentUser.uid));
    const listingData = listingSnapshot.data();

    state.myListing = listingData;
    fillForm(listingData, contactSnapshot.exists() ? contactSnapshot.data() : {});
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent = "Your listing is live — edit or remove it below.";
    $("btn-submit").textContent = "Update Listing";
    show($("btn-delete"));
  } else {
    state.myListing = null;
    $("form-title").textContent = "Submit Your Swap Listing";
    $("form-sub").textContent = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
    $("btn-submit").textContent = "Submit Listing";
    hide($("btn-delete"));
  }
}

export async function refreshContacts() {
  if (!state.currentUser) {
    state.contactsMap = {};
    return;
  }
  try {
    const snapshot = await getDocs(collection(db, "contacts"));
    state.contactsMap = {};
    snapshot.forEach((docRef) => { state.contactsMap[docRef.id] = docRef.data(); });
  } catch {
    state.contactsMap = {};
  }
}

export async function handleSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) return;

  setErr("form-err", "");
  setMsg("success-msg", "");

  const housingGender = $("f-gender").value;
  const currentCampusGroup = $("f-campus-group").value;
  const currentLargeResidenceArea = $("f-large-area")?.value || "";
  const currentAddress = $("f-building").value;
  const layout = $("f-layout").value; // e.g. "Traditional Double"
  const roommateEl = document.querySelector("[name='f-roommate']:checked");

  const totalPeopleInput = $("f-total-people")?.value || "";
  const totalPeople = Number(totalPeopleInput);
  const pitch = censorProfanityInText($("f-pitch").value.trim());
  const otherDetails = censorProfanityInText($("f-details").value.trim());
  const wantedGenders     = getChecked("wg");
  const wantedCampusGroups = [...document.querySelectorAll("[name='wcg']")]
    .filter((checkbox) => checkbox.value !== "Any" && checkbox.checked)
    .map((checkbox) => checkbox.value);
  const wantedLargeResidenceAreas = getChecked("wla");
  const wantedLargeResidenceBuildings = getChecked("wlb");
  const wantedLayoutStyles = getChecked("wls");
  const reddit = censorProfanityInText($("f-reddit").value.trim());
  const phone  = $("f-phone").value.trim();
  const other  = censorProfanityInText($("f-other").value.trim());
  const agreedToTerms = $("f-terms")?.checked;

  // Validation
  if (!housingGender) return setErr("form-err", "Select your housing assignment gender.");
  if (!currentCampusGroup) return setErr("form-err", "Select your campus group.");
  if (currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP && !currentLargeResidenceArea) {
    return setErr("form-err", "Select your Large Residence area.");
  }
  if (!currentAddress) return setErr("form-err", "Select your current address.");
  if (!layout) return setErr("form-err", "Select your room layout.");
  if (!roommateEl) return setErr("form-err", "Indicate whether you're bringing a roommate.");
  if (roommateEl.value === "true") {
    if (!Number.isInteger(totalPeople) || totalPeople < 2 || totalPeople > 8) {
      return setErr("form-err", "If bringing a roommate, enter total people as a whole number from 2 to 8.");
    }
  }
  if (!pitch) return setErr("form-err", "Describe your room's best features.");
  if (!wantedGenders.length) return setErr("form-err", "Select at least one gender housing preference.");

  const allowedWantedByHousing = {
    Male: new Set(["Male", "Gender Neutral"]),
    Female: new Set(["Female", "Gender Neutral"]),
    "Gender Neutral": new Set(["Male", "Female", "Gender Neutral"]),
  };
  const allowedWanted = allowedWantedByHousing[housingGender] || new Set(["Male", "Female", "Gender Neutral"]);
  if (wantedGenders.some((gender) => !allowedWanted.has(gender))) {
    return setErr(
      "form-err",
      housingGender === "Gender Neutral"
        ? "Invalid gender preference selection."
        : `If your housing assignment is ${housingGender}, you can only choose ${housingGender} or Gender Neutral.`
    );
  }

  if (!wantedCampusGroups.length) return setErr("form-err", "Select at least one campus group you'd consider.");
  if (wantedCampusGroups.includes(LARGE_STYLE_RESIDENCES_GROUP) && !wantedLargeResidenceAreas.length) {
    return setErr("form-err", "Select at least one Large Residence area you'd consider.");
  }
  if (wantedCampusGroups.includes(LARGE_STYLE_RESIDENCES_GROUP) && !wantedLargeResidenceBuildings.length) {
    return setErr("form-err", "Select at least one Large Residence building you'd consider.");
  }
  if (!wantedLayoutStyles.length) return setErr("form-err", "Select at least one layout style you'd consider.");
  if (!reddit && !phone && !other) return setErr("form-err", "Add at least one contact method beyond your BU email.");
  if (!agreedToTerms) return setErr("form-err", "You must agree to the terms and conditions to submit your listing.");

  const selectedBuilding = getBuildingByAddress(currentAddress);
  if (!selectedBuilding) {
    return setErr("form-err", "Could not match that address to BU housing data. Please reselect your campus group and address.");
  }

  if (currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP && selectedBuilding.area !== currentLargeResidenceArea) {
    return setErr("form-err", "Selected building does not match the chosen Large Residence area.");
  }

  // Split "Traditional Double" → roomType: "Traditional", occupancy: "Double"
  // Stored separately so browse filters can query each independently.
  const { roomType, occupancy } = parseLayout(layout);

  const submitButton = $("btn-submit");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  const isNew = !state.hasListing;
  const listingRef = doc(db, "listings", state.currentUser.uid);
  const contactRef  = doc(db, "contacts",  state.currentUser.uid);
  const now = serverTimestamp();

  try {
    const listingData = {
      email: state.currentUser.email,
      housingGender,
      currentBuilding: selectedBuilding.name,
      currentCampusGroup,
      currentLargeResidenceArea: currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP ? currentLargeResidenceArea : "",
      currentAddress,
      layout,       // full string, e.g. "Traditional Double"
      roomType,     // "Traditional" — used by browse type filter
      occupancy,    // "Double"      — used by browse occupancy filter
      bringingRoommate: roommateEl.value === "true",
      totalPeople: roommateEl.value === "true" ? totalPeople : null,
      pitch,
      otherDetails,
      wantedGenders,
      wantedCampusGroups,
      wantedLargeResidenceAreas,
      wantedLargeResidenceBuildings,
      wantedLayoutStyles,
      updatedAt: now,
      ...(isNew && { submittedAt: now }),
    };

    const batch = writeBatch(db);
    if (isNew) {
      batch.set(listingRef, listingData);
    } else {
      batch.update(listingRef, listingData);
    }

    batch.set(
      contactRef,
      {
        email: state.currentUser.email,
        redditUsername: reddit,
        phone,
        otherContact: other,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();

    state.hasListing = true;
    state.myListing = listingData;
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent = "Your listing is live — edit or remove it below.";
    show($("btn-delete"));

    await refreshContacts();
    renderTable();
    renderMyPreview();

    setMsg("success-msg", isNew
      ? "Listing submitted! Switch to Browse Listings to see what others see."
      : "Listing updated!");

    if (isNew) setTimeout(() => showPanel("browse"), 1800);
  } catch (error) {
    console.error("Submit error:", error);
    setErr("form-err", `Save failed (${error.code || error.message}) — check your Firestore rules.`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = state.hasListing ? "Update Listing" : "Submit Listing";
  }
}

export async function handleDelete() {
  if (!state.currentUser) return;
  if (!confirm("Remove your listing? You'll no longer appear in the database.")) return;

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "listings", state.currentUser.uid));
    batch.delete(doc(db, "contacts", state.currentUser.uid));
    await batch.commit();

    state.hasListing = false;
    state.myListing = null;
    state.contactsMap = {};
    state.allListings = state.allListings.filter((l) => l.id !== state.currentUser.uid);

    renderTable();
    renderMyPreview();
    resetForm();
    setMsg("success-msg", "Your listing has been removed.");
  } catch (error) {
    console.error("Delete error:", error);
    alert("Failed to delete. Please try again.");
  }
}
