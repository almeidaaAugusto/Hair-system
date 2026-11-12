# Disponibilidade e reservas administrativas

## Objetivo e autorização

Implementar o próximo marco solicitado: calcular disponibilidade, impedir conflitos e persistir reservas com segurança. A entrega consiste nas APIs administrativas que alimentarão a agenda, com testes reais de concorrência no emulador. O usuário autorizou avançar após a conclusão da autenticação. As decisões técnicas abaixo são escolhas de implementação, não novas decisões atribuídas à profissional.

Fontes: `agents.md`, documentos em `docs/product`, `Documento_de_Requisitos_MVP_Sistema_de_Agendamento.docx` (RN-01/02/14/15, RF-AGD-02/03/05/06, CA-03/04/06) e `Casos_de_Uso_MVP_Sistema_de_Agendamento.docx` (UC-04/06/12). Os documentos-base esclarecem que não há antecedência mínima/máxima artificial, cancelamentos são efetivados pela profissional e bloqueios são manuais simples.

## Abordagem

Usar domínio TypeScript puro, repositório Firestore transacional e Route Handlers Node autenticados. Esta abordagem preserva os padrões atuais e usa o backend confiável equivalente permitido pelo documento de requisitos. Criar infraestrutura independente de Cloud Functions agora acrescentaria implantação e autenticação entre serviços sem necessidade para as APIs administrativas; a extração futura continua possível porque as regras não pertencem aos handlers. A decisão será registrada na arquitetura.

As janelas livres são retornadas com primeiro e último início possíveis. Assim não se confunde o intervalo de limpeza com uma grade artificial de sugestões. Uma camada futura pode escolher como apresentar essas janelas.

## Escopo

- Consultar disponibilidade de um serviço ativo e elegível para uma data local.
- Criar reserva administrativa com origem `manual` ou `whatsapp`, nome e telefone.
- Listar reservas e bloqueios de um dia, incluindo cancelados para histórico.
- Cancelar reserva, preservando o registro e liberando sua ocupação.
- Criar e cancelar bloqueio simples de um dia; um dia inteiro é permitido.
- Reenvios de criação usam UUID de requisição: repetição igual retorna o mesmo registro; conteúdo diferente com a mesma chave é conflito.

O fluxo público, avaliação/fotos, cadastro separado de clientes, edição/reagendamento, conclusão/falta, pagamentos, WhatsApp e visões de calendário ficam nas entregas seguintes. Nome e telefone são snapshots mínimos do contato da reserva, não um novo cadastro de clientes. Serviços inativos ou que exigem avaliação são recusados neste comando de confirmação.

## Regras

1. Uma profissional interna `primary`, com salão derivado exclusivamente das claims verificadas.
2. Instantes externos ISO UTC, com precisão de minuto; representação canônica `toISOString()`. Persistência em `Timestamp` UTC. Data local e dia da semana usam `America/Sao_Paulo`, nunca o fuso do processo nem um offset fixo.
3. Ocupação semiaberta `[startAt, occupiedUntilAt)`, onde `endAt = startAt + duração` e `occupiedUntilAt = endAt + intervalo configurado`. Adjacência exata é permitida.
4. Toda a ocupação, incluindo intervalo, cabe no expediente. Com 60 minutos de serviço, 10 de intervalo e fechamento às 20h, o último início é 18h50.
5. Configuração ausente usa exatamente os padrões já adotados pelo módulo de expediente. Alterações futuras não recalculam snapshots de reservas anteriores.
6. Reservas `confirmed` e bloqueios `active` ocupam tempo. Registros `cancelled` não ocupam. Cancelar novamente é idempotente e não modifica a data do primeiro cancelamento.
7. Bloqueio deve ter início anterior ao fim e caber em um único dia local; o fim pode coincidir com a próxima meia-noite. Um bloqueio não cria intervalo de limpeza adicional. Bloqueios que colidem com reservas ou bloqueios ativos são recusados. Períodos de vários dias serão compostos por bloqueios diários em uma futura interface.
8. Não criar regras de antecedência. A consulta trata a data pedida e a gravação revalida disponibilidade; não introduzir fluxo público por essa ausência de limite.
9. Dados de salão, profissional, status, duração e preço não são aceitos do navegador. Disponibilidade não retorna dados de clientes.
10. Nenhum dado pessoal, token ou conteúdo de requisição aparece em logs ou mensagens de erro inesperadas.

