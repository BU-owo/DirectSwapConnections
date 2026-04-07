// ══════════════════════════════════════════════════════════════
//  Firebase Config — already set from earlier
// ══════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyAo8yMTgXG5itJnbWsIl8WW_YGzK_xF_ZI",
  authDomain: "bu-direct-swap.firebaseapp.com",
  projectId: "bu-direct-swap",
  storageBucket: "bu-direct-swap.firebasestorage.app",
  messagingSenderId: "353680083539",
  appId: "1:353680083539:web:ab313dc71b39a7c74bd4a6",
  measurementId: "G-CZ1EQX1HS1"
};

// ── Firebase Imports ───────────────────────────────────────────
import { initializeApp }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  setDoc, updateDoc, getDoc, getDocs,
  deleteDoc, query, orderBy, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Init ───────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Data ───────────────────────────────────────────────────────
const BUILDINGS = [
  "Warren Towers",
  "West Campus – Claflin Hall",
  "West Campus – Danielsen Hall",
  "West Campus – Rich Hall",
  "West Campus – Sleeper Hall",
  "Myles Standish Hall",
  "Shelton Hall",
  "Kilachand Hall",
  "The Towers (1019 Comm Ave)",
  "Student Village I (10 Buick St)",
  "Student Village II (33 Harry Agganis Way)",
  "South Campus Brownstones",
  "Fenway Campus",
  "Other / Off Campus",
];

const OCCUPANCIES = [
  "Single",
  "Double",
  "Triple",
  "Quad",
  "Single in Suite",
  "Double in Suite",
  "Triple in Suite",
  "Studio",
  "1-Bedroom Apartment",
  "2-Bedroom Apartment",
  "3+ Bedroom Apartment",
];

const GENDERS = ["Men's", "Women's", "Gender Inclusive"];

// ── State ──────────────────────────────────────────────────────
let currentUser   = null;
let hasListing    = false;
let allListings   = [];
let contactsMap   = {};
let unsubListings = null;

// ── DOM Helpers ────────────────────────────────────────────────
const el         = (id) => document.getElementById(id);
const show       = (e)  => e && e.classList.remove("hidden");
const hide       = (e)  => e && e.classList.add("hidden");
const getChecked = (name) =>
  [...document.querySelectorAll(`[name="${name}"]:checked`)].map((cb) => cb.value);

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function showErr(id, msg) { const e = el(id); if (e) { e.textContent = msg; show(e); } }
function clearErr(id)     { const e = el(id); if (e) { e.textContent = "";  hide(e); } }
function showMsg(id, msg) { const e = el(id); if (e) { e.innerHTML  = msg; show(e); } }
function clearMsg(id)     { const e = el(id); if (e) { e.innerHTML  = "";  hide(e); } }

// ── Bootstrap ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  populateOptions();
  bindEvents();
  handleEmailReturn();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      el("header-email").textContent = user.email;
      show(el("header-user"));
      hide(el("hero-section"));
      hide(el("view-signin"));
      show(el("view-app"));
      await loadUserState();
      startListingsListener();
    } else {
      currentUser  = null;
      hasListing   = false;
      allListings  = [];
      contactsMap  = {};
      if (unsubListings) { unsubListings(); unsubListings = null; }
      hide(el("view-app"));
      show(el("view-signin"));
      hide(el("header-user"));
      show(el("hero-section"));
      show(el("signin-form-inner"));
      hide(el("signin-sent"));
      resetSignInBtn();
    }
  });
});

// ── Populate Dropdowns & Checkboxes ───────────────────────────
function populateOptions() {
  appendOpts("filter-building",  BUILDINGS);
  appendOpts("filter-occupancy", OCCUPANCIES);
  appendOpts("f-building",       BUILDINGS);
  appendOpts("f-occupancy",      OCCUPANCIES);

  appendCBs("wanted-genders-wrap",     "wanted-gender",    GENDERS);
  appendCBs("wanted-buildings-wrap",   "wanted-building",  BUILDINGS);
  appendCBs("wanted-occupancies-wrap", "wanted-occupancy", OCCUPANCIES);
}

