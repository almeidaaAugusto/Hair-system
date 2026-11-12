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

| Coleção             | Campos principais propostos                                                                                                                | Finalidade                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `salons`            | `id`, `name`, `timezone`                                                                                                                   | Identidade do salão e timezone padrão.                                       |
| `services`          | `salonId`, `name`, `durationMinutes`, `startingPriceCents`, `hasVariablePrice`, `requiresEvaluation`, `isActive`, `createdAt`, `updatedAt` | Catálogo administrativo; timestamps são mantidos pelo servidor.              |
| `professionals`     | `salonId`, `name`, `active`                                                                                                                | Profissional; há uma no MVP, mas a referência previne reestruturação futura. |
| `businessHours`     | `salonId`, `professionalId`, `timezone`, `appointmentIntervalMinutes`, `weeklyHours`                                                       | Expediente configurável por profissional.                                    |
| `timeBlocks`        | `salonId`, `professionalId`, `startAt`, `endAt`, `reason`, `status`                                                                        | Bloqueios de agenda.                                                         |
| `appointments`      | ver abaixo                                                                                                                                 | Registro operacional e histórico do atendimento.                             |
| `paymentRecords`    | `salonId`, `appointmentId`, `amountCents`, `method`, `paidAt`                                                                              | Pagamentos e valores em aberto.                                              |
| `messageDeliveries` | `salonId`, `appointmentId`, `type`, `scheduledAt`, `sentAt`, `status`, `idempotencyKey`                                                    | Controle de mensagens e prevenção de lembrete duplicado.                     |

### Documento `appointments`

```text
salonId, professionalId, localDate
startAt, endAt, occupiedUntilAt       // Timestamp UTC
status                                // confirmed | cancelled
client { name, phone }
serviceSnapshot { serviceId, name, durationMinutes, startingPriceCents,
                  hasVariablePrice, requiresEvaluation }
appointmentIntervalMinutes, source    // manual | whatsapp
createdBy, updatedBy, createdAt, updatedAt, cancelledAt?
```

`occupiedUntilAt` inclui o intervalo configurado e participa da verifica??o de conflito. Foto e hist?rico de cliente ficam para outra entrega.

### Documento `businessHours`

Há um documento por par `salonId` e `professionalId`. No MVP, o único identificador interno de profissional é `primary`; a interface não permite escolher ou cadastrar profissionais. O documento contém o fuso `America/Sao_Paulo`, o intervalo entre atendimentos em minutos e um mapa `weeklyHours` com segunda a domingo. Cada dia possui `isOpen`, `startLocalTime` e `endLocalTime` no formato `HH:mm`.

Esse formato mantém a atualização semanal atômica e permite criar outro documento quando houver mais de uma profissional, sem migrar a configuração já existente.

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

## Agenda administrativa implementada

`appointments` e `timeBlocks` t?m `salonId`, `professionalId` (`primary`), `localDate`, instantes UTC, autoria, timestamps e status. A reserva guarda contato m?nimo, origem `manual` ou `whatsapp`, snapshots do servi?o e intervalo; o cancelamento preserva o hist?rico. A consulta di?ria filtra sal?o, profissional e data local e ordena por in?cio, com ?ndices compostos para ambas as cole??es. Acesso direto do cliente ? negado.

Cada muta??o l? primeiro e atualiza transacionalmente `appointmentDayLocks`, identificado por sal?o, profissional e dia, serializando inclusive o primeiro registro do dia. IDs de cria??o derivam de SHA-256 do sal?o, comando e UUID; fingerprint do conte?do normalizado detecta reutiliza??o divergente. Reenvio igual retorna o registro existente, mesmo cancelado; cancelamentos repetidos preservam o primeiro instante.
