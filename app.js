// ── Config ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAo8yMTgXG5itJnbWsIl8WW_YGzK_xF_ZI",
  authDomain: "bu-direct-swap.firebaseapp.com",
  projectId: "bu-direct-swap",
  storageBucket: "bu-direct-swap.firebasestorage.app",
  messagingSenderId: "353680083539",
  appId: "1:353680083539:web:ab313dc71b39a7c74bd4a6",
};

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, writeBatch, getDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: "bu.edu" });

// ── Data ───────────────────────────────────────────────────────
const BUILDINGS = [
  "Warren Towers",
  "West Campus (Claflin, Rich, or Sleeper Hall)",
  "The Towers",
  "610 Beacon St (formerly Myles Standish)",
  "Kilachand Hall",
  "Danielsen Hall",
  "1019 Comm Ave",
  "HoJo (575 Comm Ave)",
  "Bay State Brownstone",
  "East & Central Campus Brownstone",
  "South Campus Brownstone",
  "East Campus / Bay State Apartment",
  "South Campus Apartment",
  "StuVi 1",
  "StuVi 2",
  "Fenway Campus Center",
  "Fenway Riverway House",
  "Fenway Pilgrim House",
  "Fenway Longwood House",
];
const ROOM_TYPES  = ["Dorm", "Dorm Suite", "Apartment Suite", "Apartment"];
const OCCUPANCIES = ["Single","Double","Triple","Quad","Studio","1-Bedroom","2-Bedroom","3-Bedroom","4+ Bedrooms"];
const GENDERS     = ["Male", "Female", "Gender Neutral"];

// ── State ──────────────────────────────────────────────────────
let currentUser   = null;
let hasListing    = false;
let myListing     = null;        // ← ADD THIS LINE
let allListings   = [];
let contactsMap   = {};
let unsubListings = null;
let searchTimer   = null;

// ── Helpers ────────────────────────────────────────────────────
const $    = id => document.getElementById(id);
const show = e  => e?.classList.remove("hidden");
const hide = e  => e?.classList.add("hidden");
const getChecked = name =>
  [...document.querySelectorAll(`[name="${name}"]:checked`)].map(cb => cb.value);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function setErr(id, msg) { const e=$(id); if(!e)return; e.textContent=msg; msg?show(e):hide(e); }
function setMsg(id, html){ const e=$(id); if(!e)return; e.innerHTML=html;  html?show(e):hide(e); }

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  populateOptions();
  bindEvents();
  startListingsListener();

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (user) {
      // Nav
      const av = $("nav-avatar");
      if (av) { av.src = user.photoURL||""; user.photoURL?show(av):hide(av); }
      const ne = $("nav-email"); if(ne) ne.textContent = user.email;
      hide($("state-out")); show($("state-in"));

      // Submit panel
      hide($("submit-gate")); show($("submit-form"));
      const pa = $("pill-avatar"); if(pa) pa.src = user.photoURL||"";
      const pe = $("pill-email");  if(pe) pe.textContent = user.email;

      // Hide contact notice
      hide($("notice-contact"));

      await loadUserListing();
      await refreshContacts();
      renderTable();
      renderMyPreview();

    } else {
      show($("state-out")); hide($("state-in"));
      show($("submit-gate")); hide($("submit-form"));
      show($("notice-contact"));
      hide($("my-preview"));
      hasListing  = false;
      contactsMap = {};
      resetForm();
      renderTable();
    }
  });
});

// ── Populate options ───────────────────────────────────────────
function populateOptions() {
  appendOpts("fi-building", BUILDINGS);
  appendOpts("fi-occ",      OCCUPANCIES);
  appendOpts("f-building",  BUILDINGS);
  appendOpts("f-occ",       OCCUPANCIES);
  appendChecks("w-gender",   "wg", GENDERS);
  appendChecks("w-type",     "wt", ROOM_TYPES);
  appendChecks("w-occ",      "wo", OCCUPANCIES);
  appendChecks("w-building", "wb", BUILDINGS);
}
function appendOpts(selId, items) {
  const s=$(selId); if(!s)return;
  items.forEach(v=>{ const o=document.createElement("option"); o.value=o.textContent=v; s.appendChild(o); });
}
function appendChecks(wrapId, name, items) {
  const w=$(wrapId); if(!w)return;
  items.forEach(v=>{
    const lbl=document.createElement("label");
    lbl.className="check-opt";
    lbl.innerHTML=`<input type="checkbox" name="${name}" value="${esc(v)}" /> ${esc(v)}`;
    w.appendChild(lbl);
  });
}

