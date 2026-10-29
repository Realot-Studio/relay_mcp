// Android APK build service settings. This is the ONE place to edit.
//
// To rotate the key: replace APK_API_KEY below (or set
// window.REALOT_APK_API_KEY before the editor loads) and redeploy.
//
// NOTE: this is a static editor, so the key is visible to anyone who opens
// the site's files. Treat it as revocable and disable it on the server if
// it leaks.

/** Build service base URL (no trailing slash needed). */
export const APK_SERVICE_URL = "https://apk--build-server.replit.app";

/** Key sent as the X-Api-Key header on every build request. */
const DEFAULT_APK_API_KEY = "zk_live_CgVMJ9dp1dBVDrAGL93yBMLVZlHZm0ty";

export const APK_API_KEY =
  (typeof window !== "undefined" && typeof window.REALOT_APK_API_KEY === "string" && window.REALOT_APK_API_KEY.trim()) ||
  DEFAULT_APK_API_KEY;

/** Per-browser APK export allowance: this many exports in any rolling window. */
export const APK_EXPORT_LIMIT = 3;
export const APK_EXPORT_WINDOW_DAYS = 14;
