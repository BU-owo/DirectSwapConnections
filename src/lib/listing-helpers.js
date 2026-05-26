/**
 * Listing Helpers - Shared Utility Functions
 * Provides normalization, validation, and transformation functions for listing data.
 * Includes profanity filtering, timestamp conversion, gender constraint logic, and payload building.
 */
import { parseLayout } from "../../js/housing-data.js";

/**
 * Constant for Large Traditional-Style Residences campus group
 * Used throughout the app for special handling of named building groups
 * @type {string}
 */
export const LARGE_STYLE_RESIDENCES_GROUP = "Large Traditional-Style Residences";

/**
 * Regex pattern matching common profanities for automatic censoring
 * Flags: gi = global + case-insensitive
 * @type {RegExp}
 */
const PROFANITY_PATTERN = /\b(fuck|fucking|shit|bitch|asshole|dick|bastard|whore|slut|cunt|motherfucker|piss)\b/gi;

/**
 * Censor profanities in text by replacing with equal-length asterisks
 * Provides lightweight client-side moderation for user-submitted content.
 * @param {*} value - Text to censor (converted to string)
 * @returns {string} Text with profanities replaced by asterisks
 */
export function censorProfanity(value) {
  // Convert to string, defaulting to empty for null/undefined
  return String(value ?? "").replace(PROFANITY_PATTERN, (match) => "*".repeat(match.length));
}

/**
 * Convert various timestamp formats to epoch milliseconds for stable sorting
 * Handles Firestore Timestamps, JavaScript Dates, and numeric seconds.
 * @param {*} timestamp - Timestamp in various formats (Firestore Timestamp, Date, number, null)
 * @returns {number} Milliseconds since epoch (0 if invalid/missing)
 */
export function toMs(timestamp) {
  // Return 0 for missing timestamp
  if (!timestamp) return 0;
  // Firestore Timestamp objects have toMillis() method
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  // Firestore Timestamp data structure has seconds field
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  // Convert to Date if not already, then get milliseconds
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  // Return 0 if date is invalid (NaN)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * Transform validated form state into the listing document shape for Firestore storage.
 * Combines form values with building data and applies data transformations (parsing layout, censoring text).
 * @param {Object} formValues - Form field values (layout, pitch, preferences, etc.)
 * @param {Object} selectedBuilding - Building object with name and area
 * @returns {Object} Firestore listing document payload
 */
export function buildListingPayload(formValues, selectedBuilding) {
  // Split layout like "Traditional Double" into separate roomType and occupancy
  const { roomType, occupancy } = parseLayout(formValues.layout);

  // Build and return listing document structure
  return {
    // User's housing assignment gender (Male/Female/Gender Neutral)
    housingGender: formValues.housingGender,
    // Full name of current building
    currentBuilding: selectedBuilding.name,
    // Campus group (e.g., "South Campus Apartments")
    currentCampusGroup: formValues.currentCampusGroup,
    // Area within Large Residences if applicable (e.g., "West Campus")
    currentLargeResidenceArea: selectedBuilding.area || "",
    // Full street address of current building
    currentAddress: formValues.currentAddress,
    // Full layout string like "Traditional Double" - for display
    layout: formValues.layout,
    // Room type extracted from layout - used for filtering
    roomType,
    // Occupancy size extracted from layout - used for filtering
    occupancy,
    // Whether user is bringing an existing roommate
    bringingRoommate: formValues.bringingRoommate === "true",
    // Total number of people in group (only if bringing roommate)
    totalPeople: formValues.bringingRoommate === "true" ? Number(formValues.totalPeople) : null,
    // Marketing pitch describing the room - censored for profanity
    pitch: censorProfanity(formValues.pitch.trim()),
    // Additional details about the room - censored for profanity
    otherDetails: censorProfanity(formValues.otherDetails.trim()),
    // Array of genders user is looking to match with
    wantedGenders: formValues.wantedGenders,
    // Array of campus groups user would consider
    wantedCampusGroups: formValues.wantedCampusGroups,
    // Areas within Large Residences user would consider
    wantedLargeResidenceAreas: formValues.wantedLargeResidenceAreas,
    // Specific buildings within Large Residences user would consider
    wantedLargeResidenceBuildings: formValues.wantedLargeResidenceBuildings,
    // Room layout styles user would accept
    wantedLayoutStyles: formValues.wantedLayoutStyles,
    // Additional preferences text - censored for profanity
    wantedOtherDetails: censorProfanity(formValues.wantedOtherDetails?.trim() || ""),
  };
}

/**
 * Transform form contact fields into Firestore contact document payload.
 * Applies profanity censoring to username/contact fields but not to phone numbers.
 * @param {Object} formValues - Form fields: redditUsername, phone, otherContact
 * @returns {Object} Firestore contact document payload
 */
export function buildContactPayload(formValues) {
  return {
    // Reddit username - censored for profanity
    redditUsername: censorProfanity(formValues.redditUsername.trim()),
    // Phone number - not censored as it's numeric
    phone: formValues.phone.trim(),
    // Other contact method - censored for profanity
    otherContact: censorProfanity(formValues.otherContact.trim()),
  };
}

/**
 * Determine which housing genders a user can select as preferences based on their housing assignment.
 * Enforces matching rules: males/females can only match with same gender or gender-neutral.
 * Gender-neutral users can match with anyone.
 * @param {string} housingGender - User's current housing assignment gender
 * @returns {Set<string>} Set of allowed target genders to select
 */
export function allowedWantedGenders(housingGender) {
  // Define allowed matches for each housing gender
  const byGender = {
    // Males can only match with males or gender-neutral
    Male: new Set(["Male", "Gender Neutral"]),
    // Females can only match with females or gender-neutral
    Female: new Set(["Female", "Gender Neutral"]),
    // Gender-neutral can match with anyone
    "Gender Neutral": new Set(["Male", "Female", "Gender Neutral"]),
  };
  // Return allowed set for this gender, default to allow all if unknown
  return byGender[housingGender] || new Set(["Male", "Female", "Gender Neutral"]);
}