// ── Events ─────────────────────────────────────────────────────
function bindEvents() {
  // Panel nav
  document.querySelectorAll("[data-panel]").forEach(btn =>
    btn.addEventListener("click", () => showPanel(btn.dataset.panel))
  );
  // Sign in triggers
  document.querySelectorAll("[data-action='signin']").forEach(btn =>
    btn.addEventListener("click", doSignIn)
  );
  $("btn-signin-nav")?.addEventListener("click",  doSignIn);
  $("btn-signout")?.addEventListener("click",     () => signOut(auth));
  $("preview-edit-btn")?.addEventListener("click",() => showPanel("submit"));

  // Search — debounced 280ms
  $("fi-search")?.addEventListener("input", () => {
    const val = $("fi-search").value;
    // Show/hide X button
    val.trim() ? show($("fi-search-clear")) : hide($("fi-search-clear"));
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTable, 280);
  });
  $("fi-search-clear")?.addEventListener("click", () => {
    $("fi-search").value = "";
    hide($("fi-search-clear"));
    renderTable();
  });

  // Filter selects
  ["fi-gender","fi-building","fi-type","fi-occ","fi-roommate","fi-sort"].forEach(id =>
    $(id)?.addEventListener("change", () => { updateFilterActive(id); renderTable(); })
  );

  // Clear all
  $("btn-clear")?.addEventListener("click", clearFilters);

  // Form
  $("the-form")?.addEventListener("submit",  handleSubmit);
  $("btn-delete")?.addEventListener("click", handleDelete);

  // Building select/clear all
  $("btn-sel-all")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wb']").forEach(cb => cb.checked=true)
  );
  $("btn-clr-all")?.addEventListener("click", () =>
    document.querySelectorAll("[name='wb']").forEach(cb => cb.checked=false)
  );

  // Char counters
  $("f-pitch")?.addEventListener("input",   () => $("ct-pitch").textContent   = $("f-pitch").value.length);
  $("f-details")?.addEventListener("input", () => $("ct-details").textContent = $("f-details").value.length);
}

// ── Panel switching ────────────────────────────────────────────
function showPanel(name) {
  $("panel-browse")?.classList.toggle("hidden", name!=="browse");
  $("panel-submit")?.classList.toggle("hidden", name!=="submit");
  document.querySelectorAll(".nav-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.panel===name)
  );
}

// ── Filter active indicator ────────────────────────────────────
function updateFilterActive(id) {
  const el = $(id); if(!el) return;
  el.classList.toggle("f-active", el.value !== "" && el.value !== "newest");
}

function updateActiveBadge() {
  const filterIds = ["fi-gender","fi-building","fi-type","fi-occ","fi-roommate"];
  const searchVal = ($("fi-search")?.value||"").trim();
  const activeCount = filterIds.filter(id => $(id)?.value).length + (searchVal ? 1 : 0);
  const badge = $("active-badge");
  const countEl = $("active-count");
  if (!badge || !countEl) return;
  if (activeCount > 0) {
    countEl.textContent = `${activeCount} filter${activeCount>1?"s":""} active`;
    show(badge);
  } else {
    hide(badge);
  }
}

function clearFilters() {
  ["fi-gender","fi-building","fi-type","fi-occ","fi-roommate"].forEach(id => {
    const e=$(id); if(e){ e.value=""; e.classList.remove("f-active"); }
  });
  const s=$("fi-search"); if(s) s.value="";
  hide($("fi-search-clear"));
  const so=$("fi-sort"); if(so) so.value="newest";
  hide($("active-badge"));
  renderTable();
}

