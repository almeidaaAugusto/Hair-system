# Modelo Firestore proposto

> Este é um modelo técnico inicial, não um contrato final. As coleções e campos abaixo são hipóteses até a implementação e as decisões em aberto serem resolvidas.

## Requisitos confirmados que orientam o modelo

- Todo documento de negócio precisa de `salonId`.
- Agendamentos devem preservar snapshots do serviço, duração e preço.
- Datas são instantes UTC; a interface apresenta `America/Sao_Paulo`.
- Valores monetários são centavos inteiros.
- O cliente não pode escrever diretamente em `appointments`; confirmação de horário exige transação.
- Cancelamentos liberam disponibilidade, e não pode haver conflito por profissional.
- Atendimento concluído e pago é a condição para entrar nos totais recebidos.

## Hipóteses técnicas

### Coleções

| Coleção             | Campos principais propostos                                                                                      | Finalidade                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `salons`            | `id`, `name`, `timezone`                                                                                         | Identidade do salão e timezone padrão.                                       |
| `services`          | `salonId`, `name`, `durationMinutes`, `startingPriceCents`, `hasVariablePrice`, `requiresEvaluation`, `isActive` | Catálogo administrativo.                                                     |
| `professionals`     | `salonId`, `name`, `active`                                                                                      | Profissional; há uma no MVP, mas a referência previne reestruturação futura. |
| `businessHours`     | `salonId`, `professionalId`, `weekday`, `startLocalTime`, `endLocalTime`, `timezone`                             | Expediente configurável.                                                     |
| `timeBlocks`        | `salonId`, `professionalId`, `startAt`, `endAt`, `reason`, `status`                                              | Bloqueios de agenda.                                                         |
| `appointments`      | ver abaixo                                                                                                       | Registro operacional e histórico do atendimento.                             |
| `paymentRecords`    | `salonId`, `appointmentId`, `amountCents`, `method`, `paidAt`                                                    | Pagamentos e valores em aberto.                                              |
| `messageDeliveries` | `salonId`, `appointmentId`, `type`, `scheduledAt`, `sentAt`, `status`, `idempotencyKey`                          | Controle de mensagens e prevenção de lembrete duplicado.                     |

### Documento `appointments`

```text
salonId, professionalId
startAt, endAt, occupiedUntilAt       // Timestamp UTC
status                                // hipótese: pending_evaluation | confirmed | completed | cancelled | no_show
client { name, phone?, ... }          // campos finais dependem da política de privacidade
serviceSnapshot { serviceId, name, durationMinutes, startingPriceCents,
                  requiresEvaluation }
pricing { quotedPriceCents?, finalPriceCents? }
paymentSummary { paidCents, outstandingCents, isPaid }
source                                // public_booking | whatsapp_manual | admin
createdAt, updatedAt, cancelledAt?
```

`occupiedUntilAt` representa `endAt` mais o intervalo configurado e deve ser usado na verificação de conflito. O formato de `client` e a presença de foto ficam pendentes de decisão de privacidade e armazenamento.

### Acesso e consistência

- Regras do Firestore: leitura e escrita administrativas exigem autenticação e escopo do salão; escrita pública em `appointments` é negada.
- Funções de servidor: validam Zod, fazem a transação de disponibilidade, gravam snapshots e aplicam transições de status.
- Consultas de agenda devem ser filtradas por `salonId`, `professionalId` e intervalo de `startAt`; os índices necessários serão definidos a partir das consultas concretas.
- Totais podem ser calculados por consulta no MVP ou materializados posteriormente; a fonte de verdade continua sendo pagamento/estado do atendimento.

## Perguntas ainda abertas

- `businessHours` será um documento por dia da semana, uma configuração consolidada ou terá exceções por data?
- Como modelar avaliação: `pending_evaluation` dentro de `appointments` ou uma coleção de solicitações separada?
- Pagamento parcial precisa de vários `paymentRecords`? Como distinguir pagamento autorizado, recebido e estornado?
- Qual é o formato mínimo de cliente e como foto/histórico serão associados sem expor dados pessoais?
- Cancelamentos e faltas serão mantidos em `appointments` para histórico ou replicados em uma auditoria de eventos?
- Quais consultas exigirão índices compostos e qual será a retenção de `messageDeliveries`?

## Itens fora do MVP

- Coleções e fluxos de pagamento online, estoque, despesas, lucro, comissões e fidelidade.
- Perfil autenticado de cliente e dados de aplicativo mobile.
- Modelo definitivo de múltiplos salões ou múltiplas profissionais; os identificadores existentes apenas preservam compatibilidade de evolução.
