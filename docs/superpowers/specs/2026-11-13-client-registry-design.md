# Cadastro de clientes — design (lead)

Status: aprovado pelo lead em 2026-11-13. Decisões de produto confirmadas pelo usuário na mesma data.

## Objetivo

Dar à profissional uma ficha por cliente, com dados de contato, observações, histórico químico, aniversário, Instagram e o histórico automático de atendimentos (datas, serviços, valores pagos e em aberto, faltas), substituindo nome/telefone soltos em cada agendamento.

## Decisões de produto (usuário)

1. **Identidade pelo telefone.** Mesmo telefone = mesma cliente dentro do salão. Um telefone pertence a no máximo uma ficha.
2. **Campos da ficha:** nome, telefone, observações livres, histórico químico, data de aniversário, Instagram + histórico automático.
3. **Migração automática** dos agendamentos existentes, agrupando por telefone; simulação antes, banco de testes primeiro, produção com confirmação do usuário.

## Decisões técnicas (lead)

### Telefone canônico

- `normalizeBrazilianPhone(raw)`: remove não dígitos; se tiver 10 ou 11 dígitos, prefixa `55`; se tiver 12 ou 13 dígitos começando com `55`, mantém; demais tamanhos entre 10 e 15 dígitos são mantidos como estão (internacionais). Resultado é a chave de identidade (`phoneKey`).
- Agendamentos continuam aceitando o formato atual; a ligação com a ficha usa `phoneKey`.
- Sem tratamento do "nono dígito" antigo (fora de escopo; documentar).

### Modelo Firestore

`clients/{clientId}` (id gerado pelo servidor):

```text
salonId
name                      // 1–120, trim
phone                     // dígitos canônicos (phoneKey)
instagram?                // handle sem "@", minúsculo, [a-z0-9._]{1,30}
birthday? { day, month, year? }   // validado (29/02 só com ano bissexto ou sem ano)
notes?                    // até 2000 caracteres
chemicalHistory: [        // até 100 itens, mais recente primeiro
  { id, localDate (YYYY-MM-DD), procedure (1–120), product? (≤120), notes? (≤500) }
]
createdAt, updatedAt, createdBy, updatedBy
```

`clientPhones/{hash(salonId + ":" + phoneKey)}` → `{ salonId, clientId, phone }`: guarda de unicidade, criada/atualizada/removida na mesma transação que cria ou troca o telefone da ficha.

`appointments` ganha `clientId` (opcional no schema de leitura para documentos legados; obrigatório em toda gravação nova). O snapshot `client { name, phone }` continua sendo gravado e **não** é reescrito quando a ficha muda (histórico fiel ao que foi combinado).

Índice novo: `appointments` (`salonId` ASC, `clientId` ASC, `startAt` DESC).

Regras do Firestore: `clients` e `clientPhones` negados ao navegador (o padrão atual já nega tudo; adicionar teste explícito).

### Domínio (`src/domain/clients/`)

- Schemas Zod de entrada/saída da ficha e do item de histórico químico; `normalizeBrazilianPhone`; `normalizeInstagram`; validação de aniversário.
- `summarizeClientHistory(appointments)`: total de atendimentos concluídos, faltas, cancelados, total pago (soma de `paidCents` dos concluídos), total em aberto (`finalPriceCents - paidCents` dos concluídos), último atendimento concluído, próximo atendimento confirmado. Centavos inteiros. Testes de limite.

### API administrativa (todas com `authenticateAdmin`, Origin/JSON, no-store, salonId das claims)

