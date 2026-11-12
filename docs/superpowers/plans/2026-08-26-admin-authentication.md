# Administrative Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a secure, persistent, server-owned administrative session for the existing Next.js and Firebase application.

**Architecture:** Firebase email/password authentication is used only to obtain a fresh ID token at /login. A Node.js Route Handler validates the current administrative claims and exchanges that token for an HttpOnly Firebase session cookie. Proxy performs only a no-cookie redirect; page-level guards and every administrative API authorize a verified cookie or explicit bearer token.

**Tech Stack:** Next.js 16 App Router and Proxy, React 19, Firebase Auth Web SDK, Firebase Admin SDK, Vitest, Playwright, Firebase Emulator Suite.

**Spec:** docs/superpowers/specs/2026-08-26-admin-authentication-design.md

## Global Constraints

- Work only in the current local checkout; do not push changes.
- Preserve Firebase Authentication, Firebase Admin SDK, and the claim contract admin: true with a non-empty salonId.
- Use a fixed five-day admin_session cookie with HttpOnly, SameSite=Lax, path=/, production-only Secure, and high priority where supported.
- Use Firebase client in-memory persistence only for the login exchange; do not keep administrative tokens in React state, localStorage, logs, or user messages.
- Verify both ID tokens and session cookies with revocation checking; derive salonId only from verified claims.
- Preserve bearer-token support for existing programmatic API consumers. An explicit invalid bearer must never fall back to a cookie.
- Do not create public registration, customer auth, social login, /admin/settings, data-model changes, or dependencies.
- Keep the existing next-env.d.ts edit and untracked baseline docs files out of all commits.

---

## File Structure

- src/server/auth/admin-session.ts — session cookie constants, options, cookie extraction, and Firebase session-cookie creation.
- src/server/auth/admin-context.ts — the single claims-to-AdminContext conversion and bearer/cookie verification.
- src/server/auth/admin-page-session.ts — server component helpers for mandatory and optional administrative sessions.
- src/app/api/auth/session/route.ts — same-origin session creation and deletion.
- src/proxy.ts — optimistic no-cookie redirect for /admin/:path*.
- src/app/login/page.tsx and src/features/admin-auth/admin-login-page.tsx — server redirect and browser login exchange UI.
- src/features/admin-auth/admin-navigation.tsx and admin-api-client.ts — shared administrative navigation/logout and cookie API request handling.
- src/features/admin-auth/login-destination.ts — safe return destination and error-copy functions usable by server and client code.
- Existing service and business-hours feature pages — remove the duplicated embedded login/token flow.
- Tests colocated with server/client modules, plus an emulator Playwright configuration and administrative auth E2E spec.

### Task 1: Server session and authorization primitives

**Files:**
- Create: src/server/auth/admin-session.ts
- Create: src/server/auth/admin-session.test.ts
- Modify: src/server/auth/admin-context.ts
- Modify: src/server/auth/admin-context.test.ts
- Modify: src/server/auth/authenticate-admin.test.ts

**Interfaces:**
- Produces ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_MAX_AGE_SECONDS, getAdminSessionCookie(request), createAdminSessionCookie(idToken), and getAdminSessionCookieOptions().
- Produces verifyAdminIdToken(token), verifyAdminSessionCookie(cookie), and authenticateAdmin(request).
- verifyAdminIdToken returns an object shaped as { admin: AdminContext, authTime: number | undefined }.
- authenticateAdmin prefers an Authorization header when one exists, otherwise reads admin_session.

- [ ] **Step 1: Write the failing tests**

