"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import type { CreateServiceInput, Service } from "@/domain/services/service";
import { AdminLoginForm, type AdminLoginFields } from "@/features/admin-auth/admin-login-form";
import { getClientAuth } from "@/features/admin-services/firebase-client";
import { formatBrazilianReal, parseBrazilianRealToCents } from "@/features/admin-services/money";

type ServiceFormFields = Omit<CreateServiceInput, "startingPriceCents"> & { startingPrice: string };

type ServiceFormProps = {
  initialService?: Service;
  isSubmitting: boolean;
  onCancel: () => void;
  onInvalidPrice: () => void;
  onSubmit: (input: CreateServiceInput) => Promise<void>;
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a operação.";
}

function ServiceForm({
  initialService,
  isSubmitting,
  onCancel,
  onInvalidPrice,
  onSubmit,
}: ServiceFormProps) {
  const form = useForm<ServiceFormFields>({
    defaultValues: initialService
      ? { ...initialService, startingPrice: formatBrazilianReal(initialService.startingPriceCents) }
      : {
          durationMinutes: 60,
          hasVariablePrice: false,
          isActive: true,
          name: "",
          requiresEvaluation: false,
          startingPrice: "",
        },
  });
  const isEditing = Boolean(initialService);
  const { setFocus } = form;

  useEffect(() => {
    setFocus("name");
  }, [setFocus]);

  async function submit(fields: ServiceFormFields) {
    const startingPriceCents = parseBrazilianRealToCents(fields.startingPrice);
    if (startingPriceCents === undefined) {
      onInvalidPrice();
      return;
    }
    await onSubmit({
      durationMinutes: fields.durationMinutes,
      hasVariablePrice: fields.hasVariablePrice,
      isActive: fields.isActive,
      name: fields.name,
      requiresEvaluation: fields.requiresEvaluation,
      startingPriceCents,
    });
  }

  return (
    <form className="service-form" onSubmit={form.handleSubmit(submit)}>
      <h2>{isEditing ? "Editar serviço" : "Novo serviço"}</h2>
      <label>
        Nome
        <input required maxLength={120} {...form.register("name", { required: true })} />
      </label>
      <div className="service-form-grid">
        <label>
          Duração (minutos)
          <input
            type="number"
            min={1}
            max={1440}
            step={1}
            required
            {...form.register("durationMinutes", { min: 1, max: 1440, valueAsNumber: true })}
          />
        </label>
        <label>
          Preço inicial (R$)
          <input
            inputMode="decimal"
            placeholder="Ex.: 120,00"
            required
            {...form.register("startingPrice", { required: true })}
          />
        </label>
      </div>
      <div className="service-options">
        <label className="checkbox-label">
          <input type="checkbox" {...form.register("hasVariablePrice")} /> Preço variável
        </label>
        <label className="checkbox-label">
          <input type="checkbox" {...form.register("requiresEvaluation")} /> Exige avaliação
        </label>
        <label className="checkbox-label">
          <input type="checkbox" {...form.register("isActive")} /> Serviço ativo
        </label>
      </div>
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
          {isSubmitting ? "Salvando…" : isEditing ? "Salvar alterações" : "Cadastrar serviço"}
        </button>
      </div>
    </form>
  );
}

