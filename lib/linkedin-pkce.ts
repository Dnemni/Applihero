// lib/linkedin-pkce.ts
function base64UrlEncode(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export function storeLinkedInCodeVerifier(verifier: string) {
  sessionStorage.setItem("linkedin_pkce_verifier", verifier);
}

export function getLinkedInCodeVerifier() {
  return sessionStorage.getItem("linkedin_pkce_verifier");
}

export function clearLinkedInCodeVerifier() {
  sessionStorage.removeItem("linkedin_pkce_verifier");
}
