// ── Firebase Config ────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAo8yMTgXG5itJnbWsIl8WW_YGzK_xF_ZI",
  authDomain: "bu-direct-swap.firebaseapp.com",
  projectId: "bu-direct-swap",
  storageBucket: "bu-direct-swap.firebasestorage.app",
  messagingSenderId: "353680083539",
  appId: "1:353680083539:web:ab313dc71b39a7c74bd4a6",
  measurementId: "G-CZ1EQX1HS1"
};

// ── Imports ────────────────────────────────────────────────────
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, writeBatch,
  getDoc, getDocs, query, orderBy, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Constants ──────────────────────────────────────────────────
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
  "Single","Double","Triple","Quad",
  "Single in Suite","Double in Suite","Triple in Suite",
  "Studio","1-Bedroom Apartment","2-Bedroom Apartment","3+ Bedroom Apartment",
];
const GENDERS = ["Men's","Women's","Gender Inclusive"];

// ── State ──────────────────────────────────────────────────────
let currentUser   = null;
let hasListing    = false;
let allListings   = [];
let contactsMap   = {};
let unsubListings = null;

// ── Helpers ────────────────────────────────────────────────────
const el   = (id) => document.getElementById(id);
const show = (e)  => e?.classList.remove("hidden");
const hide = (e)  => e?.classList.add("hidden");
const getChecked = (name) =>
  [...document.querySelectorAll(`[name="${name}"]:checked`)].map(cb => cb.value);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// "jsmith@bu.edu" → "jsmith-at-bu-dot-edu"
function emailToDocId(email) {
  return email.toLowerCase().replace(/@/g,"-at-").replace(/\./g,"-dot-");
}

function setErr(id, msg) {
  const e = el(id);
  if (!e) return;
  e.textContent = msg;
  msg ? show(e) : hide(e);
}
function setMsg(id, html) {
  const e = el(id);
  if (!e) return;
  e.innerHTML = html;
  html ? show(e) : hide(e);
}

// ── Bootstrap ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  populateOptions();
  bindEvents();
  handleEmailLink();
  startListingsListener(); // listings are public — start immediately

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
      el("nav-email").textContent = user.email;
      hide(el("auth-out"));
      show(el("auth-in"));
      hide(el("contact-banner"));
      hide(el("edit-notice"));
      await loadUserListing();
      await refreshContacts();
      renderTable();
    } else {
      show(el("auth-out"));
      hide(el("auth-in"));
      show(el("contact-banner"));
      show(el("edit-notice"));
      hasListing  = false;
      contactsMap = {};
      resetForm();
      renderTable();
    }
  });
});

// ── Populate Dropdowns + Checkboxes ───────────────────────────
function populateOptions() {
  appendOpts("filter-building",  BUILDINGS);
  appendOpts("filter-occupancy", OCCUPANCIES);
  appendOpts("f-building",       BUILDINGS);
  appendOpts("f-occupancy",      OCCUPANCIES);
  appendCBs("wanted-genders-wrap",     "wanted-gender",    GENDERS);
  appendCBs("wanted-buildings-wrap",   "wanted-building",  BUILDINGS);
  appendCBs("wanted-occupancies-wrap", "wanted-occupancy", OCCUPANCIES);
}
function appendOpts(selId, items) {
  const s = el(selId); if (!s) return;
  items.forEach(v => { const o = document.createElement("option"); o.value = o.textContent = v; s.appendChild(o); });
}
function appendCBs(wrapId, name, items) {
  const w = el(wrapId); if (!w) return;
  items.forEach(v => {
    const lbl = document.createElement("label");
    lbl.className = "check-label";
    lbl.innerHTML = `<input type="checkbox" name="${name}" value="${esc(v)}" /> ${esc(v)}`;
    w.appendChild(lbl);
  });
}