// ── Sign-In ─────────────────────────────────────────────────────
async function doSignIn() {
  setErr("gate-error","");
  try {
    const result = await signInWithPopup(auth, provider);
    if (!result.user.email?.endsWith("@bu.edu")) {
      await signOut(auth);
      setErr("gate-error", `You signed in as ${result.user.email}. Please use your @bu.edu account.`);
      show($("gate-error"));
      return;
    }
    showPanel("submit");
  } catch(err) {
    if (["auth/popup-closed-by-user","auth/cancelled-popup-request"].includes(err.code)) return;
    const msgs = {
      "auth/popup-blocked":       "Your browser blocked the sign-in popup — allow popups and try again.",
      "auth/operation-not-allowed":"Google sign-in isn't enabled. Firebase Console → Authentication → Sign-in method → Google → Enable.",
      "auth/unauthorized-domain": `Domain not authorized. Firebase Console → Authentication → Settings → Authorized domains → add "${location.hostname}".`,
    };
    setErr("gate-error", msgs[err.code]||`Sign-in failed (${err.code}): ${err.message}`);
    show($("gate-error"));
  }
}

// ── Listings listener ──────────────────────────────────────────
function startListingsListener() {
  if (unsubListings) unsubListings();
  const q = query(collection(db,"listings"), orderBy("submittedAt","desc"));
  unsubListings = onSnapshot(q,
    snap => {
      allListings = snap.docs.map(d=>({id:d.id,...d.data()}));
      renderTable();
      renderMyPreview();
    },
    err => {
      console.error("Listings error:", err);
      const tb=$("listings-tbody");
      if(tb) tb.innerHTML=`<tr><td colspan="8" style="padding:2rem;text-align:center;color:#dc2626">
        Error loading listings — check Firestore rules.<br><small>${esc(err.message)}</small>
      </td></tr>`;
    }
  );
}

// ── Load user's own listing ────────────────────────────────────
async function loadUserListing() {
  if (!currentUser) return;
  const snap = await getDoc(doc(db,"listings",currentUser.uid));
  hasListing = snap.exists();
  if (hasListing) {
    const cSnap = await getDoc(doc(db,"contacts",currentUser.uid));
    myListing = snap.data();     // ← ADD THIS LINE
    fillForm(snap.data(), cSnap.exists()?cSnap.data():{});
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent   = "Your listing is live — edit or remove it below.";
    $("btn-submit").textContent = "Update Listing";
    show($("btn-delete"));
  } else {
    $("form-title").textContent = "Submit Your Swap Listing";
    $("form-sub").textContent   = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
    $("btn-submit").textContent = "Submit Listing";
    hide($("btn-delete"));
  }
}

// ── Refresh contacts ───────────────────────────────────────────
async function refreshContacts() {
  if (!currentUser) { contactsMap={}; return; }
  try {
    const snap = await getDocs(collection(db,"contacts"));
    contactsMap = {};
    snap.forEach(d=>{ contactsMap[d.id]=d.data(); });
  } catch(_) { contactsMap={}; }
}

// ── My Listing Preview ─────────────────────────────────────────
function renderMyPreview() {
  const container = $("my-preview");
  const body      = $("my-preview-body");
  if (!container || !body) return;

  if (!currentUser || !hasListing || !myListing) { hide(container); return; }

  const l  = myListing;
  const wg = (l.wantedGenders     ||[]).join(", ")||"—";
  const wt = (l.wantedTypes       ||[]).join(", ")||"—";
  const wo = (l.wantedOccupancies ||[]).join(", ")||"—";
  const wb = (l.wantedBuildings   ||[]).join(", ")||"—";

  body.innerHTML = `
    <div class="preview-col">
      <div class="preview-badges">
        <span class="badge badge-red">${esc(l.currentBuilding||"—")}</span>
        <span class="badge badge-grey">${esc(l.roomType||"—")}</span>
        <span class="badge badge-grey">${esc(l.occupancy||"—")}</span>
        <span class="badge badge-blue">${esc(l.housingGender||"—")}</span>
        ${l.bringingRoommate?`<span class="badge badge-gold">+Roommate</span>`:""}
      </div>
      <div>
        <div class="preview-pitch-label">Your pitch</div>
        <div class="preview-pitch">${esc(l.pitch||"—")}</div>
        ${l.otherDetails
          ?`<div style="font-size:.82rem;color:var(--sub);font-style:italic;margin-top:4px">${esc(l.otherDetails)}</div>`
          :""}
      </div>
    </div>
    <div class="preview-col">
      <div class="preview-looking">
        <div><b>Looking for gender:</b> ${esc(wg)}</div>
        <div><b>Room types:</b> ${esc(wt)}</div>
        <div><b>Occupancies:</b> ${esc(wo)}</div>
        <div><b>Would consider:</b> ${esc(wb)}</div>
      </div>
      <div class="preview-contact-note">
        ✅ Your contact info is visible to signed-in BU students
      </div>
    </div>`;

  show(container);
}