~~~ts
it("verifies a session cookie with revocation checking", async () => {
  mocks.verifySessionCookie.mockResolvedValue({
    admin: true,
    salonId: "salon-1",
    uid: "user-1",
  });

  await expect(verifyAdminSessionCookie("session-cookie")).resolves.toEqual({
    salonId: "salon-1",
    userId: "user-1",
  });
  expect(mocks.verifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
});

it("does not fall back to a cookie when an explicit bearer is invalid", async () => {
  mocks.verifyIdToken.mockRejectedValue(
    Object.assign(new Error(), { code: "auth/id-token-expired" }),
  );

  await expect(authenticateAdmin(requestWithBearerAndCookie)).rejects.toMatchObject({
    status: 401,
  });
  expect(mocks.verifySessionCookie).not.toHaveBeenCalled();
});

it("creates a five-day Firebase session cookie", async () => {
  await createAdminSessionCookie("id-token");
  expect(mocks.createSessionCookie).toHaveBeenCalledWith("id-token", {
    expiresIn: 5 * 24 * 60 * 60 * 1000,
  });
});
~~~

Also test missing cookie as 401, non-admin/missing salon claims as 403, secure cookie options under production, and Firebase token/session errors mapped to safe 401 errors.

- [ ] **Step 2: Confirm the new tests fail**

Run: npm test -- src/server/auth/admin-session.test.ts src/server/auth/authenticate-admin.test.ts

Expected: FAIL because the session module and cookie authentication interfaces do not exist.

- [ ] **Step 3: Implement the minimal primitives**

~~~ts
export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export async function verifyAdminSessionCookie(cookie: string): Promise<AdminContext> {
  try {
    const claims = await getAuth(getAdminApp()).verifySessionCookie(cookie, true);
    return getAdminContext(claims);
  } catch (error) {
    throw mapFirebaseAuthorizationError(error);
  }
}

export async function authenticateAdmin(request: Request): Promise<AdminContext> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    return (await verifyAdminIdToken(getBearerToken(authorization))).admin;
  }

  const cookie = getAdminSessionCookie(request);
  if (!cookie) throw new AuthorizationError("Token de autenticação ausente.", 401);
  return verifyAdminSessionCookie(cookie);
}
~~~

Implement robust Cookie-header parsing without a dependency. Keep getAdminContext as the only claim validation point. Use the existing Admin SDK app and checkRevoked=true for both token types. Make createAdminSessionCookie call createSessionCookie with exactly five days and make options secure only when NODE_ENV is production.

- [ ] **Step 4: Verify the server-auth change**

Run: npm test -- src/server/auth/admin-session.test.ts src/server/auth/admin-context.test.ts src/server/auth/authenticate-admin.test.ts

Run: npm run typecheck

Expected: PASS; bearer coverage remains intact and cookie verification checks revocation.

- [ ] **Step 5: Commit the scoped change**

~~~powershell
git add -- src/server/auth/admin-session.ts src/server/auth/admin-session.test.ts src/server/auth/admin-context.ts src/server/auth/admin-context.test.ts src/server/auth/authenticate-admin.test.ts
git commit -m "feat: add administrative session primitives"
~~~

### Task 2: Session exchange Route Handler

**Files:**
- Create: src/app/api/auth/session/route.ts
- Create: src/app/api/auth/session/route.test.ts

**Interfaces:**
- Consumes getBearerToken, verifyAdminIdToken, AuthorizationError, createAdminSessionCookie, and cookie constants/options.
- Produces POST(request) and DELETE(request) at /api/auth/session.
- POST requires a same-origin request, a bearer ID token, a recent auth_time, and validated claims. DELETE clears the cookie independently of its current validity.

- [ ] **Step 1: Write the failing route tests**

~~~ts
it("sets only an HttpOnly administrative cookie after a recent authorized login", async () => {
  mocks.verifyAdminIdToken.mockResolvedValue({
    admin: { salonId: "salon-1", userId: "admin-1" },
    authTime: Math.floor(Date.now() / 1000),
  });
  mocks.createAdminSessionCookie.mockResolvedValue("signed-session");

  const response = await POST(sameOriginBearerRequest());

  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toContain("admin_session=signed-session");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

it("does not set a cookie for a non-admin or a missing salon claim", async () => {
  mocks.verifyAdminIdToken.mockRejectedValue(
    new AuthorizationError("Acesso administrativo não autorizado.", 403),
  );

  const response = await POST(sameOriginBearerRequest());

  expect(response.status).toBe(403);
  expect(response.headers.get("set-cookie")).toBeNull();
});

it("rejects an ID token whose auth_time is older than five minutes", async () => {
  mocks.verifyAdminIdToken.mockResolvedValue({
    admin,
    authTime: Math.floor(Date.now() / 1000) - 301,
  });

  expect((await POST(sameOriginBearerRequest())).status).toBe(401);
});

it("clears the session cookie on same-origin logout", async () => {
  const response = await DELETE(sameOriginRequestWithCookie());

  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});
~~~

Cover absent/malformed bearer tokens, a missing auth_time, a foreign or absent Origin header, and an unexpected Admin SDK failure with safe responses.

- [ ] **Step 2: Confirm the Route Handler tests fail**

Run: npm test -- src/app/api/auth/session/route.test.ts

Expected: FAIL because /api/auth/session does not exist.

- [ ] **Step 3: Implement session creation and deletion**

~~~ts
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AuthorizationError("Requisição de sessão não autorizada.", 403);
  }
}

