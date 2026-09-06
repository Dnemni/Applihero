import { NextRequest } from "next/server";

export function matchesCronAuthorization(authorization: string | null, primary?: string, previous?: string) {
  if (!authorization) return false;
  return [primary, previous].some(secret => Boolean(secret && authorization === `Bearer ${secret}`));
}

export function hasCronAuthorization(request: NextRequest) {
  return matchesCronAuthorization(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
    process.env.CRON_SECRET_PREVIOUS,
  );
}