// ── Event Bindings ─────────────────────────────────────────────
function bindEvents() {
  // Panel switching — every element with data-show
  document.querySelectorAll("[data-show]").forEach(btn =>
    btn.addEventListener("click", () => showPanel(btn.dataset.show))
  );

  // Modal open triggers
  el("open-signin")?.addEventListener("click",      openModal);
  el("banner-signin-btn")?.addEventListener("click", openModal);
  el("edit-signin-btn")?.addEventListener("click",   openModal);

  // Modal close
  el("modal-close")?.addEventListener("click", closeModal);
  el("signin-modal")?.addEventListener("click", (e) => {
    if (e.target === el("signin-modal")) closeModal();
  });

  // Modal send link
  el("modal-send-btn")?.addEventListener("click", sendMagicLink);
  el("modal-email")?.addEventListener("keydown",  (e) => e.key === "Enter" && sendMagicLink());

  // Sign out
  el("signout-btn")?.addEventListener("click", () => signOut(auth));

  // Filters
  ["filter-gender","filter-building","filter-occupancy","filter-roommate","filter-sort"]
    .forEach(id => el(id)?.addEventListener("change", renderTable));
  el("filter-search")?.addEventListener("input", renderTable);
  el("clear-filters")?.addEventListener("click", () => {
    ["filter-gender","filter-building","filter-occupancy","filter-roommate"]
      .forEach(id => { const e = el(id); if (e) e.value = ""; });
    const s = el("filter-search"); if (s) s.value = "";
    const so = el("filter-sort"); if (so) so.value = "newest";
    renderTable();
  });

  // Form
  el("listing-form")?.addEventListener("submit", handleSubmit);
  el("delete-btn")?.addEventListener("click",    handleDelete);

  // Buildings select/clear all
  el("sel-all-bldgs")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wanted-building']").forEach(cb => cb.checked = true)
  );
  el("clr-all-bldgs")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wanted-building']").forEach(cb => cb.checked = false)
  );

  // Char counters
  el("f-pitch")?.addEventListener("input",   () => el("pitch-count").textContent   = el("f-pitch").value.length);
  el("f-details")?.addEventListener("input", () => el("details-count").textContent = el("f-details").value.length);
}

// ── Panel Switching ────────────────────────────────────────────
function showPanel(name) {
  el("panel-browse")?.classList.toggle("hidden", name !== "browse");
  el("panel-submit")?.classList.toggle("hidden", name !== "submit");
  document.querySelectorAll(".nav-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.show === name)
  );
}

// ── Sign-In Modal ──────────────────────────────────────────────
function openModal() {
  show(el("signin-modal"));
  setTimeout(() => el("modal-email")?.focus(), 80);
}

function closeModal() {
  hide(el("signin-modal"));
  show(el("modal-form"));
  hide(el("modal-sent"));
  setErr("modal-error", "");
  const btn = el("modal-send-btn");
  if (btn) { btn.disabled = false; btn.textContent = "Send Magic Link"; }
  const inp = el("modal-email");
  if (inp) inp.value = "";
}

async function sendMagicLink() {
  const email = (el("modal-email")?.value || "").trim().toLowerCase();
  setErr("modal-error", "");

  if (!email)                     return setErr("modal-error", "Enter your BU email.");
  if (!email.endsWith("@bu.edu")) return setErr("modal-error", "Only @bu.edu addresses are allowed.");

  const btn = el("modal-send-btn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    await sendSignInLinkToEmail(auth, email, {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true,
    });
    localStorage.setItem("buSwapEmail", email);
    hide(el("modal-form"));
    show(el("modal-sent"));
    if (el("modal-sent-email")) el("modal-sent-email").textContent = email;

  } catch (err) {
    console.error("Magic link error:", err.code, err.message);

    // Show the specific error so it's actually fixable
const msgs = {
  "auth/operation-not-allowed":
    `Email link sign-in is not turned on yet. Go to Firebase Console → Authentication → Sign-in method → Email/Password → enable "Email link (passwordless sign-in)". (auth/operation-not-allowed)`,

  "auth/unauthorized-continue-uri":
    `Domain not authorized. Go to Firebase Console → Authentication → Settings → Authorized domains → add "${location.hostname}". (auth/unauthorized-continue-uri)`,

  "auth/invalid-continue-uri":
    "Invalid redirect URL. (auth/invalid-continue-uri)",

  "auth/too-many-requests":
    "Too many attempts — please wait a few minutes and try again.",
};

    setErr("modal-error", msgs[err.code] || `Error ${err.code}: ${err.message}`);
    btn.disabled = false;
    btn.textContent = "Send Magic Link";
  }
}

// ── Handle Return from Email Link ──────────────────────────────
function handleEmailLink() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  let email = localStorage.getItem("buSwapEmail")
    || window.prompt("Enter your BU email to finish signing in:");
  if (!email) return;

  signInWithEmailLink(auth, email, window.location.href)
    .then(() => {
      localStorage.removeItem("buSwapEmail");
      history.replaceState(null, "", location.pathname);
      closeModal();
    })
    .catch(err => console.error("Sign-in completion error:", err));
}

