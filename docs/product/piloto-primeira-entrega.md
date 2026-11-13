# Piloto — primeira entrega para a profissional

## Objetivo

Colocar o painel administrativo nas mãos da profissional por 1–2 semanas de uso real, registrando os agendamentos que hoje chegam pelo WhatsApp, e coletar feedback antes de abrir a página pública de agendamento.

## O que está pronto

- Login administrativo com sessão de 5 dias; o painel abre na Agenda.
- Serviços: duração, preço inicial, preço variável, exige avaliação, ativo/inativo.
- Expediente semanal e intervalo entre atendimentos (padrão: segunda a sábado, 09:00–20:00, 10 minutos).
- Agenda dia/semana/mês; novo agendamento manual com horários livres; bloqueio de horário ou dia inteiro.
- Reagendar e trocar serviço; cancelar; concluir; marcar falta.
- Exceções administrativas no cadastro manual: lançar horário fora do expediente ou serviço com avaliação, com confirmação explícita da profissional (registrado no agendamento); conflitos e bloqueios continuam proibidos.
- Pagamento: valor final, valor pago, forma (Pix, dinheiro, débito, crédito), saldo e estado financeiro.
- Financeiro do dia/semana/mês: recebido (só concluído e integralmente pago), em aberto, faltas, por forma e por serviço.
- WhatsApp: mensagens prontas de confirmação, lembrete e pós-atendimento; painel de lembretes das próximas 24 horas; registro de lembrete enviado e de presença confirmada.

## Fora desta entrega (decisão consciente)

- Página pública para a cliente agendar sozinha e fluxo de avaliação com foto.
- Cadastro de clientes com histórico (cada agendamento guarda nome e telefone).
- Pagamento dividido entre formas, sinal antes do atendimento, desfazer conclusão/falta.
- Endereço e orientações nas mensagens (a profissional pode completar o texto antes de enviar).
- Envio automático de mensagens.

## Checklist técnico antes de entregar

1. Revisar e integrar o código (branch e PR) e publicar na Vercel.
2. Definir o projeto Firebase do piloto. Como serão dados reais de clientes, preferir um projeto separado do usado em testes manuais.
3. Na Vercel, configurar `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT_JSON` (privada).
   As duas variáveis do servidor e as três públicas devem apontar para o **mesmo** projeto Firebase de produção; confira o `project_id` dentro do JSON da conta de serviço.
4. Publicar regras e índices: `npx firebase deploy --only firestore:rules,firestore:indexes --project <projeto>`. Sem os índices, a agenda não carrega.
5. Criar a conta da profissional em Firebase Authentication e liberar o acesso: `npm run firebase:set-admin -- email@exemplo.com <id-do-salao>`.
6. Abrir o sistema no celular dela, entrar uma vez e adicionar o endereço à tela inicial.
7. Cadastrar junto com ela os serviços reais e conferir o expediente.
8. Smoke test em produção: entrar, abrir a Agenda, salvar o expediente e criar e cancelar um agendamento de teste. Conferir nos logs da Vercel que não houve 403 nem 500.

## Roteiro de uso para a profissional

1. Cadastre seus serviços e confira o expediente e o intervalo entre atendimentos.
2. Registre na Agenda todos os horários já marcados da semana, inclusive os do WhatsApp.
3. Ao marcar um novo horário, envie a mensagem de **Confirmação** pelo botão de WhatsApp.
4. Todo dia, use o painel **Lembretes das próximas 24 horas**; quando a cliente responder, toque em **Cliente confirmou**.
5. Se a cliente pedir para mudar, use **Reagendar**; se desistir, **Cancelar**.
6. Depois do atendimento, toque em **Concluir** e registre valor final, valor pago e forma; se ela não vier, **Faltou**.
7. No fim da semana, confira o **Financeiro** da semana e do mês.

## Perguntas para o feedback

- O que mais tomou tempo ou ficou confuso no dia a dia? Algo foi feito fora do sistema?
- Os horários sugeridos de 15 em 15 minutos funcionam? O intervalo de 10 minutos está certo?
- As mensagens de confirmação, lembrete e pós-atendimento soam como você? O que falta (endereço, orientações, Pix)?
- Você precisa desfazer um "Concluído" ou "Faltou" marcado por engano?
- Já aconteceu pagamento dividido (parte Pix, parte dinheiro) ou sinal antes do atendimento?
- Como deve funcionar a falta: cobrar, avisar, remarcar?
- Para a página pública: serviços com avaliação devem permitir escolher horário? A foto é obrigatória?
- Os totais do Financeiro batem com o que você controla hoje?
