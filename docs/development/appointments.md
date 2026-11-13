# Agenda administrativa

Todas as operações usam autenticação administrativa já existente e derivam salão e usuário do contexto verificado. As respostas têm `Cache-Control: no-store`. IDs não podem conter `/` e têm até 128 caracteres; queries e objetos são estritos, inclusive sem parâmetros duplicados.

| Método e caminho                                                             | Entrada                                     | Resposta                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| GET `/api/admin/appointments?date=2026-11-12`                                | data local                                  | `{ date, timezone, appointments, timeBlocks }`      |
| GET `/api/admin/appointments?from=2026-11-09&to=2026-11-15`                  | período local                               | `{ from, to, timezone, appointments, timeBlocks }`  |
| GET `/api/admin/appointments/availability?date=2026-11-12&serviceId=servico` | data local e serviço                        | data, fuso, serviço, duração, intervalo e `windows` |
| POST `/api/admin/appointments`                                               | JSON abaixo                                 | `{ appointment, replayed }`, 201 ou 200             |
| POST `/api/admin/appointments/[appointmentId]/cancel`                        | identificador na URL                        | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/complete`                      | `{}` ou `{ payment }`                       | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/no-show`                       | identificador na URL                        | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/payment`                       | `payment` (abaixo)                          | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/reschedule`                    | `{ startAt, serviceId?, allowExceptions? }` | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/reminder-sent`                 | identificador na URL                        | `{ appointment }`, 200                              |
| POST `/api/admin/appointments/[appointmentId]/client-confirmation`           | identificador na URL                        | `{ appointment }`, 200                              |
| POST `/api/admin/time-blocks`                                                | JSON abaixo                                 | `{ timeBlock, replayed }`, 201 ou 200               |
| POST `/api/admin/time-blocks/[blockId]/cancel`                               | identificador na URL                        | `{ timeBlock }`, 200                                |

Exemplos fictícios:

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174000",
  "serviceId": "servico",
  "startAt": "2026-11-12T12:00:00Z",
  "client": { "name": "Exemplo", "phone": "11999999999" },
  "source": "whatsapp"
}
```

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174001",
  "startAt": "2026-11-12T12:00:00Z",
  "endAt": "2026-11-12T13:00:00Z",
  "reason": "Pausa"
}
```

Os instantes são UTC com precisão de minuto, datas e expediente usam `America/Sao_Paulo`, e disponibilidade retorna janelas livres com último início possível. A reserva inclui a pausa na ocupação e a transação revalida o serviço e o expediente. Um UUID repetido com o mesmo conteúdo retorna o registro original (também se cancelado); conteúdo diferente gera conflito. Cancelamentos são idempotentes. Bloqueios são diários, simples e podem cobrir o dia inteiro.

### Exceções administrativas

`POST /api/admin/appointments` e `.../reschedule` aceitam `allowExceptions: boolean` (opcional, padrão `false`), que entra no fingerprint de idempotência (use novo `requestId` ao reenviar com a exceção). Com `true`, ignoram só os limites de expediente/dia não útil e a restrição de avaliação; conflito, bloqueio, serviço inativo, intervalo inválido e atendimento que atravessa a meia-noite local continuam proibidos. O agendamento guarda `exceptions` (`"outsideBusinessHours" | "requiresEvaluation"`, só as usadas) e a resposta o expõe; documentos antigos sem o campo são lidos como `[]`. O status segue `confirmed`.

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174002",
  "serviceId": "servico-com-avaliacao",
  "startAt": "2026-11-12T22:30:00Z",
  "client": { "name": "Exemplo", "phone": "11999999999" },
  "source": "whatsapp",
  "allowExceptions": true
}
```

Erros 409 contornáveis incluem `overridable: true`:

```json
{ "error": "Não foi possível concluir a operação.", "code": "OUTSIDE_BUSINESS_HOURS", "overridable": true }
{ "error": "Não foi possível concluir a operação.", "code": "SERVICE_REQUIRES_EVALUATION", "overridable": true }
{ "error": "Não foi possível concluir a operação.", "code": "SERVICE_INACTIVE" }
```

### Segurança das mutações administrativas

Toda requisição `POST`/`PUT`/`PATCH`/`DELETE` em `/api/admin/*` exige cabeçalho `Origin` igual ao host que recebeu a requisição (403 caso contrário), verificado em `authenticateAdmin`. Rotas com corpo exigem `Content-Type: application/json` (415 caso contrário). As respostas de serviços e expediente também usam `Cache-Control: no-store`. `DELETE /api/auth/session` revoga os refresh tokens do usuário quando o cookie é válido e sempre apaga o cookie.

JSON malformado retorna 400; autenticação/autorização 401/403; recurso ausente ou fora do salão 404; validação e período inválido 422; conflito, serviço inelegível, fora do expediente ou UUID divergente 409. Falhas internas retornam 500 genérico sem dados pessoais. Não há limite artificial de antecedência. O fluxo público, cadastro separado de clientes, recorrência, férias, reagendamento e pagamentos ainda não estão implementados neste marco.

## Verificação local do marco

Verificado em 2026-11-12, sem implantação:

