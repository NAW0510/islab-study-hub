"use client";

/**
 * Copies text to the clipboard and reports whether it worked — never throws.
 * Falls back to a hidden textarea where the Clipboard API is unavailable
 * (plain-http LAN addresses such as 192.168.x.x) or refuses (e.g. the user
 * gesture expired while waiting for the server).
 */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