export function ServicesAdminPage() {
  const [token, setToken] = useState<string>();
  const [services, setServices] = useState<Service[]>([]);
  const [message, setMessage] = useState<string>();
  const [editingService, setEditingService] = useState<Service>();
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [restoreFocusId, setRestoreFocusId] = useState<string>();
  const formIsVisible = isCreating || Boolean(editingService);

  function closeServiceForm(fallbackFocusId?: string) {
    const focusId = fallbackFocusId ?? restoreFocusId;
    setEditingService(undefined);
    setIsCreating(false);
    setRestoreFocusId(undefined);

    if (focusId) {
      requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    }
  }

  function startCreating(focusId: string) {
    setRestoreFocusId(focusId);
    setEditingService(undefined);
    setIsCreating(true);
  }

  function startEditing(service: Service) {
    setRestoreFocusId(`edit-${service.id}`);
    setEditingService(service);
    setIsCreating(false);
  }

  async function loadServices(currentToken: string): Promise<void> {
    setIsLoadingServices(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/services", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { services: Service[] };
      setServices(data.services.sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setIsLoadingServices(false);
    }
  }

  async function login(fields: AdminLoginFields) {
    setIsSaving(true);
    setMessage(undefined);
    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        fields.email,
        fields.password,
      );
      const currentToken = await credential.user.getIdToken(true);
      await loadServices(currentToken);
      setToken(currentToken);
    } catch {
      setMessage("Não foi possível iniciar a sessão administrativa.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveService(input: CreateServiceInput) {
    if (!token) return;
    const currentService = editingService;
    setIsSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(
        currentService ? `/api/admin/services/${currentService.id}` : "/api/admin/services",
        {
          body: JSON.stringify(input),
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          method: currentService ? "PATCH" : "POST",
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { service: Service };
      setServices((current) =>
        (currentService
          ? current.map((service) => (service.id === data.service.id ? data.service : service))
          : [...current, data.service]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      closeServiceForm(currentService ? undefined : "new-service");
      setMessage(
        currentService ? "Serviço atualizado com sucesso." : "Serviço cadastrado com sucesso.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o serviço.");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeActiveStatus(service: Service) {
    if (!token) return;
    if (
      service.isActive &&
      !window.confirm(
        `Desativar “${service.name}”? Ele deixará de aparecer para novos agendamentos.`,
      )
    )
      return;
    setIsSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        body: JSON.stringify({ isActive: !service.isActive }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { service: Service };
      setServices((current) =>
        current.map((currentService) =>
          currentService.id === data.service.id ? data.service : currentService,
        ),
      );
      setMessage(service.isActive ? "Serviço desativado." : "Serviço reativado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o serviço.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!token)
    return (
      <AdminLoginForm
        description="Entre para cadastrar e consultar serviços."
        isLoading={isSaving}
        message={message}
        onSubmit={login}
      />
    );

  return (
    <main className="admin-page">
      <section className="card services-card" aria-labelledby="services-title">
        <nav className="admin-nav" aria-label="Administração">
          <a href="/admin/business-hours">Configurar expediente</a>
        </nav>
        <div className="services-heading">
          <div>
            <h1 id="services-title">Serviços</h1>
            <p>Organize duração, preço e disponibilidade do seu atendimento.</p>
          </div>
          {!formIsVisible ? (
            <button id="new-service" onClick={() => startCreating("new-service")} type="button">
              Novo serviço
            </button>
          ) : null}
        </div>
        {message ? (
          <p aria-live="polite" role="status">
            {message}
          </p>
        ) : null}
        {formIsVisible ? (
          <ServiceForm
            initialService={editingService}
            isSubmitting={isSaving}
            key={editingService?.id ?? "new"}
            onCancel={closeServiceForm}
            onInvalidPrice={() => setMessage("Informe o preço como 120,00 ou 1.234,56.")}
            onSubmit={saveService}
          />
        ) : null}
        <section aria-labelledby="services-list-title" className="services-list-section">
          <h2 id="services-list-title">Serviços cadastrados</h2>
          {isLoadingServices ? <p role="status">Carregando serviços…</p> : null}
          {!isLoadingServices && services.length === 0 ? (
            <div className="services-empty">
              <p>Nenhum serviço cadastrado ainda.</p>
              <button
                id="first-service"
                onClick={() => startCreating("first-service")}
                type="button"
              >
                Cadastrar primeiro serviço
              </button>
            </div>
          ) : null}
          {!isLoadingServices && services.length > 0 ? (
            <ul className="services-list">
              {services.map((service) => (
                <li className="service-item" key={service.id}>
                  <div className="service-item-summary">
                    <h3>{service.name}</h3>
                    <p>
                      {service.durationMinutes} min ·{" "}
                      {formatBrazilianReal(service.startingPriceCents)}
                    </p>
                    <div
                      aria-label={`Indicadores de ${service.name}`}
                      className="service-indicators"
                    >
                      {service.hasVariablePrice ? <span>Preço variável</span> : null}
                      {service.requiresEvaluation ? <span>Exige avaliação</span> : null}
                      <span className={service.isActive ? "status-active" : "status-inactive"}>
                        {service.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                  <div className="service-item-actions">
                    <button
                      className="secondary-button"
                      disabled={isSaving}
                      id={`edit-${service.id}`}
                      onClick={() => startEditing(service)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className={service.isActive ? "danger-button" : "secondary-button"}
                      disabled={isSaving}
                      onClick={() => changeActiveStatus(service)}
                      type="button"
                    >
                      {service.isActive ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </section>
    </main>
  );
}
