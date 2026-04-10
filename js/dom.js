export const $ = (id) => document.getElementById(id);
export const show = (element) => element?.classList.remove("hidden");
export const hide = (element) => element?.classList.add("hidden");

export const getChecked = (name) =>
  [...document.querySelectorAll(`[name="${name}"]:checked`)].map((checkbox) => checkbox.value);

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export function setErr(id, message) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  message ? show(element) : hide(element);
}

export function setMsg(id, html) {
  const element = $(id);
  if (!element) return;
  element.innerHTML = html;
  html ? show(element) : hide(element);
}

// ... existing code ...

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function getChecked(name) {
  return [...document.querySelectorAll(`[name="${name}"]:checked`)].map(cb => cb.value);
}