"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import type { Appointment } from "@/domain/appointments/appointment";
import {
  formatLocalTime,
  getAgendaErrorMessage,
  getTodayLocalDate,
  getWhatsAppUrl,
} from "@/features/admin-agenda/agenda-calendar";
import { appointmentStatusLabels, describePayment } from "@/features/admin-agenda/agenda-finance";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { AdminNavigation } from "@/features/admin-auth/admin-navigation";
import { formatBrazilianReal } from "@/features/admin-services/money";
import { UserMessageError, toUserMessage } from "@/features/shared/user-message";

import { ClientFieldsInputs } from "./client-fields";
import {
  buildChemicalEntryPayload,
  buildPatchPayload,
  clientToFields,
  type ChemicalEntryFields,
  type ClientFormFields,
} from "./client-form";
import { displayPhone, formatBirthday, getInstagramUrl } from "./client-search";
import { formatClientSummary, formatInstant, formatLocalDateBR } from "./client-summary";
import type {
  ChemicalHistoryEntry,
  ClientApiErrorBody,
  ClientDetail,
  ClientRecord,
} from "./client-types";

type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: ClientDetail };

function clientUrl(clientId: string, suffix = ""): string {
  return `/api/admin/clients/${encodeURIComponent(clientId)}${suffix}`;
}

type EditFormProps = {
  clientId: string;
  client: ClientRecord;
  onCancel: () => void;
  onSaved: () => void;
};