## Contratos do domínio

Arquivos em `src/domain/appointments/`: `appointment.ts` (schemas, registros e erros), `local-date.ts` (datas/fuso), `availability.ts` (janelas e construção de reservas/bloqueios).

- `CreateAppointmentInput`: `{ requestId: UUID, serviceId: string, startAt: string, client: { name: string, phone: string }, source: "manual" | "whatsapp" }`.
- `CreateTimeBlockInput`: `{ requestId: UUID, startAt: string, endAt: string, reason?: string }`.
- Schemas estritos `createAppointmentInputSchema`, `createTimeBlockInputSchema`, `dayQuerySchema` (`{ date }`) e `availabilityQuerySchema` (`{ date, serviceId }`). Telefone admite pontuação usual, normaliza para 10–15 dígitos e não inventa código de país; nome com 1–120 caracteres, motivo até 200. IDs de documentos sem `/` e com até 128 caracteres.
- `Appointment`: `id`, `salonId`, `professionalId`, `localDate`, `startAt`, `endAt`, `occupiedUntilAt`, `status: "confirmed" | "cancelled"`, `client`, `serviceSnapshot`, `appointmentIntervalMinutes`, `source`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `cancelledAt?`.
- `serviceSnapshot`: `serviceId`, `name`, `durationMinutes`, `startingPriceCents`, `hasVariablePrice`, `requiresEvaluation`.
- `TimeBlock`: `id`, `salonId`, `professionalId`, `localDate`, `startAt`, `endAt`, `status: "active" | "cancelled"`, `reason?`, mesma autoria/timestamps.
- Schemas de leitura `appointmentSchema` e `timeBlockSchema` validam os registros já convertidos para strings UTC pelo adaptador.
- `AppointmentRuleError(code, message)` com códigos `NOT_FOUND`, `SERVICE_UNAVAILABLE`, `OUTSIDE_BUSINESS_HOURS`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INVALID_TIME_RANGE`.
- `AvailabilityWindow = { startAt: string, endAt: string, latestStartAt: string }`; `endAt` delimita o período livre e `latestStartAt` já desconta duração mais intervalo.
- `getLocalDate(instant: string): string`, `getLocalDayBounds(date: string): { startAt: string; endAt: string }` e `intervalsOverlap(a: { startAt: string; endAt: string }, b: { startAt: string; endAt: string }): boolean`.
- `calculateAvailability({ date, service, businessHours, appointments, timeBlocks }): AvailabilityWindow[]`, usando tipos existentes `Service` e `BusinessHours`.
- `buildAppointment({ id, salonId, userId, input, service, businessHours, appointments, timeBlocks, now }): Appointment`.
- `buildTimeBlock({ id, salonId, userId, input, appointments, timeBlocks, now }): TimeBlock`.

Datas inexistentes, timestamps inválidos e precisão inferior ao minuto devem falhar. Testar explicitamente virada UTC/local e dias históricos de 23/25 horas em São Paulo; horários locais inexistentes não podem ser inventados. A estratégia de conversão fica com o implementador, sem biblioteca nova.

## Persistência e concorrência

`createFirestoreAppointmentsRepository(firestore?)` produz:

- `getAvailability(salonId, input): Promise<{ date, timezone, serviceId, durationMinutes, appointmentIntervalMinutes, windows }>`.
- `getDay(salonId, date): Promise<{ date, timezone, appointments, timeBlocks }>`.
- `reserve(salonId, userId, input): Promise<{ appointment, replayed: boolean }>`.
- `cancel(salonId, userId, appointmentId): Promise<Appointment>`.
- `createBlock(salonId, userId, input): Promise<{ timeBlock, replayed: boolean }>`.
- `cancelBlock(salonId, userId, blockId): Promise<TimeBlock>`.

Tipos de retorno e interface exportados de `src/server/appointments/appointments-repository.ts`; implementação em `firestore-appointments-repository.ts`. Interface não conhece React/HTTP.

Coleções raiz `appointments`, `timeBlocks` e `appointmentDayLocks`, sempre com `salonId`. IDs de criação: hash SHA-256 de `[salonId, tipo de comando, requestId]`. Cada registro guarda fingerprint do input normalizado para comparação de reenvios; o fingerprint não é incluído no retorno de domínio. Reenvio após cancelamento retorna o mesmo registro cancelado, sem reservar novamente.

Um lock diário determinístico por `[salonId, primary, localDate]` contém identidade, revisão e `updatedAt`. Toda reserva, criação/cancelamento de bloqueio e cancelamento de reserva lê e altera esse mesmo documento dentro da transação. Isso protege inclusive o primeiro atendimento de um dia vazio. Idempotência repetida sem alteração não precisa incrementar revisão.

A reserva relê serviço, configuração, lock e ocupações dentro da transação. Todas as leituras precedem as escritas. O callback pode repetir: não gerar efeitos externos nele. Cancelamentos não relêem o catálogo para reconstruir snapshots. Validar identidade também em documentos persistidos. Documento de outro salão é indistinguível de inexistente.

Ordem comum: aguardar a leitura do lock diário antes de ler qualquer outro documento na transação, sem agrupá-lo com outras leituras em `Promise.all`. Cancelamentos podem fazer uma leitura externa apenas para localizar o dia; dentro da transação leem primeiro o lock, depois releem o alvo e conferem salão, profissional e data imutável antes de escrever. Isso evita inversão de ordem entre cancelamento e criação. Testes não devem presumir ordem de commits apenas porque a leitura de um lock resolveu: resultados concorrentes precisam corresponder a alguma execução serial válida.

Consultas diárias por `salonId`, `professionalId`, `localDate` e ordenação de `startAt`; adicionar índices para ambas as coleções. Essa partição depende da regra de ocupação/bloqueio caberem no dia local. Reutilizar/exportar o identificador já existente de businessHours, sem duplicar sua convenção.

## API

- `GET /api/admin/appointments?date=YYYY-MM-DD`: dia, reservas e bloqueios.
- `POST /api/admin/appointments`: criação; 201 nova, 200 reenvio igual.
- `GET /api/admin/appointments/availability?date=...&serviceId=...`: janelas livres.
- `POST /api/admin/appointments/[appointmentId]/cancel`: cancelamento idempotente.
- `POST /api/admin/time-blocks`: criação; 201 nova, 200 reenvio igual.
- `POST /api/admin/time-blocks/[blockId]/cancel`: cancelamento idempotente.

Cada rota autentica independentemente antes de ler dados/corpo, usa Node.js e respostas `no-store`. Validar conteúdo e query sem aceitar campos administrativos do cliente. 400 para JSON inválido; 401/403 para autorização; 404 para registro/serviço inexistente ou de outro salão; 422 para schema/período inválido; 409 para conflito, serviço inelegível, fora do expediente ou chave reutilizada com conteúdo diferente; 500 genérico com logger seguro.

## Aceite e verificação

- Limites de expediente, buffer configurado/zero, adjacência, sobreposição parcial/completa/apenas no intervalo, domingo fechado e serviço maior que a jornada.
- Cancelamento libera; bloqueio impede; cancelar bloco libera; snapshots e timestamps permanecem coerentes.
- Reenvio igual, conteúdo divergente, repetição de cancelamento, escopo de salão e rejeição de avaliação/inativo.
- Emulador: duas criações simultâneas no mesmo dia vazio confirmam apenas uma; horários adjacentes e salões diferentes podem confirmar; criação concorrente com bloqueio também permite apenas uma ocupação.
- Alterações de serviço/intervalo não alteram snapshots históricos; transação lê valores atuais na nova reserva.
- Rules continuam negando leitura/escrita direta, inclusive a administradores autenticados.
- Formatter focado, lint, typecheck, suíte unitária, integração real e build passam. Fazer smoke HTTP do servidor compilado para autenticação das novas rotas. Nenhuma dependência de produção, push ou implantação.
