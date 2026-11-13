# Diário de progresso

Memória compartilhada entre sessões e agentes. Leia antes de começar; atualize ao concluir cada passo (skill `project-progress`).

## Estado atual

- **Marco:** fechamento do piloto ([piloto-primeira-entrega.md](../product/piloto-primeira-entrega.md)) — painel administrativo em uso real pela profissional antes da página pública.
- **Código:** endurecimento do piloto integrado ao `main` do `origin` (`df11027`) e publicado em produção em 2026-11-13.
- **Produção:** login, Agenda e Serviços verificados funcionando em 2026-11-13 (sem dados cadastrados ainda).

## Ambientes

| Ambiente | Firebase              | Onde                                                                                                |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Produção | `hair-sys-piloto`     | https://gabrielaalvim.vercel.app/ (projeto Vercel `hair-system`, deploy do `main` do fork `origin`) |
| Testes   | `hair-sys`            | `.env.local` de desenvolvimento                                                                     |
| Local/CI | `demo-sistema-cabelo` | Firebase Emulator Suite (`npm run test:integration`, `npm run test:e2e:auth`)                       |

- Não criar novos projetos Firebase/Vercel nem novos bancos.
- Repositório: `origin` = fork usado no deploy; `upstream` (DiegoGM55) está atrás e não é usado no deploy.
- Índices e regras do Firestore publicados em produção (regras republicadas em 2026-11-13).
- Emuladores exigem JDK 21+ (Temurin 21 instalado em 2026-11-13).

## Próximos passos

1. Smoke test de mutações em produção: salvar expediente, criar e cancelar um agendamento de teste (confirma a checagem de Origin atrás da Vercel).
2. Conta da profissional no Firebase Auth de produção com claims `admin` + `salonId` (mesmo `salonId` da conta já usada) via `npm run firebase:set-admin`.
3. Entrega no celular dela e cadastro dos serviços reais; coletar feedback (perguntas no doc do piloto).

## Log

### 2026-11-13 — Deploy do endurecimento em produção

- **O que:** `feat/pilot-hardening` integrada ao `main` (fast-forward) e publicada; regras do Firestore publicadas em `hair-sys-piloto`.
- **Onde:** `origin/main` = `df11027`; deploy Vercel de produção pronto.
- **Verificação:** headers `frame-ancestors`, `X-Frame-Options`, `Referrer-Policy`, `nosniff` presentes em https://gabrielaalvim.vercel.app/; API admin sem login responde 401.
- **Pendências:** smoke test de mutações; conta da profissional.

### 2026-11-13 — Produção verificada e diário de progresso criado

- **O que:** usuário confirmou login, Agenda e Serviços funcionando em produção; criada a skill `project-progress` e este diário.
- **Onde:** `.claude/skills/project-progress/SKILL.md`, `docs/development/progress.md`, ponteiro em `agents.md`.
- **Verificação:** teste manual do usuário em https://gabrielaalvim.vercel.app/.
- **Pendências:** itens 1–5 de Próximos passos.

### 2026-11-13 — Endurecimento do piloto e exceções administrativas

- **O que:** cadastro manual pode registrar serviço que exige avaliação e horário fora do expediente após confirmação ("Agendar mesmo assim"), salvo em `exceptions`; conflito, bloqueio, serviço inativo e virada de meia-noite continuam proibidos. Endurecimento: Origin + JSON obrigatórios nas mutações admin, logout revoga sessões (todos os aparelhos), headers anti-iframe, logs com código do erro, no-store, validação de `serviceId`. UI: "Outro horário", selos de exceção, mensagens de rede em português, "hoje" atualizado no PWA.
- **Onde:** branch `feat/pilot-hardening`, commit `2838029`; decisões em [overview.md](../architecture/overview.md) e [business-rules.md](../product/business-rules.md).
- **Verificação:** format, lint, typecheck, 404 unitários, 50 integração, build, 4 E2E públicos e 24 E2E autenticados (3 execuções sem flakiness).
- **Pendências:** a futura rota pública deve usar schema próprio sem `allowExceptions`; smoke test pós-deploy da checagem de Origin atrás da Vercel.

### 2026-11-13 — Equipe de agentes

- **O que:** lead (sessão principal) define escopo e arquitetura; plenos em Sonnet implementam: `backend-engineer`, `frontend-engineer`, `qa-engineer`, `code-reviewer` (somente leitura).
- **Onde:** `.claude/agents/`, commit `8e399e8`.
