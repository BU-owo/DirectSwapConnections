/**
 * Application State
 * Global mutable state object shared across the app.
 * Using a plain object instead of a state management library for simplicity.
 */

/**
 * Global application state.
 * @type {Object}
 * @property {Object|null} currentUser - Currently logged-in user object from Firebase (null if logged out)
 * @property {boolean} hasListing - Whether the current user has submitted a housing listing
 * @property {Object|null} myListing - The current user's housing listing data
 * @property {Array} allListings - All housing listings from Firestore (for browse page)
 * @property {Object} contactsMap - Map of user ID to contact information {userId: {email, phone, redditUsername, otherContact}}
 * @property {Function|null} unsubListings - Unsubscribe function for real-time listings listener
 * @property {number|null} searchTimer - Debounce timer ID for search input
 */
export const state = {
  // Current authenticated user - set after successful login
  currentUser: null,
  // Flag indicating whether logged-in user has a listing in database
  hasListing: false,
  // Cached copy of current user's listing data for form pre-filling and display
  myListing: null,
  // All listings from database - updated in real-time via Firestore listener
  allListings: [],
  // Map of contact info keyed by user ID - allows efficient lookup when displaying listings
  contactsMap: {},
  // Reference to unsubscribe function for Firestore listener - needed to prevent duplicate listeners
  unsubListings: null,
  // Debounce timer for search input - cleared and restarted on each keystroke
  searchTimer: null,
};
