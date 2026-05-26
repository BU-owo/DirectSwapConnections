/**
 * DOM Utility Functions
 * Low-level helper functions for common DOM operations like element selection, visibility control, and text escaping.
 */

/**
 * Get DOM element by ID.
 * @param {string} id - Element ID to query
 * @returns {HTMLElement|null} The element or null if not found
 */
export const $ = (id) => document.getElementById(id);

/**
 * Show element by removing "hidden" CSS class.
 * @param {HTMLElement|null|undefined} element - Element to show
 */
export const show = (element) => element?.classList.remove("hidden");

/**
 * Hide element by adding "hidden" CSS class.
 * @param {HTMLElement|null|undefined} element - Element to hide
 */
export const hide = (element) => element?.classList.add("hidden");

/**
 * Get values of all checked checkboxes with a given name attribute.
 * Used for multi-select form inputs like gender/campus preferences.
 * @param {string} name - Name attribute of checkboxes
 * @returns {string[]} Array of values from checked checkboxes
 */
export const getChecked = (name) =>
  [...document.querySelectorAll(`[name="${name}"]:checked`)].map((checkbox) => checkbox.value);

/**
 * HTML escape a value to prevent XSS attacks.
 * Replaces special HTML characters with their entity equivalents.
 * @param {*} value - Value to escape (converted to string)
 * @returns {string} HTML-escaped string
 */
export function esc(value) {
  // Convert to string, defaulting to empty string for null/undefined
  return String(value ?? "")
    // Ampersand must be escaped first to avoid double-escaping
    .replace(/&/g, "&amp;")
    // Escape less-than sign to prevent tag injection
    .replace(/</g, "&lt;")
    // Escape greater-than sign to close any injected tags
    .replace(/>/g, "&gt;")
    // Escape quotes to prevent attribute injection
    .replace(/\"/g, "&quot;");
}

/**
 * Set error message text and control visibility.
 * Hides error element if message is empty, shows it otherwise.
 * @param {string} id - Element ID to update
 * @param {string} message - Error message text (or empty to hide)
 */
export function setErr(id, message) {
  // Get the error message container element
  const element = $(id);
  // Exit early if element doesn't exist
  if (!element) return;
  // Set the text content of the error message
  element.textContent = message;
  // Show if message exists, hide if empty
  message ? show(element) : hide(element);
}

/**
 * Set HTML content and control visibility.
 * Similar to setErr but accepts HTML (use esc() when rendering user input).
 * @param {string} id - Element ID to update
 * @param {string} html - HTML string to render
 */
export function setMsg(id, html) {
  // Get the message container element
  const element = $(id);
  // Exit early if element doesn't exist
  if (!element) return;
  // Set the inner HTML of the message container
  element.innerHTML = html;
  // Show if HTML exists, hide if empty
  html ? show(element) : hide(element);
}
