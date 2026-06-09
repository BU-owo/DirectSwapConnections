/**
 * Application Constants
 * Defines BU housing-related constants used throughout the app for filtering, validation, and form rendering.
 */

/**
 * List of all BU residence halls by name.
 * Used for building selection dropdowns and filtering results.
 * @type {string[]}
 */
export const BUILDINGS = [
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

/**
 * Room type categories - describes the housing style/structure.
 * @type {string[]}
 */
export const ROOM_TYPES = ["Dorm", "Dorm Suite", "Apartment Suite", "Apartment"];

/**
 * Occupancy sizes - number of people in the room.
 * @type {string[]}
 */
export const OCCUPANCIES = ["Single", "Double", "Triple", "Quad", "Studio"];

/**
 * Gender housing assignment categories.
 * Used to enforce gender-specific housing matching rules.
 * @type {string[]}
 */
export const GENDERS = ["Male", "Female", "Gender Neutral"];
