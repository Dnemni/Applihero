# Custom Google OAuth Implementation Guide

## Overview

You've implemented a **custom Google OAuth flow** that allows you to:
- Show your own branding and domain on the Google consent screen (instead of the Supabase subdomain)
- Maintain full control over the OAuth experience
- Keep all authentication logic within your application
- Securely exchange authorization codes server-side

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client-Side (React)                      │
│  User clicks "Sign in with Google" → Generates state & nonce    │
│  Stores in sessionStorage → Redirects to Google OAuth URL       │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                     Google OAuth Server                         │
│  User logs in & grants permissions → Redirects back with code  │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│            /auth/google-callback (Client-Side)                  │
│  Validates state (CSRF protection) → Extracts auth code        │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│          /api/auth/google-token (Server-Side)                   │
│  ⚠️  SECRET: Exchanges code for tokens using Client Secret      │
│     (This MUST be server-side to keep Client Secret secure)     │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│      Supabase Auth: signInWithIdToken()                         │
│  Exchanges Google ID token for Supabase session                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
└────────────────────▼────────────────────────────────────────────┘
              ✅ User logged in successfully
```

## Files Created

### 1. `/lib/google-oauth.ts`
**Purpose**: Google OAuth utilities and configuration

**Key Functions**:
- `getGoogleOAuthURL()` - Generates the Google OAuth redirect URL
- `generateStateAndNonce()` - Creates cryptographically secure random state and nonce
- `storeOAuthState()` / `getStoredOAuthState()` - Session storage management

**Security Features**:
- **State Parameter**: CSRF protection - ensures the callback came from your request
- **Nonce Parameter**: Used for ID token validation (optional but recommended)
- Uses `crypto.getRandomValues()` for secure random generation

### 2. `/app/api/auth/google-token/route.ts`
**Purpose**: Server-side token exchange (CRITICAL FOR SECURITY)

**What It Does**:
1. Receives authorization `code` from the client
2. Exchanges the code for tokens using the `GOOGLE_CLIENT_SECRET` (kept secret on server)
3. Returns ID token and access token to client

**Why It's Server-Side**:
- The `GOOGLE_CLIENT_SECRET` must NEVER be exposed to the client
- Only the server can safely use this secret
- Google will reject token requests from client-side

### 3. `/app/auth/google-callback/page.tsx`
**Purpose**: OAuth callback handler

**What It Does**:
1. Receives authorization code and state from Google
2. Validates state parameter (CSRF check)
3. Calls `/api/auth/google-token` to exchange code for tokens
4. Signs in to Supabase using `signInWithIdToken()`
5. Checks if user is OAuth-only (no email/password) → redirects to set-password
6. Handles new vs. existing users appropriately

### 4. `/app/api/auth/check-identities/route.ts`
**Purpose**: Check what authentication providers a user has

**Uses**: The `get_user_identities()` RPC function in Supabase

## Environment Variables

Add these to `.env.local`:

```env
# Google OAuth Configuration
NEXT_PUBLIC_GOOGLE_CLIENT_ID="YOUR_CLIENT_ID_FROM_GOOGLE_CONSOLE"
GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET_FROM_GOOGLE_CONSOLE"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**For Production**:
```env
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="YOUR_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
```

## Google Cloud Console Setup

### 1. OAuth Consent Screen Configuration
```
APIs & Services → OAuth consent screen
```

**Fill In**:
- **App name**: Applihero
- **App logo**: Upload your logo
- **User support email**: dhruvnemani@gmail.com
- **Authorized domains**: your-domain.com, localhost (for testing)
- **Developer contact**: dhruvnemani@gmail.com

### 2. OAuth Client ID (Web Application)
```
APIs & Services → Credentials → Create Credentials → OAuth client ID
```

**Application Type**: Web application

**Authorized JavaScript origins**:
```
http://localhost:3000
https://your-domain.com
```

**Authorized redirect URIs**:
```
http://localhost:3000/auth/google-callback
https://your-domain.com/auth/google-callback
```

## Security Practices Implemented

