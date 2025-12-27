// lib/oauth/redirect.ts
export function getLinkedInRedirectUri() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  return `${base}/auth/linkedin-callback`;
}
