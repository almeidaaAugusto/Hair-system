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
status                                // confirmed | completed | no_show | cancelled
client { name, phone }
serviceSnapshot { serviceId, name, durationMinutes, startingPriceCents,
                  hasVariablePrice, requiresEvaluation }
appointmentIntervalMinutes, source    // manual | whatsapp
createdBy, updatedBy, createdAt, updatedAt
cancelledAt?, completedAt?, noShowAt?  // Timestamp UTC, presente conforme o status
payment? { finalPriceCents, paidCents, method? }  // só em completed; centavos inteiros
paymentUpdatedAt?                     // Timestamp UTC da última gravação do pagamento
reminderSentAt?, clientConfirmedAt?   // Timestamp UTC; gravados uma vez, removidos ao mudar o horário
```

`occupiedUntilAt` inclui o intervalo configurado e participa da verificação de conflito. Foto e histórico de cliente ficam para outra entrega.

### Documento `businessHours`

Há um documento por par `salonId` e `professionalId`. No MVP, o único identificador interno de profissional é `primary`; a interface não permite escolher ou cadastrar profissionais. O documento contém o fuso `America/Sao_Paulo`, o intervalo entre atendimentos em minutos e um mapa `weeklyHours` com segunda a domingo. Cada dia possui `isOpen`, `startLocalTime` e `endLocalTime` no formato `HH:mm`.

Esse formato mantém a atualização semanal atômica e permite criar outro documento quando houver mais de uma profissional, sem migrar a configuração já existente.

### Acesso e consistência

- Regras do Firestore: leitura e escrita administrativas exigem autenticação e escopo do salão; escrita pública em `appointments` é negada.
- Funções de servidor: validam Zod, fazem a transação de disponibilidade, gravam snapshots e aplicam transições de status.
- Consultas de agenda devem ser filtradas por `salonId`, `professionalId` e intervalo de `startAt`; os índices necessários serão definidos a partir das consultas concretas.
- Totais podem ser calculados por consulta no MVP ou materializados posteriormente; a fonte de verdade continua sendo pagamento/estado do atendimento.

## Perguntas ainda abertas

- Como futuras exceções por data serão representadas além da configuração semanal consolidada?
- Como modelar avaliação: `pending_evaluation` dentro de `appointments` ou uma coleção de solicitações separada?
- Pagamento dividido em várias formas ou parcelas exigirá `paymentRecords` separados? No MVP o pagamento é um único registro dentro do atendimento.
- Como foto e histórico serão associados ao cliente sem expor dados pessoais?
- Como registrar auditoria de eventos (histórico de alterações de pagamento) em futuras entregas?
- Qual será a retenção de `messageDeliveries`?

## Itens fora do MVP

- Coleções e fluxos de pagamento online, estoque, despesas, lucro, comissões e fidelidade.
- Perfil autenticado de cliente e dados de aplicativo mobile.
- Modelo definitivo de múltiplos salões ou múltiplas profissionais; os identificadores existentes apenas preservam compatibilidade de evolução.

## Agenda administrativa implementada

`appointments` e `timeBlocks` têm `salonId`, `professionalId` (`primary`), `localDate`, instantes UTC, autoria, timestamps e status. A reserva guarda contato mínimo, origem `manual` ou `whatsapp`, snapshots do serviço e intervalo; o cancelamento preserva o histórico. A consulta diária filtra salão, profissional e data local e ordena por início, com índices compostos para ambas as coleções. Acesso direto do cliente é negado.

Cada mutação lê primeiro e atualiza transacionalmente `appointmentDayLocks`, identificado por salão, profissional e dia, serializando inclusive o primeiro registro do dia. IDs de criação derivam de SHA-256 do salão, comando e UUID; fingerprint do conteúdo normalizado detecta reutilização divergente. Reenvio igual retorna o registro existente, mesmo cancelado; cancelamentos repetidos preservam o primeiro instante.

## Conclusão, falta e pagamento implementados

Os estados operacionais são `confirmed → completed | no_show | cancelled`; concluído e falta são finais e não podem ser cancelados. Concluir ou marcar falta só é aceito a partir de `startAt`. Concluído e falta continuam ocupando o período; só o cancelamento o libera.

O pagamento fica embutido no atendimento (`payment`), sem a coleção `paymentRecords` neste marco: valor final, valor pago (nunca maior que o final) e forma (`pix`, `cash`, `debit`, `credit`, obrigatória quando há valor pago). O saldo e o status financeiro (`not_recorded`, `unpaid`, `partial`, `paid`) são derivados, nunca gravados. Registrar novamente substitui o pagamento anterior (correção). O total recebido soma apenas atendimentos concluídos e integralmente pagos (RN-12).

Esses comandos não alteram a ocupação do dia, por isso a transação lê e grava apenas o documento do atendimento; um cancelamento simultâneo também grava esse documento, e o Firestore serializa os dois.