function appendOpts(selectId, items) {
  const sel = el(selectId);
  if (!sel) return;
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item; opt.textContent = item;
    sel.appendChild(opt);
  });
}

function appendCBs(wrapperId, name, items) {
  const wrap = el(wrapperId);
  if (!wrap) return;
  items.forEach((item) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(item)}" /> ${esc(item)}`;
    wrap.appendChild(label);
  });
}

// ── Event Bindings ─────────────────────────────────────────────
function bindEvents() {
  el("send-link-btn").addEventListener("click", sendLink);
  el("email-input").addEventListener("keydown", (e) => e.key === "Enter" && sendLink());
  el("signout-btn").addEventListener("click",   () => signOut(auth));

  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => switchTab(btn.dataset.tab))
  );

  el("go-to-my-listing")?.addEventListener("click", () => switchTab("my-listing"));
  el("go-to-form-btn")?.addEventListener("click",   () => switchTab("my-listing"));

  ["filter-gender","filter-building","filter-occupancy","filter-roommate","filter-sort"]
    .forEach((id) => el(id)?.addEventListener("change", renderListings));
  el("filter-search")?.addEventListener("input",  renderListings);
  el("clear-filters")?.addEventListener("click",  clearFilters);

  el("listing-form").addEventListener("submit",     submitListing);
  el("delete-listing-btn").addEventListener("click", deleteListing);

  el("select-all-buildings")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wanted-building']").forEach((cb) => (cb.checked = true))
  );
  el("clear-all-buildings")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wanted-building']").forEach((cb) => (cb.checked = false))
  );

  el("f-pitch").addEventListener("input",   () => el("pitch-count").textContent   = el("f-pitch").value.length);
  el("f-details").addEventListener("input", () => el("details-count").textContent = el("f-details").value.length);
}

// ── Tab Switching ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  document.querySelectorAll("[data-panel]").forEach((panel) =>
    panel.classList.toggle("hidden", panel.dataset.panel !== tab)
  );
}

// Table header sort (needs window scope for inline onclick)
window.setSort = function(val) {
  const sel = el("filter-sort");
  if (sel) { sel.value = val; renderListings(); }
};

// ── Auth: Email Link ───────────────────────────────────────────
function handleEmailReturn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;
  let email = localStorage.getItem("buSwapEmail");
  if (!email) email = prompt("Please enter your BU email to finish signing in:");
  if (!email) return;
  signInWithEmailLink(auth, email, window.location.href)
    .then(() => {
      localStorage.removeItem("buSwapEmail");
      history.replaceState(null, "", location.pathname);
    })
    .catch((err) => {
      console.error(err);
      showErr("signin-error", "Sign-in link expired or already used — request a new one.");
    });
}

async function sendLink() {
  const email = el("email-input").value.trim().toLowerCase();
  clearErr("signin-error");
  if (!email)                     return showErr("signin-error", "Enter your BU email.");
  if (!email.endsWith("@bu.edu")) return showErr("signin-error", "Only @bu.edu addresses are allowed.");

  const btn = el("send-link-btn");
  btn.disabled = true; btn.textContent = "Sending…";

  try {
    await sendSignInLinkToEmail(auth, email, {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true,
    });
    localStorage.setItem("buSwapEmail", email);
    el("sent-email-display").textContent = email;
    hide(el("signin-form-inner"));
    show(el("signin-sent"));
  } catch (err) {
    console.error(err);
    showErr("signin-error", "Could not send link. Please try again.");
    resetSignInBtn();
  }
}

function resetSignInBtn() {
  const btn = el("send-link-btn");
  if (btn) { btn.disabled = false; btn.textContent = "Send Sign-In Link"; }
}

