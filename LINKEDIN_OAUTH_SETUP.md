# LinkedIn OAuth Setup Guide

## Overview
LinkedIn OAuth has been implemented following the same secure pattern as Google OAuth. Users can now sign in/sign up with their LinkedIn accounts.

## What's Been Implemented

### 1. Backend Infrastructure
- **`/lib/linkedin-oauth.ts`**: OAuth configuration and utility functions
  - `getLinkedInOAuthURL(state)`: Generates LinkedIn OAuth URL
  - State generation and storage for CSRF protection
  - SessionStorage management

- **`/app/api/auth/linkedin-token/route.ts`**: Server-side token exchange
  - Securely exchanges authorization code for access token
  - Fetches user info from LinkedIn API
  - Never exposes client secret to client

- **`/app/auth/linkedin-callback/page.tsx`**: OAuth callback handler
  - Validates state parameter (CSRF protection)
  - Creates Supabase account with temporary password
  - Redirects to set-password for new users

### 2. Frontend Integration
- **Login page**: LinkedIn button added with full OAuth flow
- **Signup page**: LinkedIn button added with full OAuth flow
- Both pages have loading states and error handling

## Setup Instructions

### Step 1: Create LinkedIn OAuth App
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Click "Create app"
3. Fill in app details:
   - **App name**: Applihero
   - **LinkedIn Page**: (Your company page or create one)
   - **App logo**: Upload your logo
   - **Legal agreement**: Accept terms
4. Click "Create app"

### Step 2: Configure OAuth Settings
1. Go to "Auth" tab in your LinkedIn app
2. Add redirect URLs:
   - Development: `http://localhost:3000/auth/linkedin-callback`
   - Production: `https://yourdomain.com/auth/linkedin-callback`
3. Under "OAuth 2.0 scopes", request:
   - `openid`
   - `profile`
   - `email`
4. Save changes

### Step 3: Get Credentials
1. In the "Auth" tab, you'll see:
   - **Client ID**: Copy this
   - **Client Secret**: Click "Show" and copy this
2. Keep these secure!

### Step 4: Add Environment Variables
Add to your `.env.local` file:

```bash
# LinkedIn OAuth
NEXT_PUBLIC_LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here

# Make sure you also have:
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or your production URL
```

### Step 5: Test the Flow
1. Start your development server: `npm run dev`
2. Go to signup or login page
3. Click "Sign in with LinkedIn"
4. You'll be redirected to LinkedIn
5. Authorize the app
6. You'll be redirected back and signed in
7. If it's a new account, you'll be prompted to set a password

## How It Works

### OAuth Flow
1. **User clicks LinkedIn button** → Generates secure random state, stores in sessionStorage
2. **Redirect to LinkedIn** → User authorizes app
3. **LinkedIn redirects back** → With authorization code and state
4. **Validate state** → CSRF protection check
5. **Server exchanges code** → Calls `/api/auth/linkedin-token` with authorization code
6. **Server gets tokens** → Exchanges code for access token using client secret
7. **Server fetches user info** → Gets email, name, profile picture from LinkedIn
8. **Create/sign in to Supabase** → Uses LinkedIn email with temporary password
9. **Update profile** → Saves name and profile info
10. **Redirect** → New users go to set-password, existing users go to dashboard

### Unique Approach
Unlike Google OAuth which uses `signInWithIdToken`, LinkedIn OAuth:
- Creates a Supabase account using email/password authentication
- Uses LinkedIn email + temporary password (`linkedin_temp_${userInfo.sub}`)
- Then prompts user to set their own password
- This allows users to have both LinkedIn OAuth AND email/password login

## Security Features
- **CSRF Protection**: State parameter validation
- **Server-side token exchange**: Client secret never exposed to browser
- **Single-use codes**: Authorization codes expire quickly
- **Secure password generation**: Temporary passwords use LinkedIn user ID
- **Session storage**: CSRF tokens cleared after authentication

## Next Steps

### Profile Page Integration (TODO)
Add a section in the profile page to:
- Show if LinkedIn is connected
- Allow connecting LinkedIn if not used for signup
- Display LinkedIn profile info (name, picture, headline)
- Option to disconnect LinkedIn

### Potential Enhancements (Future)
- Parse LinkedIn profile data for resume information
- Use LinkedIn data for job matching
- Sync LinkedIn updates to profile
- Import LinkedIn work experience

## Troubleshooting

### "redirect_uri_mismatch" Error
- Make sure the redirect URI in your LinkedIn app matches exactly: `http://localhost:3000/auth/linkedin-callback`
- No trailing slashes
- Must be added to allowed redirect URIs

### "Invalid client credentials" Error
- Check that `LINKEDIN_CLIENT_SECRET` is correct in `.env.local`
- Make sure you're using the Client Secret from the Auth tab, not the Client ID

### "State parameter mismatch" Error
- This is CSRF protection working
- Usually caused by page refresh during OAuth flow
- Try the flow again from the beginning

### User Not Getting Redirected to Set Password
- Check that the callback handler is creating the account properly
- Look in browser console for errors
- Check Supabase Auth logs

## Documentation
For more details on the OAuth implementation pattern, see:
- `README_OAUTH.md` - Complete OAuth overview
- `GOOGLE_OAUTH_QUICK_START.md` - Similar implementation for Google
- `CUSTOM_GOOGLE_OAUTH_GUIDE.md` - Technical deep dive

## Support
If you encounter issues:
1. Check browser console for errors
2. Check terminal logs for server-side errors
3. Verify environment variables are set
4. Confirm LinkedIn app configuration matches redirect URIs