export async function POST(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const token = getBearerToken(request.headers.get("authorization"));
  const verified = await verifyAdminIdToken(token);

  if (!verified.authTime || Date.now() / 1000 - verified.authTime > 5 * 60) {
    throw new AuthorizationError("Não foi possível iniciar a sessão.", 401);
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    await createAdminSessionCookie(token),
    getAdminSessionCookieOptions(),
  );
  return response;
}
~~~

Set runtime=nodejs and dynamic=force-dynamic. Convert expected authorization errors to bounded JSON 401/403 responses. Use the project safe server-error logger for unexpected failures, never returning a provider error. DELETE follows the same Origin rule, creates a 204 no-store response, and expires the same path/name cookie with maxAge=0.

- [ ] **Step 4: Run focused tests**

Run: npm test -- src/app/api/auth/session/route.test.ts

Expected: PASS for successful exchange, invalid token, non-admin, missing salonId, stale login, origin rejection, and cookie deletion.

- [ ] **Step 5: Commit the endpoint**

~~~powershell
git add -- src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts
git commit -m "feat: add admin session endpoint"
~~~

### Task 3: Server route protection and redirect behavior

**Files:**
- Create: src/server/auth/admin-page-session.ts
- Create: src/server/auth/admin-page-session.test.ts
- Create: src/proxy.ts
- Create: src/proxy.test.ts
- Create: src/app/admin/page.tsx
- Create: src/app/login/page.tsx
- Modify: src/app/admin/services/page.tsx
- Modify: src/app/admin/business-hours/page.tsx

**Interfaces:**
- Produces requireAdminSession(), which redirects unauthenticated, expired, revoked, non-admin, and missing-salon sessions to /login.
- Produces getOptionalAdminSession(), which returns null rather than throwing so /login redirects only a fully verified administrator.
- Proxy matches /admin/:path*, redirects only when admin_session is absent, and preserves pathname plus query in next.
- /admin redirects a verified admin to /admin/services.

- [ ] **Step 1: Write failing guard and Proxy tests**

~~~ts
it("redirects a no-cookie admin request to login and preserves the return path", () => {
  const response = proxy(new NextRequest("http://localhost/admin/services?tab=active"));

  expect(response.headers.get("location")).toBe(
    "http://localhost/login?next=%2Fadmin%2Fservices%3Ftab%3Dactive",
  );
});

it("allows Proxy to continue when a cookie is present without treating it as valid", () => {
  const response = proxy(
    new NextRequest("http://localhost/admin/services", {
      headers: { Cookie: "admin_session=possibly-stale" },
    }),
  );

  expect(response.headers.get("location")).toBeNull();
});

it("redirects a rejected server session before page content renders", async () => {
  mocks.verifyAdminSessionCookie.mockRejectedValue(
    new AuthorizationError("Token de autenticação inválido.", 401),
  );

  await expect(requireAdminSession()).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
});
~~~

Test optional inspection with valid session, no cookie, invalid session, no redirect loop from /login, and matcher coverage for /admin itself plus nested routes.

- [ ] **Step 2: Confirm tests fail**

Run: npm test -- src/server/auth/admin-page-session.test.ts src/proxy.test.ts

Expected: FAIL because the helper and Proxy are absent.

- [ ] **Step 3: Implement the authoritative page gate**

~~~tsx
export default async function ServicesPage() {
  await requireAdminSession();
  return <ServicesAdminPage />;
}

