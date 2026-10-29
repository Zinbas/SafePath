/**
 * Application API configuration helper.
 * Manages base URL resolution and environment security checks.
 */

/**
 * Returns the resolved API base URL.
 * Reads `VITE_API_BASE_URL` if defined.
 * In production mode, warns if an insecure HTTP endpoint is used.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!envUrl) {
    // Relative path for local dev proxy (or same-origin hosting)
    return '';
  }

  // Strip trailing slashes
  const cleanUrl = envUrl.replace(/\/+$/, '');

  // In production, ensure HTTPS unless connecting to localhost
  if (import.meta.env.PROD) {
    const isLocalhost = cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1');
    if (!isLocalhost && cleanUrl.startsWith('http://')) {
      console.warn(
        `[SafePath Security] Production API base URL "${cleanUrl}" uses unencrypted HTTP. HTTPS is strongly recommended.`
      );
    }
  }

  return cleanUrl;
}