// ── Load Signed-In User's Listing ─────────────────────────────
async function loadUserListing() {
  if (!currentUser) return;

  const docId = emailToDocId(currentUser.email);
  const snap  = await getDoc(doc(db, "listings", docId));
  hasListing  = snap.exists();

  // Email display (field hidden, display shown)
  hide(el("f-email-wrap"));
  show(el("f-email-display"));
  if (el("f-email-display")) el("f-email-display").textContent = `✉️ ${currentUser.email}`;

  if (hasListing) {
    const cSnap = await getDoc(doc(db, "contacts", docId));
    fillForm(snap.data(), cSnap.exists() ? cSnap.data() : {});
    el("form-title").textContent    = "Update Your Listing";
    el("form-subtitle").textContent = "Your listing is live — update or remove it below.";
    el("submit-btn").textContent    = "Update Listing";
    show(el("delete-btn"));
  } else {
    el("form-title").textContent    = "Submit Your Swap Listing";
    el("form-subtitle").textContent = "Your contact info will only be visible to signed-in BU students.";
    el("submit-btn").textContent    = "Submit Listing";
    hide(el("delete-btn"));
  }
}

// ── Fetch Contacts (auth required) ────────────────────────────
async function refreshContacts() {
  if (!currentUser) { contactsMap = {}; return; }
  try {
    const snap = await getDocs(collection(db, "contacts"));
    contactsMap = {};
    snap.forEach(d => { contactsMap[d.id] = d.data(); });
  } catch (_) { contactsMap = {}; }
}

// ── Real-Time Listings Listener ────────────────────────────────
function startListingsListener() {
  if (unsubListings) unsubListings();
  const q = query(collection(db, "listings"), orderBy("submittedAt", "desc"));
  unsubListings = onSnapshot(q,
    (snap) => {
      allListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTable();
    },
    (err) => {
      console.error("Listings listener error:", err);
      const tbody = el("listings-tbody");
      if (tbody) tbody.innerHTML = `
        <tr><td colspan="7" style="padding:2rem;text-align:center;color:#dc2626">
          Error loading listings — check your Firestore rules.<br>
          <small>${esc(err.message)}</small>
        </td></tr>`;
    }
  );
}

