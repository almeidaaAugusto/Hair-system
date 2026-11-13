"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";

import type { Appointment, PaymentMethod, TimeBlock } from "@/domain/appointments/appointment";
import type { AvailabilityWindow } from "@/domain/appointments/availability";
import { getLocalDayBounds } from "@/domain/appointments/local-date";
import type { Service } from "@/domain/services/service";
import { fetchAdmin } from "@/features/admin-auth/admin-api-client";
import { UserMessageError, toUserMessage } from "@/features/shared/user-message";
import { formatBrazilianReal } from "@/features/admin-services/money";

import {
  formatLocalTime,
  getAgendaErrorMessage,
  listStartOptions,
  localDateTimeToUtc,
} from "./agenda-calendar";
import {
  canChooseStartTime,
  createPendingOverride,
  isLocalDateInput,
  parseOverridableError,
  resolveStartAt,
  type PendingOverride,
} from "./booking-exceptions";
import {
  buildPaymentInput,
  getDefaultPaymentFields,
  paymentMethodLabels,
  type PaymentFields,
} from "./agenda-finance";

async function readAgendaError(response: Response, fallback: string): Promise<string> {
  return getAgendaErrorMessage(await response.json().catch(() => null), fallback);
}

type AppointmentFields = {
  serviceId: string;
  date: string;
  startAt: string;
  useCustomTime: boolean;
  customTime: string;
  name: string;
  phone: string;
  source: "manual" | "whatsapp";
};

type AvailabilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; windows: AvailabilityWindow[]; options: string[] };

