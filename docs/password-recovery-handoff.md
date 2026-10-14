# Password recovery deployment handoff

## Production configuration

No credentials or dashboard settings are changed by this pull request. Before deploying, verify:

- `NEXT_PUBLIC_APP_URL=https://flowwick.vercel.app` is present in the selected Vercel production project.
- Supabase Authentication > URL Configuration has `https://flowwick.vercel.app` as the Site URL.
- Supabase's redirect allow list contains the exact URL `https://flowwick.vercel.app/auth/update-password`.
- The Reset Password email template still links through `{{ .ConfirmationURL }}`. This existing/default template works with the implementation and requires no template change.

The application also accepts a custom recovery link that sends `token_hash={{ .TokenHash }}&type=recovery` to `/auth/update-password`, but changing the template is optional and should be separately reviewed. Do not put raw access or refresh tokens into a custom query string.

## Deployment

1. Review the focused test results and production build for this PR.
2. Confirm the production environment and Supabase allow-list entries above.
3. Deploy the merged commit through the normal Vercel production workflow.
4. Run the manual end-to-end checks below with a non-privileged test account.
5. Do not report the flow production-ready until the email and login checks pass against the live deployment.

## Manual end-to-end checklist

- From `https://flowwick.vercel.app/auth?mode=reset`, request a reset for the test account.
- Confirm the email link targets Supabase verification and redirects to `https://flowwick.vercel.app/auth/update-password`, not an old Vercel deployment.
- Confirm the browser removes recovery fragments or token-hash query parameters immediately after the page loads.
- Confirm mismatched and fewer-than-eight-character passwords are rejected without a network update.
- Set a new password and confirm the exact success message: `Password updated successfully`.
- Confirm the page provides a working link back to `/auth` and requires a fresh login.
- Confirm the old password fails and the new password succeeds.
- Confirm the same recovery link cannot be used again and offers a working action to request another email.
- Confirm an expired and a deliberately malformed link show the reset-again action without revealing token details.
- Confirm the existing account, merchant connections, and saved drafts remain available after login.
- Check desktop and mobile layouts, and verify passwords/tokens do not appear in application logs or analytics.

## Recovery

If live verification fails, roll back the application deployment to the preceding Vercel deployment. Leave Supabase users and application data untouched. Re-check the canonical app URL, exact redirect allow-list entry, and Reset Password template before retrying. This change has no database migration or data rollback step.
