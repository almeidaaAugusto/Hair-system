"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { getAgendaErrorMessage } from "@/features/admin-agenda/agenda-calendar";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { AdminNavigation } from "@/features/admin-auth/admin-navigation";
import { UserMessageError, toUserMessage } from "@/features/shared/user-message";

import { ClientFieldsInputs } from "./client-fields";
import { buildCreatePayload, emptyClientFields, type ClientFormFields } from "./client-form";
import {
  displayPhone,
  filterClients,
  formatBirthday,
  getCurrentMonth,
  isBirthdayMonth,
} from "./client-search";
import type { ClientApiErrorBody, ClientListItem } from "./client-types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; clients: ClientListItem[] };

type NewClientFormProps = { onCancel: () => void };

function NewClientForm({ onCancel }: NewClientFormProps) {
  const router = useRouter();
  const form = useForm<ClientFormFields>({ defaultValues: emptyClientFields });
  const [message, setMessage] = useState<string>();
  const [existingId, setExistingId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // One key per form opening: a retried submission after a lost response replays safely.
  const [requestId] = useState(() => crypto.randomUUID());
  const { setFocus } = form;

  useEffect(() => {
    setFocus("name");
  }, [setFocus]);

  async function submit(fields: ClientFormFields) {
    const payload = buildCreatePayload(fields);
    if (typeof payload === "string") {
      setMessage(payload);
      setExistingId(undefined);
      return;
    }
    setIsSubmitting(true);
    setMessage(undefined);
    setExistingId(undefined);
    try {
      const response = await fetchAdmin("/api/admin/clients", {
        body: JSON.stringify({ requestId, ...payload }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ClientApiErrorBody | null;
        if (response.status === 409 && body?.code === "CLIENT_PHONE_TAKEN") {
          setMessage("Já existe uma cliente com este telefone.");
          setExistingId(body.clientId);
          return;
        }
        throw new UserMessageError(getAgendaErrorMessage(body, "Não foi possível cadastrar."));
      }
      const data = (await response.json()) as { client?: { id?: string } };
      if (data.client?.id) router.push(`/admin/clients/${encodeURIComponent(data.client.id)}`);
      else onCancel();
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível cadastrar."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-labelledby="new-client-title"
      className="agenda-form"
      onSubmit={form.handleSubmit(submit)}
    >
      <h2 id="new-client-title">Nova cliente</h2>
      <ClientFieldsInputs register={form.register} />
      {message ? (
        <p role="alert">
          {message}{" "}
          {existingId ? (
            <Link className="link-button" href={`/admin/clients/${encodeURIComponent(existingId)}`}>
              Abrir ficha existente
            </Link>
          ) : null}
        </p>
      ) : null}
      <div className="service-form-actions">
        <button
          className="secondary-button"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Salvando…" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}

export function ClientsAdminPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const month = getCurrentMonth();

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const response = await fetchAdmin("/api/admin/clients");
        if (!response.ok)
          throw new UserMessageError(
            getAgendaErrorMessage(
              await response.json().catch(() => null),
              "Não foi possível carregar as clientes.",
            ),
          );
        const data = (await response.json()) as { clients: ClientListItem[] };
        if (isMounted) setState({ status: "ready", clients: data.clients });
      } catch (error) {
        if (isMounted)
          setState({
            status: "error",
            message: toUserMessage(error, "Não foi possível carregar as clientes."),
          });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const clients = state.status === "ready" ? state.clients : undefined;
  const visible = useMemo(() => (clients ? filterClients(clients, query) : []), [clients, query]);

  return (
    <main className="admin-page">
      <section aria-labelledby="clients-title" className="card services-card">
        <AdminNavigation />
        <div className="services-heading">
          <div>
            <h1 id="clients-title">Clientes</h1>
            <p>Fichas com contato, observações e histórico de atendimentos.</p>
          </div>
          {!isCreating ? (
            <button onClick={() => setIsCreating(true)} type="button">
              Nova cliente
            </button>
          ) : null}
        </div>

        {isCreating ? <NewClientForm onCancel={() => setIsCreating(false)} /> : null}

        <label className="client-search">
          Buscar cliente
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone ou Instagram"
            type="search"
            value={query}
          />
        </label>

        {state.status === "loading" ? <p role="status">Carregando clientes…</p> : null}
        {state.status === "error" ? (
          <div className="agenda-error" role="alert">
            <p>{state.message}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setState({ status: "loading" });
                setReloadKey((key) => key + 1);
              }}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        {clients && clients.length === 0 ? (
          <p className="agenda-empty">
            Nenhuma cliente cadastrada ainda. Elas aparecem aqui ao agendar ou em “Nova cliente”.
          </p>
        ) : null}
        {clients && clients.length > 0 && visible.length === 0 ? (
          <p className="agenda-empty" role="status">
            Nenhuma cliente encontrada para “{query.trim()}”.
          </p>
        ) : null}
        {visible.length > 0 ? (
          <ul aria-label="Clientes" className="services-list">
            {visible.map((client) => (
              <li className="service-item" key={client.id}>
                <div className="service-item-summary">
                  <h3>
                    <Link href={`/admin/clients/${encodeURIComponent(client.id)}`}>
                      {client.name}
                    </Link>
                  </h3>
                  <p>
                    {displayPhone(client.phone)}
                    {client.instagram ? ` · @${client.instagram}` : ""}
                  </p>
                  {client.birthday ? (
                    <div className="service-indicators">
                      {isBirthdayMonth(client.birthday, month) ? (
                        <span className="agenda-badge payment-partial">
                          Aniversariante do mês · {formatBirthday(client.birthday)}
                        </span>
                      ) : (
                        <span className="agenda-hint">
                          Aniversário {formatBirthday(client.birthday)}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