// ── User State ─────────────────────────────────────────────────
async function loadUserState() {
  const snap = await getDoc(doc(db, "listings", currentUser.uid));
  hasListing = snap.exists();

  if (hasListing) {
    const cSnap = await getDoc(doc(db, "contacts", currentUser.uid));
    populateForm(snap.data(), cSnap.exists() ? cSnap.data() : {});
    el("form-heading").textContent    = "Update My Listing";
    el("form-subheading").textContent = "Your listing is live. Update anything below.";
    el("submit-btn").textContent      = "Update Listing";
    show(el("delete-listing-btn"));
  } else {
    el("form-heading").textContent    = "Submit Your Swap Listing";
    el("form-subheading").textContent = "Fill this out to appear in the swap database and unlock contact info for other listings.";
    el("submit-btn").textContent      = "Submit Listing";
    hide(el("delete-listing-btn"));
  }
  updateBanner();
}

function updateBanner() {
  hasListing ? hide(el("no-listing-banner")) : show(el("no-listing-banner"));
}

// ── Listings Listener ──────────────────────────────────────────
function startListingsListener() {
  if (unsubListings) unsubListings();
  const q = query(collection(db, "listings"), orderBy("submittedAt", "desc"));
  unsubListings = onSnapshot(q, async (snapshot) => {
    allListings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (hasListing) {
      try {
        const cs = await getDocs(collection(db, "contacts"));
        contactsMap = {};
        cs.forEach((d) => { contactsMap[d.id] = d.data(); });
      } catch (_) { contactsMap = {}; }
    }
    renderListings();
  });
}

