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

const PROFANITY_PATTERN = /\b(fuck|fucking|shit|bitch|asshole|dick|bastard|whore|slut|cunt|motherfucker|piss)\b/gi;

function censorProfanityInText(value) {
  return String(value ?? "").replace(PROFANITY_PATTERN, (match) => "*".repeat(match.length));
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
    if (!Number.isInteger(totalPeople) || totalPeople < 2 || totalPeople > 10) {
      return setErr("form-err", "If bringing a roommate, enter total people as a whole number from 2 to 10.");
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
