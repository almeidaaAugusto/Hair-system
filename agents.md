# AGENTS.md

## Project

Sistema web de agendamento para uma profissional de cabelo.

O fluxo principal é:

Instagram → página pública → serviço → data e horário →
dados da cliente → confirmação → agenda administrativa.

## Product scope

A primeira versão deve incluir:

- Cadastro administrativo de serviços.
- Duração e preço inicial dos serviços.
- Indicação de serviços que precisam de avaliação.
- Configuração do horário de atendimento.
- Intervalo de 10 minutos entre atendimentos.
- Página pública de agendamento.
- Confirmação imediata para serviços elegíveis.
- Cadastro manual de agendamentos recebidos pelo WhatsApp.
- Agenda diária, semanal e mensal.
- Conclusão, cancelamento e registro de falta.
- Registro simples de pagamento.
- Totais recebidos por dia, semana, mês e serviço.
- Estrutura para confirmação e lembrete pelo WhatsApp.

Não implementar sem uma decisão documentada:

- Pagamento online.
- Estoque.
- Despesas.
- Lucro contábil.
- Comissões.
- Programa de fidelidade.
- Aplicativo mobile.
- Conta ou senha para clientes.

## Technology

- Next.js com App Router.
- TypeScript em modo strict.
- Firebase Authentication para o painel administrativo.
- Cloud Firestore.
- Cloud Functions para operações críticas.
- Firebase Emulator Suite para desenvolvimento e testes.
- Zod para validação.
- React Hook Form para formulários.
- Vitest para testes unitários.
- Playwright para testes ponta a ponta.

Use o gerenciador de pacotes definido no lockfile.

Não adicione uma dependência de produção sem:

1. verificar se a funcionalidade já existe na stack;
2. documentar a justificativa;
3. considerar impacto de manutenção e segurança.

## Architecture rules

- Componentes React não devem conter regras de negócio complexas.
- Regras de domínio devem ficar em módulos independentes do framework.
- Escritas públicas de agendamento devem passar pelo servidor.
- Não permitir que o navegador grave diretamente em appointments.
- A confirmação de horário deve utilizar transação.
- Datas devem ser armazenadas em UTC.
- A interface deve usar America/Sao_Paulo.
- Valores monetários devem ser armazenados em centavos inteiros.
- Não usar números decimais para dinheiro.
- Um agendamento deve guardar snapshots do serviço, duração e preço.
- Não registrar telefone, dados pessoais ou tokens em logs.
- Todo documento de negócio deve possuir salonId, mesmo existindo apenas um salão.

## Appointment invariants

- Um profissional não pode possuir atendimentos conflitantes.
- A duração deve incluir o intervalo configurado.
- Um atendimento não pode começar fora do expediente.
- Um atendimento não pode terminar depois do expediente.
- Um horário cancelado volta a ficar disponível.
- Serviços que exigem avaliação não são confirmados automaticamente.
- Um atendimento somente entra no total recebido quando estiver concluído e pago.
- Um lembrete não pode ser enviado mais de uma vez.

## Testing

Para cada regra de negócio:

- criar pelo menos um teste de sucesso;
- criar pelo menos um teste de falha;
- testar limites de horários e datas;
- testar concorrência quando envolver disponibilidade.

Depois de modificar código, executar:

1. formatação;
2. lint;
3. typecheck;
4. testes unitários;
5. testes de integração relevantes.

Não declare uma tarefa concluída enquanto algum desses comandos estiver falhando.

## Definition of done

Uma tarefa somente está concluída quando:

- os critérios de aceitação estão atendidos;
- os testes foram adicionados ou atualizados;
- lint e typecheck passam;
- não existem segredos no código;
- as regras do Firestore foram consideradas;
- estados de carregamento, vazio e erro foram tratados;
- a documentação foi atualizada quando houver mudança de comportamento;
- o resumo final informa arquivos alterados, testes executados e riscos restantes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