// ── Render Table ───────────────────────────────────────────────
function renderTable() {
  const tbody = el("listings-tbody");
  if (!tbody) return;

  const fGender    = el("filter-gender")?.value    || "";
  const fBuilding  = el("filter-building")?.value  || "";
  const fOccupancy = el("filter-occupancy")?.value || "";
  const fRoommate  = el("filter-roommate")?.value  || "";
  const fSort      = el("filter-sort")?.value      || "newest";
  const fSearch    = (el("filter-search")?.value   || "").toLowerCase().trim();

  // Exclude own listing
  const myDocId = currentUser ? emailToDocId(currentUser.email) : null;
  let list = allListings.filter(l => l.id !== myDocId);

  if (fGender)    list = list.filter(l => l.housingGender   === fGender);
  if (fBuilding)  list = list.filter(l => l.currentBuilding === fBuilding);
  if (fOccupancy) list = list.filter(l => l.occupancy       === fOccupancy);
  if (fRoommate !== "") list = list.filter(l => String(l.bringingRoommate) === fRoommate);
  if (fSearch) {
    list = list.filter(l => {
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

  if (fSort === "oldest") list = [...list].reverse();
  else if (fSort === "building")
    list = [...list].sort((a,b) => (a.currentBuilding||"").localeCompare(b.currentBuilding||""));

  const countEl = el("listings-count");
  if (countEl) countEl.textContent = `${list.length} listing${list.length !== 1 ? "s" : ""}`;

  if (!list.length) {
    const filtered = fGender || fBuilding || fOccupancy || fRoommate || fSearch;
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-icon">🏠</div>
        <p>${filtered ? "No listings match your filters." : "No listings yet — be the first to submit!"}</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(buildRow).join("");
  // Wire up locked contact cells to open modal
  tbody.querySelectorAll(".contact-locked").forEach(cell =>
    cell.addEventListener("click", openModal)
  );
}

function buildRow(l) {
  const date = l.submittedAt?.toDate
    ? l.submittedAt.toDate().toLocaleDateString("en-US",{month:"short",day:"numeric"})
    : "—";
  const wg = (l.wantedGenders     || []).join(", ") || "—";
  const wo = (l.wantedOccupancies || []).join(", ") || "—";
  const wb = (l.wantedBuildings   || []).join(", ") || "—";

  let contactCell;
  if (!currentUser) {
    contactCell = `<span class="contact-locked" title="Sign in to view">🔒 Sign in to view</span>`;
  } else {
    const c = contactsMap[l.id] || {};
    const parts = [];
    if (l.email)          parts.push(`<a href="mailto:${esc(l.email)}" class="contact-link">${esc(l.email)}</a>`);
    if (c.redditUsername) parts.push(`<small class="muted">${esc(c.redditUsername)}</small>`);
    if (c.phone)          parts.push(`<small class="muted">${esc(c.phone)}</small>`);
    if (c.otherContact)   parts.push(`<small class="muted">${esc(c.otherContact)}</small>`);
    contactCell = parts.join("<br>") || "<span class='muted'>—</span>";
  }

  return `<tr>
    <td><span class="badge">${esc(l.currentBuilding||"—")}</span></td>
    <td class="muted">${esc(l.housingGender||"—")}</td>
    <td class="muted">
      ${esc(l.occupancy||"—")}
      ${l.bringingRoommate ? `<br><span class="badge gold">+Roommate</span>` : ""}
    </td>
    <td>
      <div>${esc(l.pitch||"—")}</div>
      ${l.otherDetails
        ? `<div style="font-size:.8rem;color:var(--muted);font-style:italic;margin-top:4px">${esc(l.otherDetails)}</div>`
        : ""}
    </td>
    <td class="muted" style="font-size:.82rem;min-width:150px">
      <div><b>Gender:</b> ${esc(wg)}</div>
      <div><b>Occ.:</b> ${esc(wo)}</div>
      <div><b>Bldgs:</b> ${esc(wb)}</div>
    </td>
    <td style="min-width:140px">${contactCell}</td>
    <td class="muted">${date}</td>
  </tr>`;
}

// ── Fill Form (edit mode) ──────────────────────────────────────
function fillForm(listing, contact) {
  el("f-gender").value    = listing.housingGender   || "";
  el("f-building").value  = listing.currentBuilding || "";
  el("f-occupancy").value = listing.occupancy       || "";

  document.querySelectorAll("[name='f-roommate']").forEach(r => {
    r.checked = r.value === String(listing.bringingRoommate);
  });

  el("f-pitch").value   = listing.pitch        || "";
  el("pitch-count").textContent   = (listing.pitch  || "").length;
  el("f-details").value = listing.otherDetails || "";
  el("details-count").textContent = (listing.otherDetails || "").length;

  document.querySelectorAll("[name='wanted-gender']").forEach(cb => {
    cb.checked = (listing.wantedGenders    || []).includes(cb.value);
  });
  document.querySelectorAll("[name='wanted-building']").forEach(cb => {
    cb.checked = (listing.wantedBuildings  || []).includes(cb.value);
  });
  document.querySelectorAll("[name='wanted-occupancy']").forEach(cb => {
    cb.checked = (listing.wantedOccupancies|| []).includes(cb.value);
  });

  el("f-reddit").value = contact.redditUsername || "";
  el("f-phone").value  = contact.phone         || "";
  el("f-other").value  = contact.otherContact  || "";
}

// ── Reset Form ─────────────────────────────────────────────────
function resetForm() {
  el("listing-form")?.reset();
  document.querySelectorAll("#listing-form input[type='checkbox'], #listing-form input[type='radio']")
    .forEach(i => i.checked = false);
  el("pitch-count").textContent   = "0";
  el("details-count").textContent = "0";
  el("form-title").textContent    = "Submit Your Swap Listing";
  el("form-subtitle").textContent = "Your contact info will only be visible to signed-in BU students.";
  el("submit-btn").textContent    = "Submit Listing";
  show(el("f-email-wrap"));
  hide(el("f-email-display"));
  hide(el("delete-btn"));
  setErr("form-error", "");
  setMsg("submit-success", "");
}

// ── Form Submit ────────────────────────────────────────────────
async function handleSubmit(e) {
  if (!currentUser) {
  return setErr("form-error", "Please sign in with your BU email first.");
}
  e.preventDefault();
  setErr("form-error", "");
  setMsg("submit-success", "");

  // Determine email
  let email = "";
  if (currentUser) {
    email = currentUser.email;
  } else {
    email = (el("f-email")?.value || "").trim().toLowerCase();
    if (!email)                     return setErr("form-error", "Enter your BU email.");
    if (!email.endsWith("@bu.edu")) return setErr("form-error", "Must be a @bu.edu email address.");
  }

  // Collect form values
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

  // Validate
  if (!housingGender)            return setErr("form-error","Select your housing assignment gender.");
  if (!currentBuilding)          return setErr("form-error","Select your current building.");
  if (!occupancy)                return setErr("form-error","Select your room occupancy.");
  if (!roommateEl)               return setErr("form-error","Indicate whether you're bringing a roommate.");
  if (!pitch)                    return setErr("form-error","Add a pitch for your room.");
  if (!wantedGenders.length)     return setErr("form-error","Select at least one gender housing preference.");
  if (!wantedBuildings.length)   return setErr("form-error","Select at least one building you'd consider.");
  if (!wantedOccupancies.length) return setErr("form-error","Select at least one occupancy you'd consider.");
  if (!reddit && !phone && !other) return setErr("form-error","Add at least one contact method.");

  const btn = el("submit-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const docId      = emailToDocId(email);
  const listingRef = doc(db, "listings", docId);
  const contactRef = doc(db, "contacts",  docId);

  try {
    const existingSnap  = await getDoc(listingRef);
    const alreadyExists = existingSnap.exists();

    // Block unauthenticated users from overwriting existing listings
    if (!currentUser && alreadyExists) {
      setErr("form-error", "A listing with this email already exists. Sign in with your BU email to edit it.");
      btn.disabled = false;
      btn.textContent = "Submit Listing";
      return;
    }

    const now = serverTimestamp();
    const listingData = {
      email, housingGender, currentBuilding, occupancy,
      bringingRoommate: roommateEl.value === "true",
      pitch, otherDetails,
      wantedGenders, wantedBuildings, wantedOccupancies,
      updatedAt: now,
      ...(!alreadyExists && { submittedAt: now }),
    };
    const contactData = {
      email,
      redditUsername: reddit,
      phone,
      otherContact: other,
      updatedAt: now,
    };

    const batch = writeBatch(db);
    alreadyExists
      ? batch.update(listingRef, listingData)
      : batch.set(listingRef, listingData);
    batch.set(contactRef, contactData, { merge: true });
    await batch.commit();

    if (currentUser) {
      hasListing = true;
      el("form-title").textContent    = "Update Your Listing";
      el("form-subtitle").textContent = "Your listing is live — update or remove it below.";
      el("submit-btn").textContent    = "Update Listing";
      show(el("delete-btn"));
      await refreshContacts();
      renderTable();
      setMsg("submit-success", "✅ Listing updated!");
    } else {
      // Reset for next person
      el("listing-form").reset();
      document.querySelectorAll("#listing-form input[type='checkbox'], #listing-form input[type='radio']")
        .forEach(i => i.checked = false);
      el("pitch-count").textContent   = "0";
      el("details-count").textContent = "0";

      setMsg("submit-success",
        `🎉 Listing submitted! Want to edit it later?
         <button id="post-signin-btn" class="btn-inline" style="margin-left:8px">Sign In →</button>`
      );
      el("post-signin-btn")?.addEventListener("click", openModal);
    }

  } catch (err) {
    console.error("Submit error:", err);
    setErr("form-error", `Save failed: ${err.code || err.message} — check your Firestore rules.`);
  } finally {
    btn.disabled = false;
    btn.textContent = (currentUser && hasListing) ? "Update Listing" : "Submit Listing";
  }
}

// ── Delete Listing ─────────────────────────────────────────────
async function handleDelete() {
  if (!currentUser) return;
  if (!confirm("Remove your listing? You'll no longer appear in the database.")) return;

  const docId = emailToDocId(currentUser.email);

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "listings", docId));
    batch.delete(doc(db, "contacts",  docId));
    await batch.commit();

    hasListing  = false;
    contactsMap = {};
    allListings = allListings.filter(l => l.id !== docId);

    renderTable();
    resetForm();

    // Still signed in — keep email display
    hide(el("f-email-wrap"));
    show(el("f-email-display"));
    if (el("f-email-display")) el("f-email-display").textContent = `✉️ ${currentUser.email}`;
    hide(el("edit-notice")); // still signed in, no need to sign in again

    setMsg("submit-success", "Your listing has been removed.");

  } catch (err) {
    console.error("Delete error:", err);
    alert("Failed to delete. Please try again.");
  }
}