// ── Render Table ───────────────────────────────────────────────
function renderListings() {
  const tbody = el("listings-tbody");
  if (!tbody) return;

  const fGender    = el("filter-gender")?.value    || "";
  const fBuilding  = el("filter-building")?.value  || "";
  const fOccupancy = el("filter-occupancy")?.value || "";
  const fRoommate  = el("filter-roommate")?.value  || "";
  const fSort      = el("filter-sort")?.value      || "newest";
  const fSearch    = (el("filter-search")?.value   || "").toLowerCase().trim();

  let list = allListings.filter((l) => l.id !== currentUser?.uid);

  if (fGender)    list = list.filter((l) => l.housingGender   === fGender);
  if (fBuilding)  list = list.filter((l) => l.currentBuilding === fBuilding);
  if (fOccupancy) list = list.filter((l) => l.occupancy       === fOccupancy);
  if (fRoommate !== "") list = list.filter((l) => String(l.bringingRoommate) === fRoommate);
  if (fSearch) {
    list = list.filter((l) => {
      const blob = [
        l.currentBuilding, l.housingGender, l.occupancy,
        l.pitch, l.otherDetails,
        ...(l.wantedBuildings    || []),
        ...(l.wantedGenders      || []),
        ...(l.wantedOccupancies  || []),
      ].join(" ").toLowerCase();
      return blob.includes(fSearch);
    });
  }

  if (fSort === "oldest") {
    list = [...list].reverse();
  } else if (fSort === "building") {
    list = [...list].sort((a, b) =>
      (a.currentBuilding || "").localeCompare(b.currentBuilding || "")
    );
  }

  const countEl = el("listings-count");
  if (countEl) countEl.textContent = `${list.length} listing${list.length !== 1 ? "s" : ""}`;

  if (list.length === 0) {
    const filtered = fGender || fBuilding || fOccupancy || fRoommate !== "" || fSearch;
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="icon">🏠</div>
          <p>${filtered ? "No listings match your filters." : "No listings yet — be the first!"}</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(renderRow).join("");
}

function renderRow(listing) {
  const date = listing.submittedAt?.toDate
    ? listing.submittedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Recently";

  const wantedGenders     = (listing.wantedGenders     || []).join(", ") || "—";
  const wantedBuildings   = (listing.wantedBuildings   || []).join(", ") || "—";
  const wantedOccupancies = (listing.wantedOccupancies || []).join(", ") || "—";

  let contactHtml = "";
  if (!hasListing) {
    contactHtml = `<span class="contact-locked-inline">🔒 Submit listing to unlock</span>`;
  } else {
    const c = contactsMap[listing.id] || {};
    const parts = [];
    if (listing.email)    parts.push(`<a href="mailto:${esc(listing.email)}" class="contact-link">${esc(listing.email)}</a>`);
    if (c.redditUsername) parts.push(`<small class="muted">${esc(c.redditUsername)}</small>`);
    if (c.phone)          parts.push(`<small class="muted">${esc(c.phone)}</small>`);
    if (c.otherContact)   parts.push(`<small class="muted">${esc(c.otherContact)}</small>`);
    contactHtml = parts.join("<br>") || "(none provided)";
  }

  return `<tr>
    <td><span class="badge">${esc(listing.currentBuilding || "—")}</span></td>
    <td class="muted">${esc(listing.housingGender || "—")}</td>
    <td class="muted">
      ${esc(listing.occupancy || "—")}
      ${listing.bringingRoommate ? `<br><span class="badge gold">+Roommate</span>` : ""}
    </td>
    <td>
      <div style="max-width:260px;line-height:1.5">${esc(listing.pitch || "—")}</div>
      ${listing.otherDetails
        ? `<div style="font-size:0.8rem;color:var(--muted);font-style:italic;margin-top:4px">${esc(listing.otherDetails)}</div>`
        : ""}
    </td>
    <td class="muted" style="font-size:0.82rem;min-width:160px">
      <div><strong>Gender:</strong> ${esc(wantedGenders)}</div>
      <div><strong>Occ.:</strong> ${esc(wantedOccupancies)}</div>
      <div><strong>Buildings:</strong> ${esc(wantedBuildings)}</div>
    </td>
    <td style="min-width:140px">${contactHtml}</td>
    <td class="muted">${date}</td>
  </tr>`;
}

function clearFilters() {
  ["filter-gender","filter-building","filter-occupancy","filter-roommate","filter-sort"]
    .forEach((id) => { const e = el(id); if (e) e.value = id === "filter-sort" ? "newest" : ""; });
  const s = el("filter-search"); if (s) s.value = "";
  renderListings();
}

// ── Form: Populate ─────────────────────────────────────────────
function populateForm(listing, contact) {
  el("f-gender").value    = listing.housingGender   || "";
  el("f-building").value  = listing.currentBuilding || "";
  el("f-occupancy").value = listing.occupancy       || "";

  document.querySelectorAll("[name='f-roommate']").forEach((r) => {
    r.checked = r.value === String(listing.bringingRoommate);
  });

  el("f-pitch").value   = listing.pitch        || "";
  el("pitch-count").textContent   = (listing.pitch || "").length;
  el("f-details").value = listing.otherDetails || "";
  el("details-count").textContent = (listing.otherDetails || "").length;

  document.querySelectorAll("[name='wanted-gender']").forEach((cb) => {
    cb.checked = (listing.wantedGenders || []).includes(cb.value);
  });
  document.querySelectorAll("[name='wanted-building']").forEach((cb) => {
    cb.checked = (listing.wantedBuildings || []).includes(cb.value);
  });
  document.querySelectorAll("[name='wanted-occupancy']").forEach((cb) => {
    cb.checked = (listing.wantedOccupancies || []).includes(cb.value);
  });

  el("f-reddit").value = contact.redditUsername || "";
  el("f-phone").value  = contact.phone         || "";
  el("f-other").value  = contact.otherContact  || "";
}

// ── Form: Submit ───────────────────────────────────────────────
async function submitListing(e) {
  e.preventDefault();
  clearErr("form-error");
  clearMsg("form-success");

  const housingGender     = el("f-gender").value;
  const currentBuilding   = el("f-building").value;
  const occupancy         = el("f-occupancy").value;
  const roommateEl        = document.querySelector("[name='f-roommate']:checked");
  const pitch             = el("f-pitch").value.trim();
  const otherDetails      = el("f-details").value.trim();
  const wantedGenders     = getChecked("wanted-gender");
  const wantedBuildings   = getChecked("wanted-building");
  const wantedOccupancies = getChecked("wanted-occupancy");
  const reddit = el("f-reddit").value.trim();
  const phone  = el("f-phone").value.trim();
  const other  = el("f-other").value.trim();

  if (!housingGender)           return showErr("form-error", "Select your housing assignment gender.");
  if (!currentBuilding)         return showErr("form-error", "Select your current building.");
  if (!occupancy)               return showErr("form-error", "Select your room occupancy.");
  if (!roommateEl)              return showErr("form-error", "Indicate whether you're bringing a roommate.");
  if (!pitch)                   return showErr("form-error", "Add a pitch for your room.");
  if (!wantedGenders.length)    return showErr("form-error", "Select at least one gender housing preference.");
  if (!wantedBuildings.length)  return showErr("form-error", "Select at least one building you'd consider.");
  if (!wantedOccupancies.length) return showErr("form-error", "Select at least one occupancy you'd consider.");
  if (!reddit && !phone && !other) return showErr("form-error", "Add at least one contact method.");

  const btn = el("submit-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  try {
    const isNew      = !hasListing;
    const listingRef = doc(db, "listings", currentUser.uid);
    const contactRef = doc(db, "contacts",  currentUser.uid);

    const listingData = {
      email: currentUser.email,
      housingGender, currentBuilding, occupancy,
      bringingRoommate: roommateEl.value === "true",
      pitch, otherDetails,
      wantedGenders, wantedBuildings, wantedOccupancies,
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      listingData.submittedAt = serverTimestamp();
      await setDoc(listingRef, listingData);
    } else {
      await updateDoc(listingRef, listingData);
    }

    await setDoc(contactRef, {
      redditUsername: reddit, phone, otherContact: other,
      updatedAt: serverTimestamp(),
    });

    hasListing = true;
    updateBanner();

    try {
      const cs = await getDocs(collection(db, "contacts"));
      contactsMap = {};
      cs.forEach((d) => { contactsMap[d.id] = d.data(); });
    } catch (_) {}

    renderListings();

    el("form-heading").textContent    = "Update My Listing";
    el("form-subheading").textContent = "Your listing is live. Update anything below.";
    el("submit-btn").textContent      = "Update Listing";
    show(el("delete-listing-btn"));

    if (isNew) {
      showMsg("form-success", "🎉 Listing submitted! You can now view contact info for other swappers.");
      setTimeout(() => switchTab("browse"), 2500);
    } else {
      showMsg("form-success", "✅ Listing updated!");
    }
  } catch (err) {
    console.error(err);
    showErr("form-error", "Failed to save. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = hasListing ? "Update Listing" : "Submit Listing";
  }
}

// ── Form: Delete ───────────────────────────────────────────────
async function deleteListing() {
  const confirmed = confirm(
    "Remove your listing? You will no longer appear in the swap database and will lose access to other people's contact info."
  );
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "listings", currentUser.uid));
    await deleteDoc(doc(db, "contacts",  currentUser.uid));

    hasListing  = false;
    contactsMap = {};
    allListings = allListings.filter((l) => l.id !== currentUser.uid);

    updateBanner();
    renderListings();

    el("listing-form").reset();
    document.querySelectorAll(
      "#listing-form input[type='checkbox'], #listing-form input[type='radio']"
    ).forEach((i) => (i.checked = false));
    el("pitch-count").textContent   = "0";
    el("details-count").textContent = "0";

    el("form-heading").textContent    = "Submit Your Swap Listing";
    el("form-subheading").textContent = "Fill this out to appear in the swap database and unlock contact info for other listings.";
    el("submit-btn").textContent      = "Submit Listing";
    hide(el("delete-listing-btn"));

    showMsg("form-success", "Your listing has been removed.");
  } catch (err) {
    console.error(err);
    alert("Failed to delete. Please try again.");
  }
}