### ✅ CSRF Protection
- State parameter generated with `crypto.getRandomValues()`
- Validated on callback to ensure request originated from your app
- Prevents attackers from forcing users to auth against their will

### ✅ Server-Side Token Exchange
- `GOOGLE_CLIENT_SECRET` never exposed to client
- Only server can exchange authorization code for tokens
- Authorization code is single-use and expires quickly

### ✅ Session Storage
- State/nonce stored in `sessionStorage` (cleared on tab close)
- Not stored in `localStorage` (more secure for sensitive data)
- Cleared after successful authentication

### ✅ Nonce Parameter
- Optional but included for ID token validation
- Additional layer of security against token replay attacks

### ✅ ID Token Validation
- Supabase verifies the ID token signature
- Only tokens signed by Google are accepted
- Prevents token forgery

## Testing

### Local Testing Flow

1. **Start your dev server**:
```bash
npm run dev
```

2. **Navigate to signup/login**:
   - http://localhost:3000/signup
   - http://localhost:3000/login

3. **Click "Sign in with Google"**:
   - You'll be redirected to Google's OAuth consent screen showing "Applihero"
   - Your custom branding will appear (app name, logo, privacy policy links)
   - Note: The domain at the top will still show Google's domain, but your custom info is present

4. **After Authentication**:
   - For new OAuth-only users: redirects to `/auth/set-password`
   - For existing users: redirects to dashboard
   - For users with password set: normal auth flow

### Test Cases

```
1. New user with Google OAuth only
   → Creates user without email verification
   → Redirects to set-password page
   
2. Existing user signing back in with Google
   → Already has email/password setup
   → Redirects directly to dashboard
   
3. OAuth + Email/Password hybrid
   → Can sign in with either method
   → Both auth methods linked to same account
```

## Comparison: Supabase OAuth vs. Custom OAuth

| Feature | Supabase OAuth | Custom OAuth |
|---------|---|---|
| Domain shown on consent screen | Supabase project domain | Your custom domain |
| Client secret security | ✅ Server-side | ✅ Server-side |
| CSRF protection | ✅ State parameter | ✅ State parameter |
| Code | Simpler (2-3 lines) | More code (~200 lines) |
| Customization | Limited | Full control |
| Free tier limitation | Shows Supabase domain | ✅ Shows custom domain |
| Production domain | Requires Pro ($10/month) | Works with any domain |

## Troubleshooting

### ❌ "No authorization code received"
- Google OAuth was cancelled or failed
- Check that callback URL is in Google Console settings
- Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is correct

### ❌ "Failed to exchange authorization code"
- `GOOGLE_CLIENT_SECRET` is missing or incorrect
- Check `.env.local` for the secret
- Verify secret matches Google Console

### ❌ "State mismatch - possible CSRF attack"
- State wasn't stored in sessionStorage
- Cookie/session storage is disabled
- Multiple tabs/windows interfering
- Clear browser storage and try again

### ❌ "No ID token received"
- Token exchange returned empty response
- Check Google Console credentials are valid
- Verify Client ID and Secret haven't been regenerated

### ✅ Branding Still Shows Supabase Domain
- This is expected! Google's OAuth flow always shows their domain at the top
- Your custom app name, logo, and links appear below
- This is not a limitation of the custom OAuth flow

## Production Deployment Checklist

- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Add production domain to Google Console (both origins and redirect URIs)
- [ ] Update Google OAuth Consent Screen with production URLs
- [ ] Publish the OAuth consent screen (if in testing mode)
- [ ] Test the full flow on production domain
- [ ] Monitor error logs for any auth issues
- [ ] Verify password reset and set-password flows work

## Next Steps

1. **Configure Google Cloud Console** (if not already done)
2. **Update `.env.local`** with your credentials
3. **Update production environment variables** when deploying
4. **Test the signup/login flow** locally
5. **Monitor error logs** for any issues

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase signInWithIdToken](https://supabase.com/docs/guides/auth/sso/google)
- [OWASP: CSRF Prevention](https://owasp.org/www-community/attacks/csrf)
