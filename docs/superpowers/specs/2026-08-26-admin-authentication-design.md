# Administrative Authentication Design

## Goal

Complete the administrative authentication flow so that a professional signs in once, receives a server-owned session, and can safely use the current administrative routes without repeating login on navigation or refresh.

## Scope and constraints

- Scope is limited to `/login`, administrative session management, authorization, `/admin/*` protection, logout, redirects, and their tests.
- Keep Firebase Authentication, Firebase Admin SDK, Firestore server access, and the existing custom claims contract: `admin: true` plus a non-empty `salonId`.
- Do not add public registration, customer authentication, password recovery, social login, a settings feature, or changes to the Firestore data model.
- Keep bearer-token support for existing programmatic API callers, but make the browser administrative UI use the server session cookie instead.
- Do not add a new dependency. Firebase, Firebase Admin, Next.js, Vitest, Playwright, and Firebase Emulator Suite already provide the required capabilities.

## Documentation alignment

The class diagram models a `Usuario` role (`ADMIN | PROFISSIONAL`) and a password hash, while the architecture documents and current implementation authorize Firebase identities through `admin` and `salonId` custom claims. This implementation treats the diagram as a conceptual domain model and preserves the explicit architecture decision for Firebase claims. No documentation is changed because the diagram is not proven obsolete; the discrepancy will be reported with the implementation.

## Session architecture

The browser will use Firebase email/password authentication only to establish a session. The login component will configure Firebase client authentication with in-memory persistence, sign in, obtain a freshly issued ID token, and send it in an `Authorization: Bearer` header to `POST /api/auth/session`.

The server will:

1. Require a same-origin request and a bearer ID token.
2. Verify the ID token with revocation checking and require a recent sign-in (`auth_time` no older than five minutes).
3. Validate `admin === true` and a non-empty `salonId` using the existing centralized claim rules.
4. Create a Firebase session cookie valid for five days.
5. Set only the `admin_session` cookie with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge` matching the session duration, `secure` outside development, and a high priority where supported.

The route returns no token or claim payload. After success, the client signs out of the temporary Firebase client state and navigates to a validated internal destination. The cookie, not React state or browser-visible Firebase credentials, is the durable administrative session. The session is fixed-duration rather than silently renewed; after five days, the professional signs in again.

Both session endpoints require a same-origin browser request. `DELETE /api/auth/session` always removes the browser cookie and returns a safe success response. It is a current-browser logout only; it does not revoke sessions on other devices. The client also clears Firebase's in-memory state before navigating to `/login`.

## Authorization boundaries

Create a focused server session module that owns the cookie name, cookie options, ID-token exchange, session-cookie verification, and conversion of verified claims to `AdminContext`. Refactor `authenticateAdmin(request)` so it preserves current bearer validation when a bearer is supplied and otherwise verifies `admin_session` with `verifySessionCookie(cookie, true)`. A malformed bearer must not fall back to a cookie. Both paths continue to validate `admin` and `salonId` and derive the salon exclusively from verified claims.

Administrative API handlers retain their own authorization call. Therefore, an API is never protected only by the page UI or by a redirect.

Add `src/proxy.ts` with a matcher for `/admin/:path*`. It performs only the fast, optimistic check recommended for Proxy: requests without the session cookie redirect to `/login?next=<requested-admin-path>`. It does not grant access based on cookie presence.

Each existing administrative page (`/admin`, `/admin/services`, and `/admin/business-hours`) will call a server-side `requireAdminSession()` before rendering. That helper verifies the session cookie with revocation checking and the same claims rules. This is the authoritative page gate, prevents an administrative-content flash, and covers invalid, expired, revoked, non-admin, and missing-salon cookies. `/login` will verify a valid session server-side and redirect authorized users to `/admin/services`; an invalid stale cookie renders login and is cleared client-side, avoiding a redirect loop.

When administrative browser requests receive 401 or 403 from an API after initial rendering, the client will stop the current operation and navigate to `/login`; it will not continue displaying data as authenticated.

## Login, navigation, and logout UX

`/login` renders one responsive, accessible email/password form. It disables duplicate submits, announces loading and errors, and exposes labeled controls. Error copy is deliberately bounded:

- invalid email/password or nonexistent account: `E-mail ou senha inválidos.`
- authenticated identity without `admin` or `salonId`: `Sua conta não possui autorização administrativa.`
- invalid or expired token/session and unexpected provider/server errors: a generic retry message without provider details, token values, or account-existence information.

The `next` query parameter is accepted only when it is an internal `/admin` path; all other values fall back to `/admin/services`, preventing an open redirect. Existing service and business-hours pages will remove their duplicated embedded login/token state and make same-origin API requests through the cookie. A shared administrative navigation component will use `Link` and include an accessible `Sair` control on every current administrative screen.

The existing claims-management script will revoke refresh tokens after changing administrative claims. This forces a new sign-in/session issuance whenever the script changes `admin` or `salonId`, so an old five-day session cannot retain a claim changed through the supported operator workflow.

## Tests and verification

Unit and route-handler tests will cover claim validation, bearer precedence, session-cookie creation and deletion, recent-sign-in enforcement, cookie flags, invalid/revoked session handling, safe return destinations, and Proxy redirects. Existing API authorization tests will be updated to exercise cookie fallback while retaining bearer coverage.

An authentication E2E configuration will run against the local Firebase Auth and Firestore emulators. It will provision an admin, a non-admin, and an admin without `salonId`, then cover valid login, invalid credentials, both authorization denials, direct unauthenticated route access, navigation and refresh persistence, authorized `/login` redirect, no-loop behavior, logout, and post-logout route protection. The Firebase client will explicitly connect to the Auth emulator only when the relevant public emulator environment variable is configured.

Manual verification will repeat the required login, navigation, direct URL, refresh, logout, and unauthorized-user scenarios locally. Final checks are formatter, lint, typecheck, unit tests, integration tests, auth E2E tests, production build, Firebase security review, and quality gate.

## Risks and operational notes

- A Firebase session cookie contains the claims present when it is minted. Revoking refresh tokens after claim changes is therefore required by the supported claims-management script.
- Revocation checking adds an Admin SDK lookup to protected requests. This is intentional for the requested authorization safety and remains bounded to administrative access.
- The project currently has no `/admin/settings` route; it will not be invented merely for authentication testing.
