# Password Management & OAuth Features - Setup Guide

## Overview
This guide explains the new password management features and how to set them up.

## Features Implemented

### 1. **Forgot Password Flow**
- **Route**: `/forgot-password`
- Users can request a password reset link
- Supabase sends email with reset link
- Link redirects to `/auth/reset-password`

### 2. **Reset Password Page**
- **Route**: `/auth/reset-password`
- Validates reset token from email
- Allows user to set new password
- Redirects to login with success message

### 3. **OAuth Password Creation**
- **Route**: `/auth/set-password`
- New Google OAuth users are prompted to create a password
- Enables email/password login in addition to Google
- Can be skipped (user can set password later in profile)

### 4. **Profile Password Change**
- **Location**: Profile page → Password & Security section
- Shows current email (read-only)
- Requires current password for verification
- Validates new password (min 6 characters)
- Confirms password match
- Shows success/error messages

### 5. **Login Page Updates**
- Forgot password link now functional
- Shows success message after password reset
- Improved error handling

---

## Supabase Setup Required

### Step 1: Enable Email Templates
1. Go to **Authentication** → **Email Templates**
2. Configure the **"Reset Password"** template:
   ```
   Confirm your mail: {{ .ConfirmationURL }}
   ```
   Or customize as needed
3. Save changes

### Step 2: Run Database Migration
Run the SQL migration to create the `get_user_identities` RPC function:

```bash
# Navigate to your project
cd /Users/dhruv/Documents/GitHub/Applihero

# Run the migration (you can use Supabase Dashboard SQL Editor)
```

**Or manually in Supabase Dashboard SQL Editor:**
1. Go to **SQL Editor**
2. Copy contents of `/lib/supabase/migrations/007_get_user_identities.sql`
3. Run the query

This function allows the app to check if a user has:
- OAuth-only login (Google)
- Email/password login
- Both

### Step 3: Configure Redirect URLs
Ensure these URLs are added to **Authentication** → **URL Configuration** → **Redirect URLs**:
```
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset-password
http://localhost:3000/auth/set-password
https://yourdomain.com/auth/callback
https://yourdomain.com/auth/reset-password
https://yourdomain.com/auth/set-password
```

### Step 4: Email Confirmation Settings
Your current setup (from previous configuration):
- ✅ Email confirmation enabled for email/password signups
- ✅ OAuth users auto-confirmed via database trigger
- This remains unchanged ✓

---

## User Flows

### Flow 1: Forgot Password (Email/Password Users)
1. User clicks "Forgot password?" on login page
2. Enters email → receives reset link
3. Clicks link → redirected to `/auth/reset-password`
4. Enters new password → redirected to login
5. Signs in with new password

### Flow 2: New OAuth User (Google)
1. User clicks "Sign in with Google" or "Sign up with Google"
2. Authenticates with Google
3. Account auto-created (no email verification)
4. Redirected to `/auth/set-password`
5. **Option A**: Sets password → continues to onboarding/dashboard
6. **Option B**: Clicks "Skip for now" → goes directly to dashboard
7. Can set password later in profile settings

### Flow 3: Existing OAuth User Returns
1. User clicks "Sign in with Google"
2. Already has account → checks if password set
3. If no password: redirected to `/auth/set-password` (optional)
4. If password exists or skipped: goes to dashboard

### Flow 4: Change Password in Profile
1. User navigates to Profile → Password & Security
2. Clicks "Change Password"
3. Modal appears with:
   - Email (read-only)
   - Current password
   - New password
   - Confirm new password
4. Enters all fields → clicks "Change Password"
5. System verifies current password
6. Updates to new password
7. Shows success message

---

## Testing Checklist

### Test Forgot Password
- [ ] Click "Forgot password?" on login page
- [ ] Enter valid email
- [ ] Check email inbox for reset link
- [ ] Click link → opens `/auth/reset-password`
- [ ] Enter new password → redirects to login
- [ ] Sign in with new password

### Test OAuth Password Creation
- [ ] Sign up with new Google account
- [ ] Redirected to `/auth/set-password`
- [ ] Set password → continues to dashboard
- [ ] Sign out
- [ ] Sign in with email/password (works)
- [ ] Sign in with Google (works)

### Test OAuth Skip Password
- [ ] Sign up with new Google account
- [ ] Click "Skip for now" on set password page
- [ ] Goes to dashboard
- [ ] Later: go to Profile → Change Password
- [ ] Should be able to set password from there

### Test Profile Password Change
- [ ] Go to Profile page
- [ ] Scroll to "Password & Security"
- [ ] Click "Change Password"
- [ ] Enter incorrect current password → shows error
- [ ] Enter mismatched new passwords → shows error
- [ ] Enter valid passwords → shows success
- [ ] Sign out and in with new password

---

## Environment Variables

All required variables are already set in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://qtapgokmdtuynmrziilm.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

No changes needed to environment variables.

---

## Files Changed/Created

### New Pages
- `/app/(auth)/forgot-password/page.tsx` - Password reset request
- `/app/auth/reset-password/page.tsx` - Password reset form
- `/app/auth/set-password/page.tsx` - OAuth password creation

### Updated Pages
- `/app/(auth)/login/page.tsx` - Added forgot password link, success message
- `/app/auth/callback/page.tsx` - OAuth flow checks for password creation
- `/app/profile/page.tsx` - Added Password & Security section with change modal

### New Migrations
- `/lib/supabase/migrations/007_get_user_identities.sql` - RPC function

---

## Troubleshooting

### "Invalid or expired reset link"
- Reset links expire after 1 hour
- Request a new link from `/forgot-password`

### "Current password is incorrect"
- Verify user is entering correct password
- Password is case-sensitive

### OAuth users can't change password
- OAuth-only users need to set a password first
- They should be redirected to `/auth/set-password` on first login
- Or they can set it from profile later

### Email not received
- Check spam folder
- Verify email template is configured in Supabase
- Check Supabase logs for email sending errors

---

## Security Notes

- Passwords must be minimum 6 characters
- Current password required to change password
- Reset links expire after 1 hour
- OAuth users can optionally skip password creation
- All password operations use Supabase Auth (secure)
- `get_user_identities` RPC is security definer (users can only query their own)

---

## Next Steps

After completing Supabase setup:
1. Test all flows in development
2. Update production redirect URLs when deploying
3. Customize email templates in Supabase for branding
4. Consider adding password strength indicator
5. Consider adding 2FA in the future
