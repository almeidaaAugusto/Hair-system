# Disponibilidade e reservas administrativas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar consulta de disponibilidade e criação/cancelamento transacionais de reservas e bloqueios administrativos.

**Architecture:** Domínio puro de datas/ocupação, repositório Firestore com lock diário e idempotência, APIs Next.js Node autenticadas. Consultas retornam janelas livres, sem introduzir grade artificial de horários.

**Tech Stack:** Next.js 16, TypeScript strict, Zod, Firebase Admin/Firestore, Vitest e emuladores existentes; nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-11-availability-design.md`

## Global Constraints

- Trabalho local, sem push ou implantação. Preservar `next-env.d.ts`, lockfile e documentos baseline não rastreados.
- Regras de negócio fora de React/HTTP; identidade apenas de AdminContext e profissional interna `primary`.
- UTC persistido como Timestamp, apresentação/calendário em `America/Sao_Paulo`; sem offset fixo.
- Ocupação inclui intervalo configurado e cabe integralmente no expediente; intervalos semiabertos.
- Escrita e conflito transacionais com lock diário, inclusive dia vazio; reenvios idempotentes e snapshots imutáveis.
- Sem avaliação automática, fotos, cliente autenticado, pagamento, reagendamento ou fluxo público.
- Sem dados pessoais/tokens em logs. APIs no-store e autorização independente.

## Review Focus

1. Ausência de documentos no primeiro dia: concorrência deve continuar excluída pelo lock compartilhado.
2. UTC/local perto de meia-noite e dias de 23/25 horas: data/expediente corretos sem offset fixo.
3. Reenvio depois de cancelamento ou mudança no catálogo: manter o mesmo registro/snapshot, sem nova ocupação.
4. Documento válido pertencente a outro salão: negar sem revelar dados e sem escrita.
5. Falha transacional ou payload adulterando preço/status/salão: nenhuma reserva parcial nem erro sensível.

### Task 1: Domínio de datas, disponibilidade e registros

**Files:**

- Create: `src/domain/appointments/appointment.ts` e `.test.ts`.
- Create: `src/domain/appointments/local-date.ts` e `.test.ts`.
- Create: `src/domain/appointments/availability.ts` e `.test.ts`.

**Interfaces:** Todos os contratos de domínio definidos na seção correspondente da spec; estes nomes e propriedades são a fronteira consumida pela Task 2. Disponibilizar schemas de input/leitura, erro tipado, funções de fuso, disponibilidade e construtores puros.

- [ ] Escrever testes de schemas, calendário real/UTC, dias São Paulo de 23/25h, precisão de minuto, limites de expediente, intervalos, estados, bloqueios e snapshots.
- [ ] Rodar testes focados e registrar RED por módulos/comportamentos ausentes.
- [ ] Implementar somente domínio puro, sem Firebase, Node específico ou framework. Reutilizar `Service`/`BusinessHours` atuais.
- [ ] Rodar testes focados, formatter e typecheck; corrigir até GREEN.
- [ ] Revisão escopada de domínio, contratos e testes; commit apenas dos arquivos da tarefa pelo controlador.

### Task 2: Repositório Firestore transacional e integração

**Files:**

- Create: `src/server/appointments/appointments-repository.ts`.
- Create: `src/server/appointments/firestore-appointments-repository.ts`.
- Test: `tests/integration/appointments-repository.test.ts`.
- Modify: `src/server/business-hours/business-hours-repository.ts` para exportar/reutilizar o ID; atualizar teste existente se necessário.
- Modify: `firestore.indexes.json`, `vitest.integration.config.ts` (alias necessário), `tests/integration/firestore-rules.test.ts`.

**Interfaces:** Consome os contratos da Task 1. Produz `AppointmentsRepository` e tipos de respostas, `createFirestoreAppointmentsRepository(firestore?)` com `getAvailability`, `getDay`, `reserve`, `cancel`, `createBlock`, `cancelBlock`, conforme spec.

- [ ] Escrever integração no projeto demo/emulador, com salões únicos e limpeza limitada aos próprios registros.
- [ ] Registrar RED no emulador por módulo ausente/garantia não implementada; nunca usar serviço Firebase real.
- [ ] Implementar leitura transacional de configuração/serviço/ocupação, protocolo diário comum, IDs/fingerprints estáveis e conversão Timestamp.
- [ ] Cobrir concorrência no primeiro dia vazio, horários adjacentes, diferentes salões, bloqueio versus reserva, replay simultâneo, chave divergente, cancelamento repetido/liberação e snapshots após edição do catálogo/expediente.
- [ ] Adicionar testes de Rules para negar acesso direto a reservas, bloqueios e locks; manter a política deny-all atual.
- [ ] Rodar integração GREEN, formatter, lint e typecheck. Controlador coordena emuladores sequencialmente e Java 21 temporário já disponível.
- [ ] Revisão escopada de concorrência/isolamento; commit pelo controlador.

### Task 3: APIs administrativas e documentação

**Files:**

- Create: `src/app/api/admin/appointments/route.ts` e `.test.ts`.
- Create: `src/app/api/admin/appointments/availability/route.ts` e `.test.ts`.
- Create: `src/app/api/admin/appointments/[appointmentId]/cancel/route.ts` e `.test.ts`.
- Create: `src/app/api/admin/time-blocks/route.ts` e `.test.ts`.
- Create: `src/app/api/admin/time-blocks/[blockId]/cancel/route.ts` e `.test.ts`.
- Create: `src/server/appointments/appointment-http.ts` (erros/respostas/query compartilhados, sem regras de domínio).
- Modify: `docs/architecture/overview.md`, `docs/architecture/firestore-model.md`, `docs/product/business-rules.md`, `docs/product/open-questions.md`.
- Create: `docs/development/appointments.md` com contratos, exemplos sem dados reais, decisões e limitações do marco.

**Interfaces:** Consome schemas/erros da Task 1, interface/factory da Task 2 e `authenticateAdmin` existente. Produz as seis operações HTTP da spec, sem liberar endpoints públicos.

- [ ] Escrever testes de requests reais com mock apenas nas fronteiras Auth/repository: chamadas autenticadas e escopadas, JSON/query inválidos, campos adulterados, 201/200 idempotente, cancelamento, conflitos/inelegibilidade, 404 e 500 seguro.
- [ ] Registrar RED e implementar handlers finos, runtime Node, validação antes de chamar repository e no-store em todas respostas.
- [ ] Rodar testes focados GREEN, formatter, lint e typecheck.
- [ ] Registrar ADR de servidor confiável Next para esta etapa administrativa, modelo de locks/snapshots/idempotência e decisões dos docx que atualizam perguntas antigas.
- [ ] Revisão escopada de autorização/erros e commit pelo controlador.

### Task 4: Verificação final e entrega

- [ ] Rodar formatter focado, `git diff --check`, lint, typecheck, testes unitários, integração relevante e build. Não sobrescrever baseline no formatter nem nos commits.
- [ ] No servidor compilado, verificar 401 JSON das seis novas operações sem sessão, além de 307 das páginas administrativas existentes; nenhuma chamada a dados reais.
- [ ] Revisão final independente: domínio, Firebase security review e quality gate, principalmente concorrência, validação e privacidade.
- [ ] Corrigir achados bloqueadores com regressão RED/GREEN, verificar escopo e registrar resultado/limitações. Sem repetir suites já verdes sem mudança ou risco novo.
- [ ] Preservar alterações baseline, deixar commits locais revisáveis e reportar arquivos, testes, hipóteses e próximo marco de interface.
