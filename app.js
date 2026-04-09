// ── Config ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDzi9dDx9wC8CmFgo6Pjb6YIjlcoLxjbyg",
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
  setUiCallbacks({
    onRequireSignIn: doSignIn,
    onFiltersChanged: renderTable,
  });
  bindEvents();
  startListingsListener();

  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;

    if (user) {
      const navAvatar = $("nav-avatar");
      if (navAvatar) {
        navAvatar.src = user.photoURL || "";
        user.photoURL ? show(navAvatar) : hide(navAvatar);
      }

      const navEmail = $("nav-email");
      if (navEmail) navEmail.textContent = user.email;

      hide($("state-out"));
      show($("state-in"));

      hide($("submit-gate"));
      show($("submit-form"));

      const pillAvatar = $("pill-avatar");
      if (pillAvatar) pillAvatar.src = user.photoURL || "";

      const pillEmail = $("pill-email");
      if (pillEmail) pillEmail.textContent = user.email;

      hide($("notice-contact"));

      await loadUserListing();
      await refreshContacts();
      renderTable();
      renderMyPreview();
      return;
    }

    show($("state-out"));
    hide($("state-in"));
    show($("submit-gate"));
    hide($("submit-form"));
    show($("notice-contact"));
    hide($("my-preview"));

    state.hasListing = false;
    state.myListing = null;
    state.contactsMap = {};

    resetForm();
    renderTable();
  });
});
