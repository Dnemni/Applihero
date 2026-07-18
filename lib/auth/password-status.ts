import type { User } from "@supabase/supabase-js";

export const PASSWORD_LOGIN_ENABLED_KEY = "password_login_enabled";
export const PASSWORD_SET_AT_KEY = "password_set_at";

export function getPasswordSetMetadata(user: User | null | undefined) {
  return {
    ...(user?.user_metadata ?? {}),
    [PASSWORD_LOGIN_ENABLED_KEY]: true,
    [PASSWORD_SET_AT_KEY]: new Date().toISOString(),
  };
}

export function userMetadataIndicatesPassword(user: User | null | undefined) {
  return Boolean(
    user?.user_metadata?.[PASSWORD_LOGIN_ENABLED_KEY] ||
      user?.user_metadata?.[PASSWORD_SET_AT_KEY] ||
      user?.app_metadata?.[PASSWORD_LOGIN_ENABLED_KEY] ||
      user?.app_metadata?.[PASSWORD_SET_AT_KEY]
  );
}