export function proxy(request: NextRequest) {
  if (!request.cookies.has(ADMIN_SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
~~~

The page helper reads the cookie through Next cookies(), verifies it with Task 1, and uses redirect("/login") only after a failed server verification. Login checks getOptionalAdminSession and redirects a valid administrator to /admin/services. If a cookie exists but verification fails, pass hasStaleSession to the client login component so it calls DELETE /api/auth/session once and removes the stale cookie without looping.

- [ ] **Step 4: Verify route protection**

Run: npm test -- src/server/auth/admin-page-session.test.ts src/proxy.test.ts

Run: npm run typecheck

Expected: PASS; all current /admin pages are server-guarded before their client feature is rendered.

- [ ] **Step 5: Commit route protection**

~~~powershell
git add -- src/server/auth/admin-page-session.ts src/server/auth/admin-page-session.test.ts src/proxy.ts src/proxy.test.ts src/app/admin/page.tsx src/app/login/page.tsx src/app/admin/services/page.tsx src/app/admin/business-hours/page.tsx
git commit -m "feat: protect administrative routes on the server"
~~~

### Task 4: One login UI, cookie API calls, and accessible logout

**Files:**
- Create: src/features/admin-auth/login-destination.ts
- Create: src/features/admin-auth/login-destination.test.ts
- Create: src/features/admin-auth/admin-login-page.tsx
- Create: src/features/admin-auth/admin-navigation.tsx
- Create: src/features/admin-auth/admin-api-client.ts
- Modify: src/features/admin-auth/admin-login-form.tsx
- Modify: src/features/admin-services/firebase-client.ts
- Modify: src/features/admin-services/services-admin-page.tsx
- Modify: src/features/admin-business-hours/business-hours-admin-page.tsx
- Modify: src/app/globals.css

**Interfaces:**
- getSafeAdminDestination(next) accepts exactly /admin or paths starting /admin/; every other string maps to /admin/services.
- getLoginErrorMessage(firebaseCode, sessionStatus) maps wrong credentials, non-admin/missing salon, and unexpected errors to bounded Portuguese copy.
- fetchAdmin(input, init) explicitly uses credentials=same-origin. A 401/403 begins safe navigation to /login and throws AdminSessionExpiredError so CRUD UI does not keep working as authenticated.
- AdminNavigation uses Next Link and presents a disabled-while-pending Sair button.

- [ ] **Step 1: Write failing pure-client tests**

~~~ts
it.each(["/admin", "/admin/services", "/admin/services?tab=active"])(
  "keeps an internal administrative return destination",
  (next) => expect(getSafeAdminDestination(next)).toBe(next),
);

it.each([undefined, "https://evil.example", "//evil.example", "/other"])(
  "falls back safely",
  (next) => expect(getSafeAdminDestination(next)).toBe("/admin/services"),
);

it("does not expose Firebase provider details for unexpected failures", () => {
  expect(getLoginErrorMessage("auth/network-request-failed")).toBe(
    "Não foi possível entrar. Tente novamente.",
  );
});
~~~

Test explicit invalid credential code mapping and 403 mapping to the administrative-authorization message.

- [ ] **Step 2: Confirm client utility tests fail**

Run: npm test -- src/features/admin-auth/login-destination.test.ts

Expected: FAIL because login-destination.ts does not exist.

- [ ] **Step 3: Implement the client flow**

~~~tsx
const auth = await getSessionClientAuth();

try {
  const credential = await signInWithEmailAndPassword(auth, fields.email, fields.password);
  const idToken = await credential.user.getIdToken(true);
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { Authorization: "Bearer " + idToken },
  });

  if (!response.ok) throw new SessionExchangeError(response.status);

  await signOut(auth);
  router.replace(getSafeAdminDestination(next));
} catch (error) {
  await signOut(auth).catch(() => undefined);
  setMessage(getLoginErrorMessage(getFirebaseErrorCode(error), getSessionStatus(error)));
}
~~~

Configure Firebase Auth in-memory persistence before sign-in. Connect to the Auth Emulator exactly once only when NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is present. Remove token, setToken, Firebase credential login, and UI-generated Authorization headers from service and business-hours pages. Load data through fetchAdmin in useEffect and preserve existing CRUD behavior. Use shared navigation in both screens.

Logout calls DELETE /api/auth/session, then Firebase signOut, then router.replace("/login"). If cookie deletion fails, show a generic error and stay in the protected screen. The login form must expose aria-busy, a live error alert, labeled controls, and disabled duplicate submission. Add only the CSS needed for responsive shared navigation, focus state, status text, and button layout.

- [ ] **Step 4: Verify the client conversion**

Run: npm test -- src/features/admin-auth/login-destination.test.ts

Run: npm run lint

Run: npm run typecheck

Expected: PASS; the browser UI has no durable token state or per-route login screen.

- [ ] **Step 5: Commit the client flow**

~~~powershell
git add -- src/features/admin-auth src/features/admin-services/firebase-client.ts src/features/admin-services/services-admin-page.tsx src/features/admin-business-hours/business-hours-admin-page.tsx src/app/globals.css
git commit -m "feat: add persistent admin login and logout"
~~~

### Task 5: Emulator-backed end-to-end coverage and claim-change invalidation

**Files:**
- Create: playwright.auth.config.ts
- Create: tests/e2e/admin-auth.spec.ts
- Modify: package.json
- Modify: scripts/set-admin-claims.mjs
- Modify: tests/e2e/verification.spec.ts

**Interfaces:**
- Produces npm run test:e2e:auth, executing Playwright inside firebase emulators:exec with Auth and Firestore.
- The auth Playwright configuration provides FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST, FIREBASE_PROJECT_ID, and public Firebase emulator values to the Next dev server.
- E2E setup creates three isolated emulator accounts: authorized admin, non-admin, and admin without salonId.

- [ ] **Step 1: Write failing E2E coverage**

~~~ts
async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@example.test");
  await page.getByLabel("Senha").fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/services$/);
}