| Método e rota                                               | Função                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/clients`                                    | Lista todas as fichas do salão, ordenadas por nome (limite 2000). Campos de lista: `id, name, phone, instagram, birthday`. A busca é feita no cliente. |
| `GET /api/admin/clients/lookup?phone=`                      | Retorna a ficha cujo `phoneKey` coincide, ou 404. Usado no formulário de agendamento.                                                                  |
| `POST /api/admin/clients`                                   | Cria ficha (`requestId` para idempotência). Telefone já usado → 409 `code: "CLIENT_PHONE_TAKEN"` com `clientId` existente.                             |
| `GET /api/admin/clients/{id}`                               | Ficha completa + `appointments` (histórico, mais recente primeiro, inclusive cancelados) + `summary`.                                                  |
| `PATCH /api/admin/clients/{id}`                             | Atualiza nome, telefone, instagram, aniversário, observações (campos parciais). Troca de telefone respeita a unicidade (409 `CLIENT_PHONE_TAKEN`).     |
| `POST /api/admin/clients/{id}/chemical-history`             | Adiciona item (`requestId`).                                                                                                                           |
| `DELETE /api/admin/clients/{id}/chemical-history/{entryId}` | Remove item.                                                                                                                                           |

### Agendamento integrado à ficha

- `POST /api/admin/appointments` passa a aceitar **ou** `clientId` **ou** `client { name, phone }` (exatamente um).
  - `clientId`: a ficha precisa existir no salão; o snapshot usa nome e telefone atuais da ficha.
  - `client`: dentro da transação da reserva, busca a guarda pelo `phoneKey`; se existir, liga à ficha existente (snapshot com o nome da ficha); se não, cria ficha + guarda. Nunca cria duplicata, mesmo com reservas concorrentes do mesmo telefone novo.
- O fingerprint de idempotência passa a considerar `clientId` quando informado, sem quebrar fingerprints antigos.
- Reagendar/trocar serviço não altera `clientId`.
- Ordem de leituras antes de escritas na transação deve ser respeitada (restrição do Firestore).

### Migração (`scripts/migrate-clients.mjs`)

- Uso: `node --env-file=<arquivo> scripts/migrate-clients.mjs --salon <salonId> [--apply]`. Sem `--apply` é simulação.
- Agrupa agendamentos sem `clientId` do salão por `phoneKey`; nome = do agendamento mais recente; cria ficha + guarda (ou reaproveita ficha existente pelo `phoneKey`) e grava `clientId` nos agendamentos, em lotes.
- Idempotente: rodar duas vezes não cria nada novo.
- Saída só com contagens (fichas criadas, reaproveitadas, agendamentos ligados, ignorados por telefone inválido). Nunca imprimir nome ou telefone.
- Teste de integração no emulador.

### Interface (`src/features/admin-clients/`, `src/app/admin/clients/`)

- Navegação: nova aba **Clientes**.
- Lista: busca única por nome (sem acento, sem diferenciar maiúsculas), telefone ou Instagram; estados de carregamento, vazio, sem resultado e erro; botão **Nova cliente**; aniversariantes do mês destacados (selo).
- Ficha (`/admin/clients/[id]`): dados com edição; botões WhatsApp e Instagram; observações; histórico químico (lista + adicionar + remover com confirmação); resumo (concluídos, faltas, pago, em aberto, último e próximo atendimento) e histórico de atendimentos com status e valores.
- Novo agendamento: o telefone vem primeiro; ao completar um telefone válido, consulta `lookup`; se encontrar, mostra "Cliente: <nome>" com link para a ficha e envia `clientId`; se não, pede o nome e envia `client` (ficha criada pelo servidor).
- Agenda: cada atendimento com `clientId` tem link **Ver ficha**.
- Mobile first; regra de negócio em módulos puros testados.

## Fora de escopo deste marco

- Foto do cabelo, exclusão/anonimização de ficha (LGPD), exportação, mesclagem de fichas duplicadas, múltiplas fichas por telefone, mensagem automática de aniversário. Registrar em `docs/product/open-questions.md`.

## Critérios de aceitação

1. Criar agendamento com telefone novo cria ficha; com telefone existente (em qualquer formato: com/sem 55, com máscara) liga à ficha existente.
2. Duas reservas concorrentes com o mesmo telefone novo resultam em uma única ficha.
3. Ficha mostra histórico e resumo corretos (pago e em aberto só de concluídos).
4. Editar telefone para um já usado é recusado com mensagem clara.
5. Migração simulada e aplicada no emulador: idempotente, sem PII na saída.
6. Gate completo verde (format, lint, typecheck, unit, integration, build, e2e, e2e:auth) e revisão aprovada.
7. Docs atualizados: `firestore-model.md`, `business-rules.md`, `open-questions.md`, `progress.md`.