/** Active services (including those that require evaluation), sorted by name. */
function useBookableServices() {
  const [services, setServices] = useState<Service[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const response = await fetchAdmin("/api/admin/services");
        if (!response.ok)
          throw new UserMessageError(
            await readAgendaError(response, "Não foi possível carregar os serviços."),
          );
        const data = (await response.json()) as { services: Service[] };
        if (!isMounted) return;
        setServices(
          data.services
            .filter((service) => service.isActive)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } catch (caught) {
        if (isMounted) setError(toUserMessage(caught, "Não foi possível carregar os serviços."));
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);
  return { services, error };
}

/** Free windows for a service and date; `excludeAppointmentId` ignores the appointment being moved. */
function useAvailability(serviceId: string, date: string, excludeAppointmentId?: string) {
  const [refreshKey, setRefreshKey] = useState(0);
  const canQuery = Boolean(serviceId) && isLocalDateInput(date);
  const queryKey = `${serviceId}|${date}|${excludeAppointmentId ?? ""}|${refreshKey}`;
  const [loaded, setLoaded] = useState<{ key: string; state: AvailabilityState }>();
  const availability: AvailabilityState = !canQuery
    ? { status: "idle" }
    : loaded?.key === queryKey
      ? loaded.state
      : { status: "loading" };

  useEffect(() => {
    if (!canQuery) return;
    let isMounted = true;
    const settle = (state: AvailabilityState) => {
      if (isMounted) setLoaded({ key: queryKey, state });
    };
    void (async () => {
      try {
        const query = new URLSearchParams({
          date,
          serviceId,
          ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
        });
        const response = await fetchAdmin(`/api/admin/appointments/availability?${query}`);
        if (!response.ok)
          throw new UserMessageError(
            await readAgendaError(response, "Não foi possível consultar os horários."),
          );
        const data = (await response.json()) as { windows: AvailabilityWindow[] };
        settle({ status: "ready", windows: data.windows, options: listStartOptions(data.windows) });
      } catch (error) {
        settle({
          status: "error",
          message: toUserMessage(error, "Não foi possível consultar os horários."),
        });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [serviceId, date, excludeAppointmentId, canQuery, queryKey]);

  return { availability, queryKey, refresh: () => setRefreshKey((key) => key + 1) };
}

type SlotPickerProps = {
  availability: AvailabilityState;
  onRetry: () => void;
  registration: UseFormRegisterReturn;
  customToggle: UseFormRegisterReturn;
  customTime: UseFormRegisterReturn;
  useCustomTime: boolean;
  hint?: string;
};

function SlotPicker({
  availability,
  onRetry,
  registration,
  customToggle,
  customTime,
  useCustomTime,
  hint,
}: SlotPickerProps) {
  const showList = !useCustomTime;
  return (
    <fieldset className="agenda-slots">
      <legend>Horário</legend>
      {availability.status === "idle" ? <p>Escolha o serviço e a data.</p> : null}
      {showList && availability.status === "loading" ? (
        <p role="status">Consultando horários livres…</p>
      ) : null}
      {showList && availability.status === "error" ? (
        <p role="alert">
          {availability.message}{" "}
          <button className="link-button" onClick={onRetry} type="button">
            Tentar novamente
          </button>
        </p>
      ) : null}
      {showList && availability.status === "ready" && availability.options.length === 0 ? (
        <p role="status">Não há horários livres para este serviço nesta data.</p>
      ) : null}
      {showList && availability.status === "ready" && availability.options.length > 0 ? (
        <>
          <p className="agenda-hint">
            Livre:{" "}
            {availability.windows
              .map(
                (window) =>
                  `${formatLocalTime(window.startAt)}–${formatLocalTime(window.endAt)} (último início ${formatLocalTime(window.latestStartAt)})`,
              )
              .join("; ")}
          </p>
          <label>
            Início
            <select required {...registration}>
              <option value="">Selecione</option>
              {availability.options.map((option) => (
                <option key={option} value={option}>
                  {formatLocalTime(option)}
                </option>
              ))}
            </select>
          </label>
          {hint ? <p className="agenda-hint">{hint}</p> : null}
        </>
      ) : null}
      {availability.status !== "idle" ? (
        <>
          <label className="checkbox-label">
            <input type="checkbox" {...customToggle} /> Outro horário (digitar)
          </label>
          {useCustomTime ? (
            <>
              <label>
                Horário de início
                <input required step={60} type="time" {...customTime} />
              </label>
              <p className="agenda-hint">
                Mesmo dia. Se o horário estiver fora do expediente, você poderá confirmar a exceção.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}

type ExceptionNoticeProps = {
  warning: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
};

/** Asks the professional to confirm an administrative exception before resending. */
function ExceptionNotice({ warning, isSubmitting, onConfirm, onBack }: ExceptionNoticeProps) {
  return (
    <div className="agenda-exception" role="alert">
      <p>
        <strong>{warning}</strong>
      </p>
      <p className="agenda-hint">
        Você pode confirmar mesmo assim; o atendimento ficará marcado como exceção na agenda.
      </p>
      <div className="service-form-actions">
        <button className="secondary-button" disabled={isSubmitting} onClick={onBack} type="button">
          Voltar
        </button>
        <button disabled={isSubmitting} onClick={onConfirm} type="button">
          {isSubmitting ? "Salvando…" : "Agendar mesmo assim"}
        </button>
      </div>
    </div>
  );
}

/** Booking needs either a listed free slot or a typed time. */
function canChooseStart(
  availability: AvailabilityState,
  useCustomTime: boolean,
  serviceId: string,
  date: string,
): boolean {
  return canChooseStartTime({
    availabilityReady: availability.status === "ready",
    useCustomTime,
    serviceId,
    date,
  });
}

function serviceLabel(service: Service): string {
  return `${service.name} · ${service.durationMinutes} min · ${service.hasVariablePrice ? "a partir de " : ""}${formatBrazilianReal(service.startingPriceCents)}${service.requiresEvaluation ? " · exige avaliação" : ""}`;
}

type AppointmentFormProps = {
  defaultDate: string;
  onCancel: () => void;
  onCreated: (appointment: Appointment) => void;
};

type AppointmentPayload = {
  serviceId: string;
  startAt: string;
  client: { name: string; phone: string };
  source: "manual" | "whatsapp";
};

export function AppointmentForm({ defaultDate, onCancel, onCreated }: AppointmentFormProps) {
  const form = useForm<AppointmentFields>({
    defaultValues: {
      serviceId: "",
      date: defaultDate,
      startAt: "",
      useCustomTime: false,
      customTime: "",
      name: "",
      phone: "",
      source: "whatsapp",
    },
  });
  const { control, setValue } = form;
  const serviceId = useWatch({ control, name: "serviceId" });
  const date = useWatch({ control, name: "date" });
  const useCustomTime = useWatch({ control, name: "useCustomTime" });
  const { services, error: servicesError } = useBookableServices();
  const { availability, queryKey, refresh } = useAvailability(serviceId, date);
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pending, setPending] = useState<
    PendingOverride<AppointmentPayload> & { formKey: string }
  >();
  // One key per form opening: a retried submission after a lost response replays safely.
  const [requestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    setValue("startAt", "");
  }, [queryKey, setValue]);

  // Any edit invalidates the exception the professional was asked to confirm.
  const formKey = JSON.stringify(useWatch({ control }));
  const activePending = pending?.formKey === formKey ? pending : undefined;

  async function send(payload: AppointmentPayload, id: string, allowExceptions: boolean) {
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response = await fetchAdmin("/api/admin/appointments", {
        body: JSON.stringify({
          requestId: id,
          ...payload,
          ...(allowExceptions ? { allowExceptions: true } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        const overridable = allowExceptions
          ? undefined
          : parseOverridableError(response.status, body);
        if (overridable) {
          setPending({
            ...createPendingOverride(overridable, payload, () => crypto.randomUUID()),
            formKey,
          });
          return;
        }
        setPending(undefined);
        if (body?.code === "CONFLICT") refresh();
        setMessage(getAgendaErrorMessage(body, "Não foi possível salvar o agendamento."));
        return;
      }
      const data = (await response.json()) as { appointment: Appointment };
      onCreated(data.appointment);
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível salvar o agendamento."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(fields: AppointmentFields) {
    const start = resolveStartAt(fields);
    if ("error" in start) {
      setMessage(start.error);
      return;
    }
    await send(
      {
        serviceId: fields.serviceId,
        startAt: start.startAt,
        client: { name: fields.name, phone: fields.phone },
        source: fields.source,
      },
      requestId,
      false,
    );
  }

  const selectedService = services?.find((service) => service.id === serviceId);

  return (
    <form
      aria-labelledby="appointment-form-title"
      className="agenda-form"
      onSubmit={form.handleSubmit(submit)}
    >
      <h2 id="appointment-form-title">Novo agendamento</h2>
      {servicesError ? <p role="alert">{servicesError}</p> : null}
      {!services && !servicesError ? <p role="status">Carregando serviços…</p> : null}
      {services && services.length === 0 ? (
        <p role="status">Nenhum serviço ativo. Cadastre ou ative um serviço.</p>
      ) : null}
      <div className="agenda-form-grid">
        <label>
          Serviço
          <select disabled={!services?.length} required {...form.register("serviceId")}>
            <option value="">Selecione</option>
            {services?.map((service) => (
              <option key={service.id} value={service.id}>
                {serviceLabel(service)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input required type="date" {...form.register("date")} />
        </label>
      </div>
      <SlotPicker
        availability={availability}
        customTime={form.register("customTime")}
        customToggle={form.register("useCustomTime")}
        hint={
          selectedService
            ? `Duração de ${selectedService.durationMinutes} min, mais o intervalo configurado entre atendimentos.`
            : undefined
        }
        onRetry={refresh}
        registration={form.register("startAt")}
        useCustomTime={useCustomTime}
      />
      <div className="agenda-form-grid">
        <label>
          Nome da cliente
          <input autoComplete="off" maxLength={120} required {...form.register("name")} />
        </label>
        <label>
          Telefone (WhatsApp)
          <input
            autoComplete="off"
            inputMode="tel"
            placeholder="(11) 99999-9999"
            required
            {...form.register("phone")}
          />
        </label>
      </div>
      <fieldset className="agenda-source">
        <legend>Origem</legend>
        <label>
          <input type="radio" value="whatsapp" {...form.register("source")} /> WhatsApp
        </label>
        <label>
          <input type="radio" value="manual" {...form.register("source")} /> Outro (manual)
        </label>
      </fieldset>
      {message ? <p role="alert">{message}</p> : null}
      {activePending ? (
        <ExceptionNotice
          isSubmitting={isSubmitting}
          onBack={() => setPending(undefined)}
          onConfirm={() => void send(activePending.payload, activePending.requestId, true)}
          warning={activePending.error.warning}
        />
      ) : (
        <div className="service-form-actions">
          <button
            className="secondary-button"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            disabled={isSubmitting || !canChooseStart(availability, useCustomTime, serviceId, date)}
            type="submit"
          >
            {isSubmitting ? "Salvando…" : "Confirmar agendamento"}
          </button>
        </div>
      )}
    </form>
  );
}

type BlockFields = {
  date: string;
  wholeDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
};

type BlockFormProps = {
  defaultDate: string;
  onCancel: () => void;
  onCreated: (timeBlock: TimeBlock) => void;
};

/** Converts the form into the UTC interval the API expects; returns a message when invalid. */
export function getBlockInterval(
  fields: Pick<BlockFields, "date" | "wholeDay" | "startTime" | "endTime">,
): { startAt: string; endAt: string } | string {
  try {
    if (fields.wholeDay) return getLocalDayBounds(fields.date);
    const startAt = localDateTimeToUtc(fields.date, fields.startTime);
    const endAt = localDateTimeToUtc(fields.date, fields.endTime);
    if (Date.parse(endAt) <= Date.parse(startAt))
      return "O horário final deve ser depois do inicial.";
    return { startAt, endAt };
  } catch {
    return "Confira a data e os horários informados.";
  }
}

export function BlockForm({ defaultDate, onCancel, onCreated }: BlockFormProps) {
  const form = useForm<BlockFields>({
    defaultValues: {
      date: defaultDate,
      wholeDay: false,
      startTime: "12:00",
      endTime: "13:00",
      reason: "",
    },
  });
  const wholeDay = useWatch({ control: form.control, name: "wholeDay" });
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());

  async function submit(fields: BlockFields) {
    const interval = getBlockInterval(fields);
    if (typeof interval === "string") {
      setMessage(interval);
      return;
    }
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const reason = fields.reason.trim();
      const response = await fetchAdmin("/api/admin/time-blocks", {
        body: JSON.stringify({ requestId, ...interval, ...(reason ? { reason } : {}) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setMessage(await readAgendaError(response, "Não foi possível bloquear o horário."));
        return;
      }
      const data = (await response.json()) as { timeBlock: TimeBlock };
      onCreated(data.timeBlock);
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível bloquear o horário."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-labelledby="block-form-title"
      className="agenda-form"
      onSubmit={form.handleSubmit(submit)}
    >
      <h2 id="block-form-title">Bloquear horário</h2>
      <p className="agenda-hint">
        Bloqueios valem para um dia. Horários já ocupados não podem ser bloqueados.
      </p>
      <label>
        Data
        <input required type="date" {...form.register("date")} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" {...form.register("wholeDay")} /> Dia inteiro
      </label>
      {!wholeDay ? (
        <div className="agenda-form-grid">
          <label>
            Início
            <input required step={60} type="time" {...form.register("startTime")} />
          </label>
          <label>
            Fim
            <input required step={60} type="time" {...form.register("endTime")} />
          </label>
        </div>
      ) : null}
      <label>
        Motivo (opcional)
        <input maxLength={200} placeholder="Ex.: consulta médica" {...form.register("reason")} />
      </label>
      {message ? <p role="alert">{message}</p> : null}
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
          {isSubmitting ? "Salvando…" : "Bloquear"}
        </button>
      </div>
    </form>
  );
}

type AttendanceFields = PaymentFields & { recordNow: boolean };

type AttendanceFormProps = {
  appointment: Appointment;
  /** "complete" concludes the appointment (payment optional); "payment" records/corrects it. */
  mode: "complete" | "payment";
  onCancel: () => void;
  onSaved: (appointment: Appointment) => void;
};

export function AttendanceForm({ appointment, mode, onCancel, onSaved }: AttendanceFormProps) {
  const form = useForm<AttendanceFields>({
    defaultValues: { ...getDefaultPaymentFields(appointment), recordNow: true },
  });
  const recordNow = useWatch({ control: form.control, name: "recordNow" });
  const showPayment = mode === "payment" || recordNow;
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = `attendance-${appointment.id}`;

  async function submit(fields: AttendanceFields) {
    const payment = showPayment ? buildPaymentInput(fields) : undefined;
    if (typeof payment === "string") {
      setMessage(payment);
      return;
    }
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const base = `/api/admin/appointments/${encodeURIComponent(appointment.id)}`;
      const response = await fetchAdmin(
        mode === "complete" ? `${base}/complete` : `${base}/payment`,
        {
          body: JSON.stringify(mode === "complete" ? (payment ? { payment } : {}) : payment),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        setMessage(await readAgendaError(response, "Não foi possível salvar."));
        return;
      }
      const data = (await response.json()) as { appointment: Appointment };
      onSaved(data.appointment);
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível salvar."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-labelledby={titleId}
      className="agenda-form attendance-form"
      onSubmit={form.handleSubmit(submit)}
    >
      <h3 id={titleId}>
        {mode === "complete" ? "Concluir atendimento" : "Registrar pagamento"} —{" "}
        {appointment.client.name}
      </h3>
      {mode === "complete" ? (
        <label className="checkbox-label">
          <input type="checkbox" {...form.register("recordNow")} /> Registrar pagamento agora
        </label>
      ) : null}
      {showPayment ? (
        <>
          <div className="agenda-form-grid">
            <label>
              Valor final (R$)
              <input inputMode="decimal" required {...form.register("finalPrice")} />
            </label>
            <label>
              Valor pago (R$)
              <input inputMode="decimal" placeholder="0,00" {...form.register("paidPrice")} />
            </label>
          </div>
          <label>
            Forma de pagamento
            <select {...form.register("method")}>
              <option value="">Selecione</option>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </label>
          <p className="agenda-hint">
            Só entra no total recebido quando o valor pago cobre o valor final.
          </p>
        </>
      ) : (
        <p className="agenda-hint">O pagamento pode ser registrado depois.</p>
      )}
      {message ? <p role="alert">{message}</p> : null}
      <div className="service-form-actions">
        <button
          className="secondary-button"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Voltar
        </button>
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Salvando…" : mode === "complete" ? "Concluir" : "Salvar pagamento"}
        </button>
      </div>
    </form>
  );
}

type RescheduleFields = {
  serviceId: string;
  date: string;
  startAt: string;
  useCustomTime: boolean;
  customTime: string;
};

type ReschedulePayload = { startAt: string; serviceId?: string };

type RescheduleFormProps = {
  appointment: Appointment;
  onCancel: () => void;
  onSaved: (appointment: Appointment) => void;
};

/** Moves an appointment and/or changes its service (RF-ATE-01). */
export function RescheduleForm({ appointment, onCancel, onSaved }: RescheduleFormProps) {
  const current = appointment.serviceSnapshot;
  const form = useForm<RescheduleFields>({
    defaultValues: {
      serviceId: current.serviceId,
      date: appointment.localDate,
      startAt: "",
      useCustomTime: false,
      customTime: "",
    },
  });
  const { control, setValue } = form;
  const serviceId = useWatch({ control, name: "serviceId" });
  const date = useWatch({ control, name: "date" });
  const useCustomTime = useWatch({ control, name: "useCustomTime" });
  const { services } = useBookableServices();
  const { availability, queryKey, refresh } = useAvailability(serviceId, date, appointment.id);
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pending, setPending] = useState<
    PendingOverride<ReschedulePayload> & { formKey: string }
  >();
  const titleId = `reschedule-${appointment.id}`;
  const otherServices = services?.filter((service) => service.id !== current.serviceId) ?? [];

  useEffect(() => {
    setValue("startAt", "");
  }, [queryKey, setValue]);

  // Any edit invalidates the exception the professional was asked to confirm.
  const formKey = JSON.stringify(useWatch({ control }));
  const activePending = pending?.formKey === formKey ? pending : undefined;

  async function send(payload: ReschedulePayload, allowExceptions: boolean) {
    setIsSubmitting(true);
    setMessage(undefined);
    try {
      const response = await fetchAdmin(
        `/api/admin/appointments/${encodeURIComponent(appointment.id)}/reschedule`,
        {
          body: JSON.stringify({
            ...payload,
            ...(allowExceptions ? { allowExceptions: true } : {}),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        const overridable = allowExceptions
          ? undefined
          : parseOverridableError(response.status, body);
        if (overridable) {
          setPending({
            ...createPendingOverride(overridable, payload, () => crypto.randomUUID()),
            formKey,
          });
          return;
        }
        setPending(undefined);
        if (body?.code === "CONFLICT") refresh();
        setMessage(getAgendaErrorMessage(body, "Não foi possível reagendar."));
        return;
      }
      const data = (await response.json()) as { appointment: Appointment };
      onSaved(data.appointment);
    } catch (error) {
      setMessage(toUserMessage(error, "Não foi possível reagendar."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(fields: RescheduleFields) {
    const start = resolveStartAt(fields);
    if ("error" in start) {
      setMessage(start.error);
      return;
    }
    await send(
      {
        startAt: start.startAt,
        ...(fields.serviceId !== current.serviceId ? { serviceId: fields.serviceId } : {}),
      },
      false,
    );
  }

  return (
    <form aria-labelledby={titleId} className="agenda-form" onSubmit={form.handleSubmit(submit)}>
      <h3 id={titleId}>Reagendar — {appointment.client.name}</h3>
      <div className="agenda-form-grid">
        <label>
          Serviço
          <select required {...form.register("serviceId")}>
            <option value={current.serviceId}>
              {current.name} (atual) · {current.durationMinutes} min
            </option>
            {otherServices.map((service) => (
              <option key={service.id} value={service.id}>
                {serviceLabel(service)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nova data
          <input required type="date" {...form.register("date")} />
        </label>
      </div>
      <SlotPicker
        availability={availability}
        customTime={form.register("customTime")}
        customToggle={form.register("useCustomTime")}
        hint={
          serviceId === current.serviceId
            ? "Mantém a duração e o preço já informados à cliente."
            : "Trocar o serviço atualiza duração e preço inicial."
        }
        onRetry={refresh}
        registration={form.register("startAt")}
        useCustomTime={useCustomTime}
      />
      <p className="agenda-hint">
        Lembrete e confirmação de presença voltam a ficar pendentes quando o horário muda.
      </p>
      {message ? <p role="alert">{message}</p> : null}
      {activePending ? (
        <ExceptionNotice
          isSubmitting={isSubmitting}
          onBack={() => setPending(undefined)}
          onConfirm={() => void send(activePending.payload, true)}
          warning={activePending.error.warning}
        />
      ) : (
        <div className="service-form-actions">
          <button
            className="secondary-button"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Voltar
          </button>
          <button
            disabled={isSubmitting || !canChooseStart(availability, useCustomTime, serviceId, date)}
            type="submit"
          >
            {isSubmitting ? "Salvando…" : "Salvar novo horário"}
          </button>
        </div>
      )}
    </form>
  );
}
