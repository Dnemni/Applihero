# Quick Start: Custom Google OAuth Setup

## 🚀 Getting Started (5 minutes)

### Step 1: Verify Environment Variables

Check that `.env.local` has these variables:

```env.local
```

✅ These are already in your `.env.local`

### Step 2: Verify Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Applihero project
3. Navigate to **APIs & Services** → **Credentials**
4. Click on your OAuth Client ID
5. Verify **Authorized redirect URIs** includes:
   ```
   http://localhost:3000/auth/google-callback
   ```

### Step 3: Test Locally

```bash
# Install dependencies (if needed)
npm install

# Start dev server
npm run dev
```

Then test:
1. Go to http://localhost:3000/signup
2. Click "Sign up with Google"
3. You should see the Google consent screen with "Applihero" branding
4. Complete the login
5. You should be redirected to either set-password or dashboard

### Step 4: Verify Everything Works

Check these flows:

#### ✅ New Google User (First Time)
- Click "Sign in with Google"
- Consent screen appears
- Redirected to `/auth/set-password`
- After setting password, redirected to profile

#### ✅ Existing Google User (Returning)
- Click "Sign in with Google"
- Consent screen appears
- Redirected to `/dashboard` (or `/profile` if not onboarded)

#### ✅ User with Both Auth Methods
- Can sign in with Google OR email/password
- Both methods work seamlessly

---

## 🚀 Production Setup

### Step 1: Update Environment Variables

When deploying to production, update:

env.local

### Step 2: Update Google Cloud Console

1. Go to **APIs & Services** → **Credentials**
2. Click your OAuth Client ID
3. Add production redirect URI:
   ```
   https://your-domain.com/auth/google-callback
   ```
4. Add production JavaScript origin:
   ```
   https://your-domain.com
   ```

### Step 3: Update OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Update "Authorized domains" to include your production domain:
   ```
   your-domain.com
   ```
3. (Optional) Publish the consent screen if in Testing mode

### Step 4: Deploy

Push your changes and deploy as normal. OAuth will work automatically on production!

---

## 📋 How It Works

### Authentication Flow

```
1. User clicks "Sign in with Google"
   ↓
2. App generates secure state & nonce
   ↓
3. Redirects to Google OAuth consent screen
   ↓ (Your custom "Applihero" branding shown here)
4. User grants permission
   ↓
5. Google redirects back with authorization code
   ↓
6. App validates state (CSRF check)
   ↓
7. App calls /api/auth/google-token (server-side)
   ↓ (Client secret used securely on server)
8. Server exchanges code for ID token
   ↓
9. App signs in to Supabase with ID token
   ↓
10. User logged in! ✅
```

### Key Security Points

- **CSRF Protection**: State parameter prevents forged requests
- **Server-Side Secret**: Client secret never exposed to browser
- **Token Validation**: Supabase verifies Google's signature
- **Single-Use Codes**: Authorization codes expire quickly

---

## 🔍 Testing Checklist

### Local Testing

- [ ] Signup flow with new Google account works
- [ ] Login flow with existing Google account works
- [ ] "Set password" page shows for OAuth-only users
- [ ] Password can be set with strength requirements
- [ ] OAuth + password users can login both ways
- [ ] Errors are handled gracefully
- [ ] Redirects work correctly

### Browser DevTools Verification

1. Open **DevTools** → **Network** tab
2. Click "Sign in with Google"
3. Verify:
   - `https://accounts.google.com/o/oauth2/v2/auth?...` is called (Google OAuth)
   - `/api/auth/google-token` is called (server-side token exchange)
   - `GOOGLE_CLIENT_SECRET` does NOT appear anywhere in the network tab
   - No sensitive data exposed to client

### Console Logs

Check browser console for:
- ❌ No CORS errors
- ❌ No "state mismatch" errors
- ❌ No missing environment variable errors
- ✅ Successful login message

---

## 🐛 Troubleshooting

### "No authorization code received"

**Cause**: Google OAuth didn't work or was cancelled

**Fix**:
1. Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is correct
2. Check that `/auth/google-callback` is in Google Console
3. Try again in incognito window (fresh state)

### "State mismatch - possible CSRF attack"

**Cause**: State wasn't stored or was cleared

**Fix**:
1. Clear sessionStorage: `sessionStorage.clear()`
2. Try again in same browser tab
3. Ensure cookies aren't disabled

### "Failed to exchange authorization code"

**Cause**: Server-side token exchange failed

**Fix**:
1. Verify `GOOGLE_CLIENT_SECRET` is correct in `.env.local`
2. Check that authorization code isn't expired
3. Verify Client ID and Secret match Google Console
4. Check server logs for detailed error

### Branding still shows Supabase domain

**Note**: This is normal! 

- Google's OAuth always shows their domain at the top
- Your custom "Applihero" branding appears below
- This is expected behavior for all OAuth implementations

---

## 📚 Files Overview

| File | Purpose |
|------|---------|
| `lib/google-oauth.ts` | OAuth URL generation, state management |
| `app/api/auth/google-token/route.ts` | Server-side token exchange |
| `app/auth/google-callback/page.tsx` | OAuth callback handler |
| `app/(auth)/signup/page.tsx` | Updated with custom OAuth |
| `app/(auth)/login/page.tsx` | Updated with custom OAuth |
| `CUSTOM_GOOGLE_OAUTH_GUIDE.md` | Comprehensive documentation |
| `CUSTOM_OAUTH_IMPLEMENTATION.md` | Implementation summary |

---

## ❓ FAQ

**Q: Can I use this with other services besides Google?**
A: Not without modifications, but the pattern is the same - custom OAuth is flexible!

**Q: What if Google regenerates my credentials?**
A: Update the `.env.local` variables with the new ones from Google Console.

**Q: Is this compatible with my password reset flow?**
A: Yes! Password reset/set-password flows work the same as before.

**Q: Can I remove this and go back to Supabase OAuth?**
A: Yes, but you'd need to revert the signup/login pages.

---

## 🎉 You're All Set!

Your custom Google OAuth implementation is:
- ✅ Secure (CSRF protection, server-side secrets)
- ✅ Branded (Shows "Applihero" instead of Supabase)
- ✅ Production-ready (Works on any domain)
- ✅ Free (No Supabase Pro needed)

**Test it now**: http://localhost:3000/signup
