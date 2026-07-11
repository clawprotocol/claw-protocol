# LawDog auth onboarding — production configuration

## Security model (hardened)

Anonymous `anon-*` workspaces require a **server-minted session token** (`POST /v1/workspace/anonymous-session`). The client sends `X-Claw-Anon-Session` on agreement and claim APIs; the backend verifies HMAC + DB hash. Org header alone is insufficient.

Auth continuation uses **server-side transactions** (`POST /v1/workspace/auth-continuation`) referenced by opaque `continuation_id` in OAuth/magic-link callback URLs — survives new-tab magic links without original `sessionStorage`.

`POST /v1/workspace/finalize-auth` and `POST /v1/workspace/bind-user-org` require verified Supabase JWT (`Authorization: Bearer`) in production. User id is derived from JWT, not trusted from body alone.

## Frontend (build-time)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `CLAW_ANON_SESSION_SECRET` | HMAC secret for anonymous session tokens (required in production) |
| `SUPABASE_JWT_SECRET` or `CLAW_SUPABASE_JWT_SECRET` | Verify Supabase access tokens on bind/finalize |
| `CLAW_ANON_SESSION_ENFORCE=1` | Require session token for `anon-*` org APIs (default on) |

## Supabase Dashboard

1. **Authentication → URL configuration**
   - Site URL: production SPA origin (e.g. `https://lawdog.me`)
   - Redirect URLs: `https://lawdog.me/app/auth/callback` (and staging equivalents)

2. **Authentication → Providers**
   - Email: enable magic link
   - Google: enable OAuth; add client id/secret from Google Cloud Console

3. **Apple (next provider)**
   - Enable Apple provider in Supabase when credentials exist
   - UI already uses provider-neutral `signInWithOAuthProvider`; add `Continue with Apple` button mirroring Google
   - Apple may return private relay emails — do not require display name at claim time

## Google Cloud Console

- OAuth client type: Web application
- Authorized redirect URI: Supabase callback URL shown in Supabase Google provider settings

## Continuation after auth

- Session storage key: `claw_auth_continuation_v1`
- OAuth/magic-link redirect: `/app/auth/callback?next=<allowlisted-path>`
- Allowlisted prefixes: `/app/create`, `/app/checkout/`, `/app/send`, `/app/done`, `/app/settings`, `/app/billing`, `/app`, `/review`, `/sign`

## Legacy env fallbacks (optional)

When `VITE_CLAW_FEATURE_SUPABASE_AUTH` is off:

- `VITE_LAWDOG_SIGNUP_EMAIL_URL`
- `VITE_LAWDOG_GOOGLE_AUTH_URL`
