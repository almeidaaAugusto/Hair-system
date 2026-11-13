# Diário de progresso

Memória compartilhada entre sessões e agentes. Leia antes de começar; atualize ao concluir cada passo (skill `project-progress`).

## Estado atual

- **Marco:** fechamento do piloto ([piloto-primeira-entrega.md](../product/piloto-primeira-entrega.md)) — painel administrativo em uso real pela profissional antes da página pública.
- **Código:** endurecimento do piloto concluído e verificado na branch `feat/pilot-hardening` (commits `8e399e8`, `2838029`, `e61d16a`); ainda **não** integrado ao `main` nem publicado.
- **Produção:** login, Agenda e Serviços verificados funcionando em 2026-11-13 (sem dados cadastrados ainda).

## Ambientes

| Ambiente | Firebase              | Onde                                                                                                |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Produção | `hair-sys-piloto`     | https://gabrielaalvim.vercel.app/ (projeto Vercel `hair-system`, deploy do `main` do fork `origin`) |
| Testes   | `hair-sys`            | `.env.local` de desenvolvimento                                                                     |
| Local/CI | `demo-sistema-cabelo` | Firebase Emulator Suite (`npm run test:integration`, `npm run test:e2e:auth`)                       |

- Não criar novos projetos Firebase/Vercel nem novos bancos.
- Repositório: `origin` = fork usado no deploy; `upstream` (DiegoGM55) está atrás e não é usado no deploy.
- Índices do Firestore publicados em produção. Regras: republicar junto com o próximo deploy.
- Emuladores exigem JDK 21+ (Temurin 21 instalado em 2026-11-13).

## Próximos passos

1. Merge de `feat/pilot-hardening` no `main` do `origin` (dispara o deploy de produção).
2. Publicar regras do Firestore em `hair-sys-piloto`.
3. Criar a conta da profissional no Firebase Auth de produção e aplicar as claims (`npm run firebase:set-admin`).
4. Smoke test em produção: salvar expediente, criar e cancelar um agendamento de teste, conferir logs da Vercel (sem 403/500).
5. Entrega no celular dela e cadastro dos serviços reais; coletar feedback (perguntas no doc do piloto).

## Log

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
