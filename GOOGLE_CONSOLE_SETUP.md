# Google Cloud Console Configuration

## 🎯 Required Configuration

This guide shows exactly what needs to be configured in Google Cloud Console for custom Google OAuth to work.

---

## Step 1: OAuth Consent Screen

Go to: **APIs & Services** → **OAuth consent screen**

### Settings to Configure

| Field | Value |
|-------|-------|
| User Type | External |
| App name | Applihero |
| User support email | dhruvnemani@gmail.com |
| App logo | (Upload your logo if desired) |
| Application home page | https://your-domain.com (optional) |
| Privacy policy link | https://your-domain.com/privacy-policy |
| Terms of service link | https://your-domain.com/terms-of-service |
| Developer contact | dhruvnemani@gmail.com |

### Scopes to Add

Required scopes (usually pre-selected):
- `openid`
- `email`
- `profile`

### Authorized Domains

Add both for testing and production:
- `localhost` (for local development)
- `your-domain.com` (for production)

---

## Step 2: OAuth Client ID (Web Application)

Go to: **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**

### Application Type
Select: **Web application**

### Authorized JavaScript Origins

These are the domains from which your JavaScript can call Google APIs:

```
http://localhost:3000
http://localhost:3000:3000
https://your-domain.com
```

⚠️ **Important**: Include protocol (`http://` or `https://`)
⚠️ **Important**: Do NOT include paths (e.g., `/auth/callback` is NOT here)

### Authorized Redirect URIs

These are the EXACT URLs Google will redirect to after authorization:

```
http://localhost:3000/auth/google-callback
https://your-domain.com/auth/google-callback
```

⚠️ **CRITICAL**: Must be EXACT - including protocol, domain, and path
⚠️ **CRITICAL**: Must match what's in your app

---

## Current Configuration (December 2025)

Based on your existing credentials:

```
Client ID: 307947012696-vopr5kv93s5pcu4b32g4pdldfobfuutu.apps.googleusercontent.com
Client Secret: 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
```

### What's Already Configured ✅

If these URLs are NOT yet in your Google Console, add them:

#### Authorized JavaScript Origins
- `http://localhost:3000` ✅

#### Authorized Redirect URIs
- `http://localhost:3000/auth/google-callback` ✅ (for local testing)

---

## Production Configuration

When deploying to production, update these:

### Authorized JavaScript Origins
```
https://your-domain.com
https://www.your-domain.com
```

### Authorized Redirect URIs
```
https://your-domain.com/auth/google-callback
https://www.your-domain.com/auth/google-callback
```

---

## Step-by-Step: Add Redirect URI

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** → **Credentials**
3. Find and click your OAuth 2.0 Client ID (Web application)
4. Scroll to "Authorized redirect URIs"
5. Click **+ Add URI**
6. Paste: `http://localhost:3000/auth/google-callback`
7. Click **Save**

---

## Common Mistakes ❌

### ❌ Mistake 1: Including the path in "Authorized JavaScript Origins"
```
WRONG: http://localhost:3000/auth/google-callback
RIGHT: http://localhost:3000
```

### ❌ Mistake 2: Forgetting the protocol
```
WRONG: localhost:3000
RIGHT: http://localhost:3000
```

### ❌ Mistake 3: Using different domain in production
```
WRONG: Configured for localhost only, then deployed to different domain
RIGHT: Add production domain BEFORE deploying
```

### ❌ Mistake 4: Missing trailing slash inconsistency
```
WRONG: Configured https://your-domain.com, but app uses https://your-domain.com/
RIGHT: Be consistent (usually without trailing slash)
```

### ❌ Mistake 5: Not updating redirect URI for production
```
WRONG: Only have localhost URLs configured
RIGHT: Add production URLs before deploying
```

---

## Verification Checklist

Before testing, verify in Google Console:

- [ ] **OAuth Consent Screen**
  - [ ] App name: "Applihero"
  - [ ] User support email: dhruvnemani@gmail.com
  - [ ] Privacy policy link configured
  - [ ] Terms of service link configured
  - [ ] Authorized domains include localhost and your domain

- [ ] **OAuth Client ID (Web App)**
  - [ ] Type: Web application
  - [ ] Authorized JavaScript Origins includes `http://localhost:3000`
  - [ ] Authorized Redirect URIs includes `http://localhost:3000/auth/google-callback`
  - [ ] Credentials match `.env.local` (Client ID and Secret)

---

## Environment Variables Checklist

In `.env.local`:

```env
# ✅ These match your Google Console credentials
NEXT_PUBLIC_GOOGLE_CLIENT_ID="307947012696-vopr5kv93s5pcu4b32g4pdldfobfuutu.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"

# ✅ Local development
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 🔄 For production, change to:
# NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

---

## What Happens During OAuth

1. **User clicks "Sign in with Google"** on your app
2. **App redirects to Google**: Using OAuth URL with your Client ID
3. **Google shows consent screen**: "Applihero" wants access to...
   - Your name and profile picture
   - Your email address
4. **User clicks "Continue"**
5. **Google redirects back**: To `http://localhost:3000/auth/google-callback` with authorization code
6. **Your app validates**: State parameter (CSRF check)
7. **Your app exchanges code for tokens**: Using server-side endpoint
8. **Your app signs in user**: Using ID token
9. **User logged in!** ✅

---

## Debugging: Check These URLs

If OAuth fails, verify:

### URL in Browser Address Bar
When Google redirects back, you should see:
```
http://localhost:3000/auth/google-callback?code=...&state=...
```

If you see a different URL or error, the redirect URI is wrong in Google Console.

### URL in Network Tab
Check the initial redirect to Google - it should show:
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=307947012696-vopr5kv93s5pcu4b32g4pdldfobfuutu.apps.googleusercontent.com
  redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle-callback
  ...
```

The `redirect_uri` parameter should match what's in Google Console.

---

## Quick Links

- [Google Cloud Console](https://console.cloud.google.com)
- [Your OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
- [Your OAuth Credentials](https://console.cloud.google.com/apis/credentials)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)

---

## Support

If OAuth isn't working:

1. ✅ Verify all URLs match between Google Console and code
2. ✅ Check `.env.local` has correct Client ID and Secret
3. ✅ Verify redirect URI is EXACT match (including protocol and path)
4. ✅ Clear browser cache and try in incognito window
5. ✅ Check browser console for error messages
6. ✅ Check server logs for detailed errors

---

**Last Updated**: December 19, 2025
**Status**: Production Ready