// ── Render table ───────────────────────────────────────────────
function renderTable() {
  const tbody = $("listings-tbody");
  if (!tbody) return;

  const fSearch   = ($("fi-search")?.value||"").trim().toLowerCase();
  const fGender   = $("fi-gender")?.value  ||"";
  const fBuilding = $("fi-building")?.value||"";
  const fType     = $("fi-type")?.value    ||"";
  const fOcc      = $("fi-occ")?.value     ||"";
  const fRoommate = $("fi-roommate")?.value||"";
  const fSort     = $("fi-sort")?.value    ||"newest";

  // Exclude own listing from main table
  const myId = currentUser?.uid;
  let list = allListings.filter(l => l.id !== myId);

  if (fGender)   list = list.filter(l => l.housingGender   === fGender);
  if (fBuilding) list = list.filter(l => l.currentBuilding === fBuilding);
  if (fType)     list = list.filter(l => l.roomType        === fType);
  if (fOcc)      list = list.filter(l => l.occupancy       === fOcc);
  if (fRoommate!=="") list = list.filter(l => String(l.bringingRoommate) === fRoommate);

  // Multi-word search — every word must appear somewhere
  if (fSearch) {
    const terms = fSearch.split(/\s+/).filter(Boolean);
    list = list.filter(l => {
      const blob = [
        l.currentBuilding, l.roomType, l.occupancy, l.housingGender,
        l.pitch, l.otherDetails,
        ...(l.wantedBuildings   ||[]),
        ...(l.wantedTypes       ||[]),
        ...(l.wantedOccupancies ||[]),
        ...(l.wantedGenders     ||[]),
      ].join(" ").toLowerCase();
      return terms.every(term => blob.includes(term));
    });
  }

  if (fSort==="oldest")   list = [...list].reverse();
  if (fSort==="building") list = [...list].sort((a,b)=>(a.currentBuilding||"").localeCompare(b.currentBuilding||""));

  // Update counts + active badge
  const total = allListings.filter(l => l.id !== myId).length;
  const rc = $("result-count");
  if (rc) {
    const anyFilter = fSearch||fGender||fBuilding||fType||fOcc||fRoommate;
    rc.textContent = anyFilter
      ? `Showing ${list.length} of ${total} listings`
      : `${total} listing${total!==1?"s":""}`;
  }
  updateActiveBadge();

  if (!list.length) {
    const anyFilter = fSearch||fGender||fBuilding||fType||fOcc||fRoommate;
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">
      <div class="td-empty-icon">🏠</div>
      <p>${anyFilter
        ? `No listings match your search.<br><button class="clr-link" id="td-clear-btn">Clear all filters →</button>`
        : "No listings yet — be the first to submit!"
      }</p>
    </td></tr>`;
    $("td-clear-btn")?.addEventListener("click", clearFilters);
    return;
  }

  tbody.innerHTML = list.map(buildRow).join("");
  tbody.querySelectorAll(".contact-locked").forEach(el =>
    el.addEventListener("click", () => { showPanel("submit"); doSignIn(); })
  );
}

function buildRow(l) {
  const date = l.submittedAt?.toDate
    ? l.submittedAt.toDate().toLocaleDateString("en-US",{month:"short",day:"numeric"})
    : "—";
  const wg = (l.wantedGenders     ||[]).join(", ")||"—";
  const wt = (l.wantedTypes       ||[]).join(", ")||"—";
  const wo = (l.wantedOccupancies ||[]).join(", ")||"—";
  const wb = (l.wantedBuildings   ||[]).join(", ")||"—";

  let contactCell;
  if (!currentUser) {
    contactCell = `<span class="contact-locked" title="Sign in to view">🔒 Sign in to view</span>`;
  } else {
    const c = contactsMap[l.id]||{};
    const parts = [];
    if (l.email)          parts.push(`<a href="mailto:${esc(l.email)}" class="contact-link">${esc(l.email)}</a>`);
    if (c.redditUsername) parts.push(`<small style="color:var(--sub)">${esc(c.redditUsername)}</small>`);
    if (c.phone)          parts.push(`<small style="color:var(--sub)">${esc(c.phone)}</small>`);
    if (c.otherContact)   parts.push(`<small style="color:var(--sub)">${esc(c.otherContact)}</small>`);
    contactCell = parts.join("<br>")||`<span style="color:#aaa">—</span>`;
  }

  return `<tr>
    <td><span class="badge badge-red">${esc(l.currentBuilding||"—")}</span></td>
    <td class="td-sub">${esc(l.roomType||"—")}</td>
    <td class="td-sub">
      ${esc(l.occupancy||"—")}
      ${l.bringingRoommate?`<br><span class="badge badge-gold" style="margin-top:4px">+Roommate</span>`:""}
    </td>
    <td class="td-sub">${esc(l.housingGender||"—")}</td>
    <td>
      <div style="max-width:240px">${esc(l.pitch||"—")}</div>
      ${l.otherDetails?`<div style="font-size:.8rem;color:var(--sub);font-style:italic;margin-top:4px">${esc(l.otherDetails)}</div>`:""}
    </td>
    <td style="font-size:.82rem;min-width:160px;color:var(--sub)">
      <div><b style="color:var(--text)">Gender:</b> ${esc(wg)}</div>
      <div><b style="color:var(--text)">Type:</b> ${esc(wt)}</div>
      <div><b style="color:var(--text)">Occ.:</b> ${esc(wo)}</div>
      <div style="max-width:180px"><b style="color:var(--text)">Bldgs:</b> ${esc(wb)}</div>
    </td>
    <td style="min-width:140px">${contactCell}</td>
    <td class="td-sub">${date}</td>
  </tr>`;
}

// ── Fill form ──────────────────────────────────────────────────
function fillForm(listing, contact) {
  $("f-gender").value   = listing.housingGender   ||"";
  $("f-building").value = listing.currentBuilding ||"";
  $("f-type").value     = listing.roomType        ||"";
  $("f-occ").value      = listing.occupancy       ||"";

  document.querySelectorAll("[name='f-roommate']").forEach(r =>
    r.checked = r.value === String(listing.bringingRoommate)
  );

  $("f-pitch").value          = listing.pitch        ||"";
  $("ct-pitch").textContent   = (listing.pitch  ||"").length;
  $("f-details").value        = listing.otherDetails ||"";
  $("ct-details").textContent = (listing.otherDetails||"").length;

  document.querySelectorAll("[name='wg']").forEach(cb => cb.checked=(listing.wantedGenders     ||[]).includes(cb.value));
  document.querySelectorAll("[name='wt']").forEach(cb => cb.checked=(listing.wantedTypes       ||[]).includes(cb.value));
  document.querySelectorAll("[name='wo']").forEach(cb => cb.checked=(listing.wantedOccupancies ||[]).includes(cb.value));
  document.querySelectorAll("[name='wb']").forEach(cb => cb.checked=(listing.wantedBuildings   ||[]).includes(cb.value));

  $("f-reddit").value = contact.redditUsername||"";
  $("f-phone").value  = contact.phone         ||"";
  $("f-other").value  = contact.otherContact  ||"";
}

// ── Reset form ─────────────────────────────────────────────────
function resetForm() {
  $("the-form")?.reset();
  document.querySelectorAll("#the-form input[type='checkbox'], #the-form input[type='radio']")
    .forEach(i=>i.checked=false);
  $("ct-pitch").textContent   = "0";
  $("ct-details").textContent = "0";
  $("form-title").textContent = "Submit Your Swap Listing";
  $("form-sub").textContent   = "Your listing is visible to everyone. Contact info only shown to signed-in BU students.";
  $("btn-submit").textContent = "Submit Listing";
  hide($("btn-delete"));
  setErr("form-err","");
  setMsg("success-msg","");
}

// ── Submit ─────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  setErr("form-err",""); setMsg("success-msg","");

  const housingGender     = $("f-gender").value;
  const currentBuilding   = $("f-building").value;
  const roomType          = $("f-type").value;
  const occupancy         = $("f-occ").value;
  const roommateEl        = document.querySelector("[name='f-roommate']:checked");
  const pitch             = $("f-pitch").value.trim();
  const otherDetails      = $("f-details").value.trim();
  const wantedGenders     = getChecked("wg");
  const wantedTypes       = getChecked("wt");
  const wantedOccupancies = getChecked("wo");
  const wantedBuildings   = getChecked("wb");
  const reddit = $("f-reddit").value.trim();
  const phone  = $("f-phone").value.trim();
  const other  = $("f-other").value.trim();

  if (!housingGender)            return setErr("form-err","Select your housing assignment gender.");
  if (!currentBuilding)          return setErr("form-err","Select your current building.");
  if (!roomType)                 return setErr("form-err","Select your room type.");
  if (!occupancy)                return setErr("form-err","Select your room occupancy.");
  if (!roommateEl)               return setErr("form-err","Indicate whether you're bringing a roommate.");
  if (!pitch)                    return setErr("form-err","Describe your room's best features.");
  if (!wantedGenders.length)     return setErr("form-err","Select at least one gender housing preference.");
  if (!wantedTypes.length)       return setErr("form-err","Select at least one room type you'd consider.");
  if (!wantedOccupancies.length) return setErr("form-err","Select at least one occupancy you'd consider.");
  if (!wantedBuildings.length)   return setErr("form-err","Select at least one building you'd consider.");
  if (!reddit && !phone && !other) return setErr("form-err","Add at least one contact method beyond your BU email.");

  const btn = $("btn-submit");
  btn.disabled=true; btn.textContent="Saving…";

  const isNew      = !hasListing;
  const listingRef = doc(db,"listings",currentUser.uid);
  const contactRef = doc(db,"contacts", currentUser.uid);
  const now        = serverTimestamp();

  try {
    const listingData = {
      email: currentUser.email,
      housingGender, currentBuilding, roomType, occupancy,
      bringingRoommate: roommateEl.value==="true",
      pitch, otherDetails,
      wantedGenders, wantedTypes, wantedOccupancies, wantedBuildings,
      updatedAt: now,
      ...(isNew && { submittedAt: now }),
    };

    const batch = writeBatch(db);
    isNew ? batch.set(listingRef, listingData) : batch.update(listingRef, listingData);
    batch.set(contactRef, {
      email: currentUser.email,
      redditUsername: reddit, phone, otherContact: other,
      updatedAt: now,
    }, {merge:true});
    await batch.commit();

    hasListing = true;
    myListing  = listingData;    // ← ADD THIS LINE
    $("form-title").textContent = "Update Your Listing";
    $("form-sub").textContent   = "Your listing is live — edit or remove it below.";
    show($("btn-delete"));

    await refreshContacts();
    renderTable();
    renderMyPreview();

    setMsg("success-msg", isNew
      ? "🎉 Listing submitted! Switch to Browse Listings to see what others see."
      : "✅ Listing updated!"
    );
    // Jump to browse so they can immediately see their preview
    if (isNew) setTimeout(() => showPanel("browse"), 1800);

  } catch(err) {
    console.error("Submit error:", err);
    setErr("form-err",`Save failed (${err.code||err.message}) — check your Firestore rules.`);
  } finally {
    btn.disabled=false;
    btn.textContent = hasListing ? "Update Listing" : "Submit Listing";
  }
}

// ── Delete ─────────────────────────────────────────────────────
async function handleDelete() {
  if (!currentUser) return;
  if (!confirm("Remove your listing? You'll no longer appear in the database.")) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db,"listings",currentUser.uid));
    batch.delete(doc(db,"contacts", currentUser.uid));
    await batch.commit();

    hasListing  = false;
    myListing   = null;          // ← ADD THIS LINE
    contactsMap = {};
    allListings = allListings.filter(l => l.id !== currentUser.uid);
    renderTable();
    renderMyPreview();
    resetForm();
    setMsg("success-msg","Your listing has been removed.");
  } catch(err) {
    console.error("Delete error:", err);
    alert("Failed to delete. Please try again.");
  }
}