- Prettier nos arquivos alterados, `npm run lint` e `npm run typecheck`: aprovados.
- `npm test`: 263 testes em 30 arquivos aprovados, incluindo 19 testes HTTP.
- `npm run test:integration`: 31 testes aprovados nos emuladores de teste, cobrindo transações e Rules. Após centralizar a validação de reenvios, os seis casos de integração afetados foram executados novamente e aprovados.
- `npm run test:e2e`: três verificações de navegador aprovadas.
- `npm run build`: aprovado; no servidor compilado, as seis operações sem sessão retornaram 401 JSON com `no-store`, e as três páginas administrativas retornaram 307 para o login.

A integração exige Java 21 e usa somente `firebase.test.json` e o projeto fictício `demo-sistema-cabelo`. Execute emuladores, testes de navegador e build em sequência para evitar disputa por portas e pelo diretório `.next`. Os testes HTTP compartilham um arquivo de fixtures e mocks; a separação por rota pode ser feita quando a manutenção justificar.

## Interface da agenda (`/admin/agenda`)

O período (`from`/`to`) é inclusivo, aceita de 1 a 42 dias locais e não pode ser combinado com `date`; registros vêm ordenados por dia e início. O índice composto existente (`salonId`, `professionalId`, `localDate`, `startAt`) atende tanto a consulta diária quanto a por período.

A página administrativa da agenda consome somente as APIs acima:

- Visões de dia, semana (segunda a domingo) e mês (grade de semanas completas, no máximo 42 dias), com navegação anterior/hoje/próximo e seleção de data. Clicar em um dia da semana ou do mês abre a visão diária.
- A visão diária mostra horário, cliente, serviço (snapshot), duração, preço inicial, telefone, origem e o fim da ocupação com o intervalo; oferece link `wa.me` (código 55 acrescentado a números nacionais) e cancelamento com confirmação. Bloqueios podem ser liberados. Cancelados ficam ocultos, exceto com "Mostrar cancelados".
- Novo agendamento lista apenas serviços ativos que não exigem avaliação, consulta os horários livres e sugere inícios em passos de 15 minutos alinhados ao relógio, além do primeiro minuto de cada janela. O servidor revalida tudo; em conflito, os horários são recarregados. Cada abertura do formulário gera um `requestId`, de modo que reenvios após falha de rede não duplicam a reserva.
- Bloqueio de horário aceita início/fim locais ou dia inteiro (até a meia-noite seguinte) e motivo opcional.
- Conversões entre horário de Brasília e UTC ficam em `src/features/admin-agenda/agenda-calendar.ts`, reaproveitando o domínio de datas locais.

## Conclusão, falta e pagamento

`payment` é `{ "finalPriceCents": 9500, "paidCents": 4000, "method": "cash" }`: centavos inteiros até 10.000.000, valor pago menor ou igual ao final, e `method` (`pix`, `cash`, `debit`, `credit`) obrigatório quando o valor pago é positivo.

- Concluir e marcar falta exigem atendimento confirmado e já iniciado (409 `NOT_STARTED` antes do início). Repetir a mesma ação é idempotente; concluir um atendimento já concluído com `payment` registra o pagamento.
- O pagamento só é aceito em atendimento concluído e substitui o anterior. Transições inválidas, como cancelar concluído ou falta, retornam 409 `INVALID_TRANSITION`.
- Na agenda, atendimentos iniciados mostram "Concluir" (com registro opcional do pagamento) e "Faltou"; concluídos mostram o estado financeiro e "Registrar/Editar pagamento". O painel "Financeiro" do período exibe recebido (apenas concluído e integralmente pago), em aberto, concluídos sem pagamento, faltas, e o recebido por forma de pagamento e por serviço. Na visão mensal, o painel considera apenas os dias do mês.
- Recarregar o mesmo período mantém a lista e formulários abertos na tela ("Atualizando…").

## Reagendamento, lembrete e confirmação de presença

- Reagendar (RF-ATE-01) aceita apenas atendimento confirmado. Sem `serviceId` (ou com o mesmo serviço), o snapshot original é mantido, preservando duração e preço informados; com outro serviço, um novo snapshot é tirado e a duração recalculada. Expediente, intervalo atual e conflitos são revalidados; o próprio período do atendimento não conta como conflito. A disponibilidade aceita `excludeAppointmentId` para oferecer horários do mesmo dia.
- A transação lê primeiro as travas dos dois dias (origem e destino, em ordem fixa), depois o atendimento, o serviço/expediente e a ocupação do destino, e incrementa ambas as travas. Se o atendimento mudou de dia em paralelo, a operação retorna 409 `CONFLICT`.
- Lembrete (RF-COM-02): o atendimento confirmado fica com "Lembrete pendente" nas 24 horas anteriores ao início. Enviar abre o WhatsApp com o texto pronto e registra `reminderSentAt`, gravado uma única vez (o primeiro instante é mantido). O painel "Lembretes das próximas 24 horas" no topo da agenda lista os pendentes de hoje e amanhã.
- Confirmação de presença (RF-COM-03): "Cliente confirmou" grava `clientConfirmedAt` uma única vez.
- Quando o horário muda, lembrete e confirmação são removidos e voltam a ficar pendentes; trocar só o serviço no mesmo horário os mantém.
- Mensagens prontas (RF-COM-01/05): confirmação (serviço, data, horário, duração e preço "a partir de" quando variável), lembrete e pós-atendimento. Nada é enviado automaticamente; a profissional revisa e envia no WhatsApp.
- Após o login, o painel abre na Agenda.