function ClientEditForm({ clientId, client, onCancel, onSaved }: EditFormProps) {
  const form = useForm<ClientFormFields>({ defaultValues: clientToFields(client) });
  const [message, setMessage] = useState<string>();
  const [existingId, setExistingId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(fields: ClientFormFields) {
    const patch = buildPatchPayload(client, fields);
    if (typeof patch === "string") {
      setMessage(patch);
      setExistingId(undefined);
      return;
    }
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setIsSubmitting(true);
    setMessage(undefined);
    setExistingId(undefined);
    try {
      const response = await fetchAdmin(clientUrl(clientId), {
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ClientApiErrorBody | null;
        if (response.status === 409 && body?.code === "CLIENT_PHONE_TAKEN") {
          setMessage("Já existe outra cliente com este telefone.");
          setExistingId(body.clientId);
          return;
        }
        throw new UserMessageError(getAgendaErrorMessage(body, "Não foi possível salvar."));
      }
      onSaved();
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível salvar."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-labelledby="client-edit-title"
      className="agenda-form"
      onSubmit={form.handleSubmit(submit)}
    >
      <h2 id="client-edit-title">Editar dados</h2>
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
          {isSubmitting ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function ClientData({ client, onEdit }: { client: ClientRecord; onEdit: () => void }) {
  return (
    <section aria-labelledby="client-data-title" className="client-section">
      <div className="client-section-heading">
        <h2 id="client-data-title">Dados</h2>
        <button className="secondary-button" onClick={onEdit} type="button">
          Editar dados
        </button>
      </div>
      <dl className="client-facts">
        <div>
          <dt>Telefone</dt>
          <dd>{displayPhone(client.phone)}</dd>
        </div>
        <div>
          <dt>Instagram</dt>
          <dd>{client.instagram ? `@${client.instagram}` : "—"}</dd>
        </div>
        <div>
          <dt>Aniversário</dt>
          <dd>{client.birthday ? formatBirthday(client.birthday) : "—"}</dd>
        </div>
      </dl>
      <div className="agenda-messages">
        <a
          className="link-button"
          href={getWhatsAppUrl(client.phone)}
          rel="noopener noreferrer"
          target="_blank"
        >
          WhatsApp
        </a>
        {client.instagram ? (
          <a
            className="link-button"
            href={getInstagramUrl(client.instagram)}
            rel="noopener noreferrer"
            target="_blank"
          >
            Instagram
          </a>
        ) : null}
      </div>
      <h3>Observações</h3>
      {client.notes ? (
        <p className="client-notes">{client.notes}</p>
      ) : (
        <p className="agenda-hint">Nenhuma observação.</p>
      )}
    </section>
  );
}

type ChemicalProps = {
  clientId: string;
  entries: ChemicalHistoryEntry[];
  onChanged: () => void;
};

function ChemicalHistory({ clientId, entries, onChanged }: ChemicalProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const form = useForm<ChemicalEntryFields>({
    defaultValues: { localDate: getTodayLocalDate(), procedure: "", product: "", notes: "" },
  });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function add(fields: ChemicalEntryFields) {
    const payload = buildChemicalEntryPayload(fields);
    if (typeof payload === "string") {
      setMessage(payload);
      return;
    }
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response = await fetchAdmin(clientUrl(clientId, "/chemical-history"), {
        body: JSON.stringify({ requestId, ...payload }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok)
        throw new UserMessageError(
          getAgendaErrorMessage(
            await response.json().catch(() => null),
            "Não foi possível adicionar o registro.",
          ),
        );
      form.reset({ localDate: getTodayLocalDate(), procedure: "", product: "", notes: "" });
      setRequestId(crypto.randomUUID());
      setIsAdding(false);
      onChanged();
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível adicionar o registro."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function remove(entry: ChemicalHistoryEntry) {
    if (
      !window.confirm(
        `Remover “${entry.procedure}” de ${formatLocalDateBR(entry.localDate)} do histórico químico?`,
      )
    )
      return;
    setBusyId(entry.id);
    setMessage(undefined);
    try {
      const response = await fetchAdmin(
        clientUrl(clientId, `/chemical-history/${encodeURIComponent(entry.id)}`),
        { method: "DELETE" },
      );
      if (!response.ok)
        throw new UserMessageError(
          getAgendaErrorMessage(
            await response.json().catch(() => null),
            "Não foi possível remover o registro.",
          ),
        );
      onChanged();
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível remover o registro."));
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section aria-labelledby="chemical-title" className="client-section">
      <div className="client-section-heading">
        <h2 id="chemical-title">Histórico químico</h2>
        {!isAdding ? (
          <button className="secondary-button" onClick={() => setIsAdding(true)} type="button">
            Adicionar registro
          </button>
        ) : null}
      </div>
      {isAdding ? (
        <form
          aria-labelledby="chemical-form-title"
          className="agenda-form"
          onSubmit={form.handleSubmit(add)}
        >
          <h3 id="chemical-form-title">Novo registro químico</h3>
          <div className="agenda-form-grid">
            <label>
              Data
              <input required type="date" {...form.register("localDate")} />
            </label>
            <label>
              Procedimento
              <input
                autoComplete="off"
                maxLength={120}
                placeholder="Ex.: Progressiva"
                required
                {...form.register("procedure")}
              />
            </label>
          </div>
          <label>
            Produto (opcional)
            <input autoComplete="off" maxLength={120} {...form.register("product")} />
          </label>
          <label>
            Observações (opcional)
            <textarea maxLength={500} rows={3} {...form.register("notes")} />
          </label>
          <div className="service-form-actions">
            <button
              className="secondary-button"
              disabled={isSubmitting}
              onClick={() => {
                setIsAdding(false);
                setMessage(undefined);
              }}
              type="button"
            >
              Cancelar
            </button>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Salvando…" : "Salvar registro"}
            </button>
          </div>
        </form>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      {entries.length === 0 ? (
        <p className="agenda-hint">Nenhum procedimento químico registrado.</p>
      ) : (
        <ul aria-label="Histórico químico" className="services-list">
          {entries.map((entry) => (
            <li className="service-item" key={entry.id}>
              <div className="service-item-summary">
                <h3>
                  {formatLocalDateBR(entry.localDate)} · {entry.procedure}
                </h3>
                {entry.product ? <p>Produto: {entry.product}</p> : null}
                {entry.notes ? <p className="client-notes">{entry.notes}</p> : null}
              </div>
              <div className="service-item-actions">
                <button
                  aria-label={`Remover ${entry.procedure} de ${formatLocalDateBR(entry.localDate)}`}
                  className="danger-button"
                  disabled={busyId === entry.id}
                  onClick={() => void remove(entry)}
                  type="button"
                >
                  {busyId === entry.id ? "Removendo…" : "Remover"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AppointmentHistory({ appointments }: { appointments: Appointment[] }) {
  return (
    <section aria-labelledby="history-title" className="client-section">
      <h2 id="history-title">Histórico de atendimentos</h2>
      {appointments.length === 0 ? (
        <p className="agenda-hint">Nenhum atendimento ainda.</p>
      ) : (
        <ul aria-label="Atendimentos" className="services-list">
          {appointments.map((appointment) => {
            const payment = describePayment(appointment);
            return (
              <li className="service-item" key={appointment.id}>
                <div className="service-item-summary">
                  <h3>
                    {formatInstant(appointment.startAt)} · {appointment.serviceSnapshot.name}
                  </h3>
                  <p>
                    {appointment.serviceSnapshot.hasVariablePrice ? "a partir de " : ""}
                    {formatBrazilianReal(appointment.serviceSnapshot.startingPriceCents)} ·{" "}
                    {formatLocalTime(appointment.startAt)}–{formatLocalTime(appointment.endAt)}
                  </p>
                  <div className="service-indicators">
                    <span className={`agenda-badge status-${appointment.status.replace("_", "-")}`}>
                      {appointmentStatusLabels[appointment.status]}
                    </span>
                    {payment ? <span className="agenda-badge">{payment}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ClientDetailPage({ clientId }: { clientId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const settle = (next: LoadState) => {
      if (isMounted) setState(next);
    };
    void (async () => {
      try {
        const response = await fetchAdmin(clientUrl(clientId));
        if (response.status === 404) return settle({ status: "not_found" });
        if (!response.ok)
          throw new UserMessageError(
            getAgendaErrorMessage(
              await response.json().catch(() => null),
              "Não foi possível carregar a ficha.",
            ),
          );
        settle({ status: "ready", detail: (await response.json()) as ClientDetail });
      } catch (error) {
        settle({
          status: "error",
          message: toUserMessage(error, "Não foi possível carregar a ficha."),
        });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [clientId, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);
  const detail = state.status === "ready" ? state.detail : undefined;

  return (
    <main className="admin-page">
      <section aria-labelledby="client-title" className="card services-card">
        <AdminNavigation />
        <p>
          <Link className="link-button" href="/admin/clients">
            ‹ Todas as clientes
          </Link>
        </p>
        {state.status === "loading" ? <p role="status">Carregando ficha…</p> : null}
        {state.status === "not_found" ? (
          <p className="agenda-empty" role="alert">
            Ficha não encontrada.
          </p>
        ) : null}
        {state.status === "error" ? (
          <div className="agenda-error" role="alert">
            <p>{state.message}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setState({ status: "loading" });
                reload();
              }}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        {detail ? (
          <>
            <h1 id="client-title">{detail.client.name}</h1>
            {message ? (
              <p aria-live="polite" role="status">
                {message}
              </p>
            ) : null}
            {isEditing ? (
              <ClientEditForm
                client={detail.client}
                clientId={clientId}
                onCancel={() => setIsEditing(false)}
                onSaved={() => {
                  setIsEditing(false);
                  setMessage("Dados atualizados.");
                  reload();
                }}
              />
            ) : (
              <ClientData client={detail.client} onEdit={() => setIsEditing(true)} />
            )}

            <section aria-labelledby="summary-title" className="client-section">
              <h2 id="summary-title">Resumo</h2>
              <dl className="client-summary">
                {formatClientSummary(detail.summary).map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <ChemicalHistory
              clientId={clientId}
              entries={detail.client.chemicalHistory}
              onChanged={reload}
            />
            <AppointmentHistory appointments={detail.appointments} />
          </>
        ) : null}
      </section>
    </main>
  );
}
