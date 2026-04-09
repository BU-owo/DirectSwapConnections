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
import { renderTable, renderMyPreview, fillForm, resetForm, showPanel } from "./ui.js";

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

      tbody.innerHTML = `<tr><td colspan="8" style="padding:2rem;text-align:center;color:#dc2626">
        Error loading listings - check Firestore rules.<br><small>${esc(error.message)}</small>
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
    $("form-sub").textContent = "Your listing is live - edit or remove it below.";
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
    snapshot.forEach((docRef) => {
      state.contactsMap[docRef.id] = docRef.data();
    });
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
  const currentBuilding = $("f-building").value;
  const roomType = $("f-type").value;
  const occupancy = $("f-occ").value;
  const roommateEl = document.querySelector("[name='f-roommate']:checked");
  const pitch = $("f-pitch").value.trim();
  const otherDetails = $("f-details").value.trim();
  const wantedGenders = getChecked("wg");
  const wantedTypes = getChecked("wt");
  const wantedOccupancies = getChecked("wo");
  const wantedBuildings = getChecked("wb");
  const reddit = $("f-reddit").value.trim();
  const phone = $("f-phone").value.trim();
  const other = $("f-other").value.trim();

  if (!housingGender) return setErr("form-err", "Select your housing assignment gender.");
  if (!currentBuilding) return setErr("form-err", "Select your current building.");
  if (!roomType) return setErr("form-err", "Select your room type.");
  if (!occupancy) return setErr("form-err", "Select your room occupancy.");
  if (!roommateEl) return setErr("form-err", "Indicate whether you're bringing a roommate.");
  if (!pitch) return setErr("form-err", "Describe your room's best features.");
  if (!wantedGenders.length) return setErr("form-err", "Select at least one gender housing preference.");
  if (!wantedTypes.length) return setErr("form-err", "Select at least one room type you'd consider.");
  if (!wantedOccupancies.length) return setErr("form-err", "Select at least one occupancy you'd consider.");
  if (!wantedBuildings.length) return setErr("form-err", "Select at least one building you'd consider.");
  if (!reddit && !phone && !other) return setErr("form-err", "Add at least one contact method beyond your BU email.");

  const submitButton = $("btn-submit");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  const isNew = !state.hasListing;
  const listingRef = doc(db, "listings", state.currentUser.uid);
  const contactRef = doc(db, "contacts", state.currentUser.uid);
  const now = serverTimestamp();

  try {
    const listingData = {
      email: state.currentUser.email,
      housingGender,
      currentBuilding,
      roomType,
      occupancy,
      bringingRoommate: roommateEl.value === "true",
      pitch,
      otherDetails,
      wantedGenders,
      wantedTypes,
      wantedOccupancies,
      wantedBuildings,
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
    $("form-sub").textContent = "Your listing is live - edit or remove it below.";
    show($("btn-delete"));

    await refreshContacts();
    renderTable();
    renderMyPreview();

    setMsg("success-msg", isNew ? "Listing submitted! Switch to Browse Listings to see what others see." : "Listing updated!");

    if (isNew) setTimeout(() => showPanel("browse"), 1800);
  } catch (error) {
    console.error("Submit error:", error);
    setErr("form-err", `Save failed (${error.code || error.message}) - check your Firestore rules.`);
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
    state.allListings = state.allListings.filter((listing) => listing.id !== state.currentUser.uid);

    renderTable();
    renderMyPreview();
    resetForm();
    setMsg("success-msg", "Your listing has been removed.");
  } catch (error) {
    console.error("Delete error:", error);
    alert("Failed to delete. Please try again.");
  }
}