test("persists an authorized admin session across navigation and refresh", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("link", { name: "Configurar expediente" }).click();
  await expect(page).toHaveURL(/\/admin\/business-hours$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Expediente" })).toBeVisible();
});

test("redirects direct unauthenticated access and clears access after logout", async ({ page }) => {
  await page.goto("/admin/services");
  await expect(page).toHaveURL(/\/login\?next=/);

  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin/services");
  await expect(page).toHaveURL(/\/login\?next=/);
});
~~~

Add separate assertions for wrong password, nonexistent account, non-admin, missing salonId, authorized access to /login, no redirect loop, and direct access to both current administrative feature routes.

- [ ] **Step 2: Confirm E2E fails before plumbing exists**

Run: npm run test:e2e:auth

Expected: FAIL because the script, emulator configuration, provisioning, and final UI behavior do not exist.

- [ ] **Step 3: Implement emulator configuration and supported claim invalidation**

~~~json
"test:e2e:auth": "firebase emulators:exec --project demo-sistema-cabelo --only auth,firestore \"playwright test --config playwright.auth.config.ts\""
~~~

Use Playwright beforeAll to initialize Firebase Admin against the emulator, create the three accounts, and set their claims before browser login. Update set-admin-claims.mjs after setCustomUserClaims:

~~~js
await auth.revokeRefreshTokens(user.uid);
~~~

This forces session verification to reject old sessions when the supported claim-management workflow changes admin or salonId. Update existing verification E2E assertions: direct administrative visits now redirect to /login rather than displaying embedded login forms.

- [ ] **Step 4: Run browser verification**

Run: npm run test:e2e:auth

Run: npm run test:e2e

Expected: PASS for login, all denial cases, direct redirects, no loop, navigation, refresh, valid /login redirect, logout, and post-logout protection.

- [ ] **Step 5: Commit E2E coverage**

~~~powershell
git add -- playwright.auth.config.ts tests/e2e/admin-auth.spec.ts tests/e2e/verification.spec.ts package.json scripts/set-admin-claims.mjs
git commit -m "test: cover administrative authentication flow"
~~~

### Task 6: Full verification, security review, and final handoff

**Files:**
- Modify only files that formatter reports within this scoped authentication work.
- Do not stage unrelated next-env.d.ts or the pre-existing untracked docs baseline files.

**Interfaces:**
- Consumes Tasks 1-5.
- Produces test and review evidence for every acceptance criterion and a final report. It never pushes changes.

- [ ] **Step 1: Format and inspect the scoped diff**

Run: npm run format

Run: git diff --check

Run: git status --short

Expected: no whitespace errors. Confirm only known authentication files are staged or newly changed.

- [ ] **Step 2: Run all mandatory checks**

Run: npm run lint

Run: npm run typecheck

Run: npm test

Run: npm run test:integration

Run: npm run test:e2e:auth

Run: npm run test:e2e

Run: npm run build

Expected: every command exits 0. If a baseline failure occurs, investigate it before claiming success.

- [ ] **Step 3: Firebase security review**

Check that every protected page verifies an Admin SDK session cookie server-side; every API still calls authenticateAdmin; only verified claims supply salonId; cookies are HttpOnly, SameSite Lax, secure in production, no-store on session endpoints, and never logged; same-origin guards protect session mutations; invalid/revoked values reveal only safe errors.

- [ ] **Step 4: Quality gate and manual validation**

Check that no duplicated login flow remains; loading, disabled controls, alerts, focus, mobile layout, and logout are accessible; no open redirect is possible; and no /admin/settings route was invented. Run the manual login, navigation, direct URL, refresh, logout, and non-admin scenarios against the local emulator.

- [ ] **Step 5: Commit any remaining verified scoped work**

~~~powershell
git status --short
git diff --cached --check
git commit -m "feat: finalize administrative authentication"
~~~

Create this final commit only if scoped implementation changes remain after the task-level commits. Report what was preserved, session behavior, tests and results, the class-diagram versus Firebase-claims discrepancy, and remaining risk. Do not push.
