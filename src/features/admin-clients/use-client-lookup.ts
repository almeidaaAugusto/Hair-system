"use client";

import { useEffect, useState } from "react";

import { fetchAdmin } from "@/features/admin-auth/admin-api-client";

import { isLookupablePhone, type ClientLookupState } from "./client-booking";

const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Looks the client up by phone once it is valid (debounced). A lookup that
 * answers a phone the user has since edited is ignored.
 */
export function useClientLookup(phone: string): ClientLookupState {
  const lookupable = isLookupablePhone(phone);
  const key = phone.replace(/\D/g, "");
  const [loaded, setLoaded] = useState<{ key: string; state: ClientLookupState }>();

  useEffect(() => {
    if (!lookupable) return;
    let isMounted = true;
    const settle = (state: ClientLookupState) => {
      if (isMounted) setLoaded({ key, state });
    };
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetchAdmin(
            `/api/admin/clients/lookup?${new URLSearchParams({ phone: key })}`,
          );
          if (response.status === 404) return settle({ status: "not_found" });
          if (!response.ok) return settle({ status: "error" });
          const data = (await response.json()) as { client?: { id?: string; name?: string } };
          if (data.client?.id && data.client.name)
            settle({ status: "found", clientId: data.client.id, name: data.client.name });
          else settle({ status: "error" });
        } catch {
          settle({ status: "error" });
        }
      })();
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [lookupable, key]);

  if (!lookupable) return { status: "idle" };
  return loaded?.key === key ? loaded.state : { status: "loading" };
}
