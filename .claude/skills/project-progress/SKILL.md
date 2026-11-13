---
name: project-progress
description: Lê e atualiza o diário de progresso do projeto (docs/development/progress.md). Use SEMPRE no início de uma sessão ou tarefa, para saber o que já foi feito, o estado dos ambientes e os próximos passos; e SEMPRE ao concluir um passo relevante (feature, correção, deploy, decisão, configuração de ambiente), para registrar o que foi feito antes de encerrar.
---

# Diário de progresso do projeto

O arquivo `docs/development/progress.md` é a memória compartilhada entre sessões e agentes. Quem entra numa sessão nova deve conseguir continuar o trabalho só lendo esse arquivo e os docs que ele aponta.

## Ao começar (leitura)

1. Leia `docs/development/progress.md` inteiro: **Estado atual**, **Ambientes**, **Próximos passos** e as entradas mais recentes do **Log**.
2. Confira se o estado ainda bate com o repositório (`git log --oneline -10`, `git status`, branch atual). Se divergir, confie no repositório e corrija o diário.
3. Não refaça o que já está registrado como concluído. Não crie ambientes, projetos ou bancos novos: os existentes estão listados em **Ambientes**.

## Ao concluir um passo (escrita)

Registre assim que o passo for concluído (não deixe para o fim da sessão):

1. **Log**: adicione uma entrada no TOPO da seção, no formato:

   ```markdown
   ### AAAA-MM-DD — <título curto>

   - **O que:** o que foi feito e por quê (1–3 linhas).
   - **Onde:** branch, commits (hash curto) e/ou arquivos principais.
   - **Verificação:** comandos/testes executados e resultado real.
   - **Pendências:** o que ficou aberto, riscos, decisões aguardando o usuário.
   ```

2. **Estado atual** e **Próximos passos**: reescreva para refletir a realidade depois do passo (marque itens concluídos, remova os que não valem mais, adicione os novos).
3. **Ambientes**: atualize só se algo mudou de fato e foi confirmado (deploy feito, variável configurada, regra publicada).
4. Decisões de produto/arquitetura vão para os docs próprios (`docs/product/*`, `docs/architecture/*`); no diário, apenas um link e uma linha de resumo.

## Regras

- Nunca escreva segredos, chaves, tokens, conteúdo de variáveis sensíveis, e-mails, telefones ou dados de clientes.
- Registre apenas fatos verificados. O que for suposição, marque como "(não verificado)".
- Seja conciso: o diário é um índice do trabalho, não uma cópia dos relatórios.
- Datas absolutas (AAAA-MM-DD), nunca "ontem" ou "semana passada".
- Formate com Prettier (`npx prettier --write docs/development/progress.md`) e inclua o diário no mesmo commit do trabalho que ele descreve.
