import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/client";

export async function requireApiUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiAuthError("Authentication required", 401);

  const client = getServerSupabase();
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new ApiAuthError("Invalid or expired session", 401);
  return user;
}

export class ApiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

