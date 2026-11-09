export type LoginFinalizationResult = "navigated" | "rolled-back";

type FinalizeSuccessfulAdminLoginOptions<Auth> = {
  auth: Auth;
  clearSession: () => Promise<boolean>;
  destination: string;
  hardNavigate: (destination: string) => void;
  signOutClient: (auth: Auth) => Promise<void>;
  softNavigate: (destination: string) => void;
};

type PerformAdminLogoutOptions<Auth> = {
  clearSession: () => Promise<boolean>;
  getAuth: () => Promise<Auth>;
  navigate: (destination: string) => void;
  signOutClient: (auth: Auth) => Promise<void>;
};

export async function clearAdminSession(fetchSession: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchSession("/api/auth/session", {
      credentials: "same-origin",
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function navigateWithReloadFallback(
  destination: string,
  softNavigate: (destination: string) => void,
  hardNavigate: (destination: string) => void,
): void {
  try {
    softNavigate(destination);
  } catch {
    hardNavigate(destination);
  }
}

export async function finalizeSuccessfulAdminLogin<Auth>({
  auth,
  clearSession,
  destination,
  hardNavigate,
  signOutClient,
  softNavigate,
}: FinalizeSuccessfulAdminLoginOptions<Auth>): Promise<LoginFinalizationResult> {
  try {
    await signOutClient(auth);
    navigateWithReloadFallback(destination, softNavigate, hardNavigate);
    return "navigated";
  } catch {
    const cookieWasCleared = await clearSession();
    const clientWasCleared = await signOutClient(auth).then(
      () => true,
      () => false,
    );

    if (cookieWasCleared && clientWasCleared) {
      return "rolled-back";
    }

    const destinationForActualSession = cookieWasCleared ? "/login" : destination;
    if (clientWasCleared) {
      navigateWithReloadFallback(destinationForActualSession, softNavigate, hardNavigate);
    } else {
      hardNavigate(destinationForActualSession);
    }
    return "navigated";
  }
}

export async function performAdminLogout<Auth>({
  clearSession,
  getAuth,
  navigate,
  signOutClient,
}: PerformAdminLogoutOptions<Auth>): Promise<boolean> {
  if (!(await clearSession())) return false;

  await getAuth()
    .then((auth) => signOutClient(auth))
    .catch(() => undefined);
  navigate("/login");
  return true;
}
