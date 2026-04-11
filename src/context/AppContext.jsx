import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
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

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [listings, setListings] = useState([]);
  const [contactsMap, setContactsMap] = useState({});

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return () => {};
    }

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) {
      setListings([]);
      return () => {};
    }

    const listingsQuery = query(collection(db, "listings"), orderBy("submittedAt", "desc"));
    const unsub = onSnapshot(
      listingsQuery,
      (snapshot) => {
        const nextListings = snapshot.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
        setListings(nextListings);
      },
      (error) => {
        console.error("Failed to stream listings", error);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setContactsMap({});
      return;
    }

    let cancelled = false;
    async function loadContacts() {
      try {
        const snapshot = await getDocs(collection(db, "contacts"));
        if (cancelled) return;

        const nextMap = {};
        snapshot.forEach((docRef) => {
          nextMap[docRef.id] = docRef.data();
        });
        setContactsMap(nextMap);
      } catch (error) {
        console.error("Failed to load contacts", error);
        if (!cancelled) setContactsMap({});
      }
    }

    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const myListing = useMemo(() => {
    if (!user) return null;
    return listings.find((item) => item.id === user.uid) || null;
  }, [listings, user]);

  async function signInWithGoogle() {
    if (!auth || !provider) {
      throw new Error(firebaseConfigError || "Firebase is not initialized.");
    }

    const result = await signInWithPopup(auth, provider);
    if (!result.user.email?.endsWith("@bu.edu")) {
      await signOut(auth);
      throw new Error(`You signed in as ${result.user.email}. Please use your @bu.edu account.`);
    }
  }

  async function signOutUser() {
    if (!auth) return;
    await signOut(auth);
  }

  async function saveListing(listingPayload, contactPayload) {
    if (!db || !user) throw new Error(firebaseConfigError || "You must be signed in.");

    const isNew = !myListing;
    const listingRef = doc(db, "listings", user.uid);
    const contactRef = doc(db, "contacts", user.uid);

    const listingData = {
      ...listingPayload,
      email: user.email,
      updatedAt: serverTimestamp(),
      ...(isNew ? { submittedAt: serverTimestamp() } : {}),
    };

    const batch = writeBatch(db);
    if (isNew) {
      batch.set(listingRef, listingData);
    } else {
      batch.set(listingRef, listingData, { merge: true });
    }

    batch.set(
      contactRef,
      {
        email: user.email,
        ...contactPayload,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    setContactsMap((prev) => ({
      ...prev,
      [user.uid]: {
        email: user.email,
        ...contactPayload,
      },
    }));
  }

  async function deleteMyListing() {
    if (!db || !user) return;
    await Promise.all([
      deleteDoc(doc(db, "listings", user.uid)),
      deleteDoc(doc(db, "contacts", user.uid)),
    ]);
    setContactsMap((prev) => {
      const next = { ...prev };
      delete next[user.uid];
      return next;
    });
  }

  const value = {
    user,
    authReady,
    firebaseConfigError,
    listings,
    myListing,
    contactsMap,
    signInWithGoogle,
    signOutUser,
    saveListing,
    deleteMyListing,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
}
