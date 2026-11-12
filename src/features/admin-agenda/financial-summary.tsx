import type { Appointment, PaymentMethod } from "@/domain/appointments/appointment";
import { summarizeFinancials } from "@/domain/appointments/attendance";
import { formatBrazilianReal } from "@/features/admin-services/money";

import { paymentMethodLabels } from "./agenda-finance";

type FinancialSummaryPanelProps = {
  appointments: readonly Appointment[];
  periodLabel: string;
};

export function FinancialSummaryPanel({ appointments, periodLabel }: FinancialSummaryPanelProps) {
  const summary = summarizeFinancials(appointments);
  const methods = (Object.keys(paymentMethodLabels) as PaymentMethod[]).filter(
    (method) => summary.byMethod[method] > 0,
  );

  return (
    <section aria-labelledby="financial-summary-title" className="financial-summary">
      <h2 id="financial-summary-title">Financeiro {periodLabel}</h2>
      <dl className="financial-tiles">
        <div>
          <dt>Recebido</dt>
          <dd>{formatBrazilianReal(summary.receivedCents)}</dd>
          <dd className="agenda-hint">{summary.receivedCount} atendimento(s) pagos</dd>
        </div>
        <div>
          <dt>Em aberto</dt>
          <dd>{formatBrazilianReal(summary.openBalanceCents)}</dd>
          <dd className="agenda-hint">{summary.openCount} atendimento(s) com saldo</dd>
        </div>
        <div>
          <dt>Sem pagamento registrado</dt>
          <dd>{summary.withoutPaymentCount}</dd>
          <dd className="agenda-hint">de {summary.completedCount} concluído(s)</dd>
        </div>
        <div>
          <dt>Faltas</dt>
          <dd>{summary.noShowCount}</dd>
          <dd className="agenda-hint">{summary.cancelledCount} cancelado(s)</dd>
        </div>
      </dl>
      <p className="agenda-hint">
        O total recebido considera apenas atendimentos concluídos e integralmente pagos.
      </p>
      {summary.receivedCount > 0 ? (
        <div className="financial-breakdown">
          <div>
            <h3>Por forma de pagamento</h3>
            <ul>
              {methods.map((method) => (
                <li key={method}>
                  <span>{paymentMethodLabels[method]}</span>
                  <strong>{formatBrazilianReal(summary.byMethod[method])}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Por serviço</h3>
            <ul>
              {summary.byService.map((service) => (
                <li key={service.serviceId}>
                  <span>
                    {service.name} ({service.count})
                  </span>
                  <strong>{formatBrazilianReal(service.receivedCents)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
