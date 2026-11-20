/**
 * App Context - Global Application State Management
 * Centralizes Firebase authentication, real-time listings, and contact information.
 * Provides hooks for components to access and manage app state and Firestore operations.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, db, provider, firebaseConfigError } from "../lib/firebase";

// Create context for app-wide state
const AppContext = createContext(null);

/**
 * AppProvider Component - Wraps entire app with context
 * Manages Firebase auth state, listings listener, and contact data.
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap
 */
export function AppProvider({ children }) {
  // Current authenticated user or null if logged out
  const [user, setUser] = useState(null);
  // Flag indicating auth state has been determined (initial load complete)
  const [authReady, setAuthReady] = useState(false);
  // All listings from Firestore, updated in real-time
  const [listings, setListings] = useState([]);
  // Map of user ID to contact information for privacy-controlled access
  const [contactsMap, setContactsMap] = useState({});

  // ─── Auth State Listener ──────────────────────────────────────────────────────

  /**
   * Watch Firebase authentication state and update local user state.
   * Runs on component mount to check if user is already signed in.
   */
  useEffect(() => {
    // Exit early if Firebase auth is not initialized
    if (!auth) {
      setAuthReady(true);
      return () => {};
    }

    // Set up listener for auth state changes (login/logout)
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      // Update user state - will be null if signed out
      setUser(nextUser);
      // Mark that initial auth check is complete
      setAuthReady(true);
    });

    // Clean up listener on component unmount
    return () => unsub();
  }, []);

  // ─── Real-Time Listings Listener ──────────────────────────────────────────────

  /**
   * Stream all listings from Firestore in real-time when user is authenticated.
   * Only fetches listings for authenticated users to respect privacy settings.
   */
  useEffect(() => {
    // Listings are BU-only (enforced by Firestore rules); don't subscribe
    // until signed in, and re-subscribe after sign-in.
    if (!db || !user) {
      setListings([]);
      return () => {};
    }

    // Create query to get all listings sorted by submission date (newest first)
    const listingsQuery = query(collection(db, "listings"), orderBy("submittedAt", "desc"));

    // Set up real-time listener for changes to listings
    const unsub = onSnapshot(
      listingsQuery,
      // Success callback - called when data changes
      (snapshot) => {
        // Map Firestore docs to objects with id field
        const nextListings = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
        // Update state with new listings
        setListings(nextListings);
      },
      // Error callback - called if query fails
      (error) => {
        // Log error but don't crash app
        console.error("Failed to stream listings", error);
      }
    );

    // Clean up listener on component unmount
    return () => unsub();
  }, [user]);

  // ─── Contact Information Loader ───────────────────────────────────────────────

  /**
   * Load ONLY the signed-in user's own contact record (for prefilling the form).
   * Other users' contacts are fetched one at a time via getContact(), which the
   * Firestore rules restrict to swap participants. No bulk reads.
   */
  useEffect(() => {
    if (!db || !user) {
      setContactsMap({});
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "contacts", user.uid))
      .then((snap) => {
        if (!cancelled) setContactsMap(snap.exists() ? { [user.uid]: snap.data() } : {});
      })
      .catch((error) => {
        console.error("Failed to load own contact", error);
        if (!cancelled) setContactsMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  /**
   * Fetch a single user's contact record. Rejects (permission-denied) unless the
   * caller has their own listing.
   */
  async function getContact(uid) {
    if (!db || !user) throw new Error("You must be signed in.");
    if (contactsMap[uid]) return contactsMap[uid];
    const snap = await getDoc(doc(db, "contacts", uid));
    const data = snap.exists() ? snap.data() : {};
    setContactsMap((prev) => ({ ...prev, [uid]: data }));
    return data;
  }

  // ─── Derived State - Current User's Listing ────────────────────────────────────

  /**
   * Memoized selector to find current user's listing from listings array.
   * Prevents unnecessary recalculations when listings don't change.
   */
  const myListing = useMemo(() => {
    // Return null if not signed in
    if (!user) return null;
    // Find listing matching current user's UID, return null if not found
    return listings.find((item) => item.id === user.uid) || null;
  }, [listings, user]);

  // ─── Authentication Functions ────────────────────────────────────────────────

  /**
   * Sign in user with Google OAuth and validate BU email domain.
   * @throws {Error} If Firebase not initialized or email is not @bu.edu
   */
  async function signInWithGoogle() {
    // Validate Firebase is initialized
    if (!auth || !provider) {
      throw new Error(firebaseConfigError || "Firebase is not initialized.");
    }

    // Show Google sign-in popup
    const result = await signInWithPopup(auth, provider);

    // Verify user has BU email
    if (!result.user.email?.endsWith("@bu.edu")) {
      // Sign out immediately if not BU student
      await signOut(auth);
      throw new Error(`You signed in as ${result.user.email}. Please use your @bu.edu account.`);
    }
  }

  /**
   * Sign out current user via Firebase
   */
  async function signOutUser() {
    // Skip if Firebase auth not initialized
    if (!auth) return;
    // Sign user out
    await signOut(auth);
  }

  // ─── Listing Management Functions ──────────────────────────────────────────────

  /**
   * Save a new or updated listing to Firestore along with contact info.
   * Uses batch operation to ensure both documents are saved atomically.
   * @param {Object} listingPayload - Listing data to save (layout, pitch, preferences, etc.)
   * @param {Object} contactPayload - Contact info (email, phone, reddit, other)
   * @throws {Error} If user not signed in or Firebase not initialized
   */
  async function saveListing(listingPayload, contactPayload) {
    // Validate user is signed in and Firebase is initialized
    if (!db || !user) throw new Error(firebaseConfigError || "You must be signed in.");

    // Determine if this is a new listing or an update
    const isNew = !myListing;

    // References to documents in Firestore
    const listingRef = doc(db, "listings", user.uid);
    const contactRef = doc(db, "contacts", user.uid);

    // Prepare listing data with user email and timestamps
    const listingData = {
      // Spread all provided listing fields
      ...listingPayload,
      // Timestamp of last modification (server time for accuracy)
      updatedAt: serverTimestamp(),
      // Only set submission timestamp for new listings
      ...(isNew ? { submittedAt: serverTimestamp() } : {}),
    };

    // Create batch operation to save both listing and contact atomically
    const batch = writeBatch(db);

    // For new listings, use set to create document
    if (isNew) {
      batch.set(listingRef, listingData);
    } else {
      // For updates, use set with merge to preserve unmapped fields
      // Strip the legacy `email` field (emails now live only in /contacts).
      batch.set(listingRef, { ...listingData, email: deleteField() }, { merge: true });
    }

    // Save contact info with merge to preserve unmapped fields
    batch.set(
      contactRef,
      {
        // Always include user's email for sorting/verification
        email: user.email,
        // Spread all contact fields (phone, reddit, other)
        ...contactPayload,
        // Timestamp of contact info last update
        updatedAt: serverTimestamp(),
      },
      // Use merge: true to not overwrite other contact fields
      { merge: true }
    );

    // Execute batch operation atomically
    await batch.commit();

    // Update local contacts map to reflect changes immediately
    setContactsMap((prev) => ({
      // Preserve other contacts
      ...prev,
      // Update/add current user's contact info
      [user.uid]: {
        email: user.email,
        ...contactPayload,
      },
    }));
  }

  /**
   * Delete current user's listing and contact information from Firestore.
   */
  async function deleteMyListing() {
    // Skip if user not signed in or Firebase not initialized
    if (!db || !user) return;

    // Delete both listing and contact documents in parallel
    await Promise.all([
      deleteDoc(doc(db, "listings", user.uid)),
      deleteDoc(doc(db, "contacts", user.uid)),
    ]);

    // Update local contacts map to remove user's entry
    setContactsMap((prev) => {
      // Clone previous map
      const next = { ...prev };
      // Delete current user's contact entry
      delete next[user.uid];
      return next;
    });
  }

  // ─── Context Value ────────────────────────────────────────────────────────────

  /**
   * Value object passed to all consumers of this context
   */
  const value = {
    // Current authenticated user or null
    user,
    // Whether initial auth check has completed
    authReady,
    // Firebase configuration error (if any)
    firebaseConfigError,
    // All listings from Firestore
    listings,
    // Current user's own listing (derived, memoized)
    myListing,
    // Map of contact info keyed by user ID
    contactsMap,
    // Authentication function
    signInWithGoogle,
    // Sign out function
    signOutUser,
    // Listing save function
    saveListing,
    // Listing delete function
    deleteMyListing,
    // Fetch one other user's contact (rules-gated)
    getContact,
  };

  // Provide context value to all children
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * Hook to access app context from any component.
 * Must be used inside AppProvider.
 * @returns {Object} App context value with user, listings, and functions
 * @throws {Error} If used outside of AppProvider
 */
export function useAppContext() {
  const ctx = useContext(AppContext);
  // Validate hook is used within provider
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}
