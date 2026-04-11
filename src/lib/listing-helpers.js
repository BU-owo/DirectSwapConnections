import { parseLayout } from "../../js/housing-data.js";

export const LARGE_STYLE_RESIDENCES_GROUP = "Large Traditional-Style Residences";

const PROFANITY_PATTERN = /\b(fuck|fucking|shit|bitch|asshole|dick|bastard|whore|slut|cunt|motherfucker|piss)\b/gi;

export function censorProfanity(value) {
  return String(value ?? "").replace(PROFANITY_PATTERN, (match) => "*".repeat(match.length));
}

export function toMs(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function buildListingPayload(formValues, selectedBuilding) {
  const { roomType, occupancy } = parseLayout(formValues.layout);

  return {
    housingGender: formValues.housingGender,
    currentBuilding: selectedBuilding.name,
    currentCampusGroup: formValues.currentCampusGroup,
    currentLargeResidenceArea:
      formValues.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP
        ? formValues.currentLargeResidenceArea
        : "",
    currentAddress: formValues.currentAddress,
    layout: formValues.layout,
    roomType,
    occupancy,
    bringingRoommate: formValues.bringingRoommate === "true",
    laundryInBuilding: formValues.laundryInBuilding === "true",
    totalPeople: formValues.bringingRoommate === "true" ? Number(formValues.totalPeople) : null,
    pitch: censorProfanity(formValues.pitch.trim()),
    otherDetails: censorProfanity(formValues.otherDetails.trim()),
    wantedGenders: formValues.wantedGenders,
    wantedCampusGroups: formValues.wantedCampusGroups,
    wantedLargeResidenceAreas: formValues.wantedLargeResidenceAreas,
    wantedLargeResidenceBuildings: formValues.wantedLargeResidenceBuildings,
    wantedLayoutStyles: formValues.wantedLayoutStyles,
  };
}

export function buildContactPayload(formValues) {
  return {
    redditUsername: censorProfanity(formValues.redditUsername.trim()),
    phone: formValues.phone.trim(),
    otherContact: censorProfanity(formValues.otherContact.trim()),
  };
}

export function allowedWantedGenders(housingGender) {
  const byGender = {
    Male: new Set(["Male", "Gender Neutral"]),
    Female: new Set(["Female", "Gender Neutral"]),
    "Gender Neutral": new Set(["Male", "Female", "Gender Neutral"]),
  };
  return byGender[housingGender] || new Set(["Male", "Female", "Gender Neutral"]);
}
