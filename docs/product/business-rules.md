# Regras de negócio

## Requisitos confirmados

### Agenda e disponibilidade

- Há uma única profissional no MVP.
- O expediente normal é de segunda a sábado, das 09:00 às 20:00; o painel precisa permitir configurar o horário de atendimento.
- A ocupação de um atendimento é a duração do serviço somada ao intervalo configurado de 10 minutos.
- Não pode haver dois atendimentos conflitantes para a mesma profissional.
- Um atendimento não pode começar fora do expediente nem terminar depois dele.
- Cancelar um atendimento devolve o horário à disponibilidade.
- Um bloqueio administrativo deve impedir reservas no intervalo bloqueado.
- Agendamentos podem ser criados pela página pública ou manualmente no painel a partir de contato pelo WhatsApp.

### Serviços, confirmação e alterações

- Um serviço possui duração e preço inicial; o preço pode ser fixo ou variar conforme características do cabelo, produto e tempo necessário.
- Um serviço possui situação ativa ou inativa; serviços inativos permanecem no catálogo administrativo, mas não devem ser oferecidos em futuros fluxos públicos.
- Serviços que exigem avaliação não podem ser confirmados automaticamente.
- Serviços elegíveis devem ser confirmados de imediato quando o horário estiver disponível.
- O agendamento guarda snapshots do serviço, duração e preço para preservar o histórico quando o cadastro do serviço mudar.
- A profissional pode alterar data/hora ou serviço, cancelar, concluir e marcar falta.
- A confirmação ao cliente inclui serviço, data/hora, duração aproximada, preço ou valor inicial, endereço e orientações prévias.

### Dados, tempo e dinheiro

- Cada documento de negócio possui `salonId`.
- Instantes são armazenados em UTC e apresentados em `America/Sao_Paulo`.
- Dinheiro é armazenado em centavos inteiros, nunca em ponto flutuante.
- Dados pessoais, telefone e tokens não devem ser registrados em logs.
- Formas de pagamento aceitas: Pix, dinheiro, débito e crédito.
- Um atendimento só conta como recebido quando estiver concluído e pago; valores não pagos permanecem em aberto.

### Mensagens

- O lembrete é planejado para 24 horas antes do atendimento.
- Existe interesse em confirmação, lembrete, pedido de confirmação, orientações prévias e mensagem pós-atendimento.
- Um lembrete não pode ser enviado mais de uma vez.

## Hipóteses técnicas

- A verificação e confirmação de disponibilidade ocorrerão no servidor em transação; o navegador não grava diretamente em `appointments`.
- Reagendamentos e alterações de serviço recalcularão apenas os dados operacionais do agendamento editado, preservando os snapshots já registrados conforme a política definida.
- Operações públicas terão chave de idempotência para evitar duplicidade em reenvios.
- O status de pagamento é separado do status do atendimento: um atendimento concluído pode ficar sem pagamento registrado, não pago, parcialmente pago ou pago.
- Concluir e marcar falta só são possíveis a partir do horário de início; concluído e falta não podem ser cancelados e continuam ocupando o horário.
- No MVP, cada atendimento tem um único registro de pagamento (valor final, valor pago e forma), que pode ser corrigido; pagamento dividido entre formas e sinal antes do atendimento não são suportados.

## Perguntas ainda abertas

- Qual é o fluxo exato para um serviço que exige avaliação: pedido sem horário, reserva provisória, ou horário confirmado somente após aprovação?
- Como será o fluxo público de solicitação de alteração de um agendamento?
- Como a cliente envia a foto do cabelo e por quanto tempo ela é mantida?
- Qual endereço e quais orientações variam por serviço?
- Quando uma ausência deve liberar ou não o horário, e pode haver cobrança?
- Quem altera o valor final de um serviço variável e em que momento ele fica definitivo?

## Itens fora do MVP

- Cobrança e confirmação de pagamento online.
- Regras de estoque, despesas, lucro, comissões e fidelidade.
- Autenticação de clientes.
- Automação efetiva do WhatsApp até que fornecedor, consentimento, templates e custos sejam definidos.

## Decisões para a agenda administrativa

### Exceções administrativas no cadastro manual

A profissional precisa lançar clientes já combinadas pelo WhatsApp, mesmo fora do expediente ou para serviços que exigem avaliação. Por isso, ao criar ou reagendar/trocar serviço pelo painel, ela pode confirmar explicitamente uma exceção (`allowExceptions: true`):

- A exceção dispensa apenas (a) os limites de expediente e dia não útil e (b) a restrição de avaliação do serviço.
- Continuam sempre proibidos: conflito com outro atendimento (incluindo o intervalo de 10 minutos), sobreposição com bloqueio, serviço inativo, intervalo inválido e atendimento que não começa e termina no mesmo dia local (`America/Sao_Paulo`).
- O agendamento guarda `exceptions` (`outsideBusinessHours`, `requiresEvaluation`) com somente as exceções efetivamente usadas; é vazio quando nenhuma foi necessária. Ao reagendar, o campo é recalculado.
- Um agendamento de serviço com avaliação criado com exceção fica com o mesmo status de qualquer agendamento manual (`confirmed`): é decisão humana da profissional, não confirmação automática do sistema. A página pública continua sem confirmar serviços com avaliação.
- Sem a exceção, os erros são distinguíveis: `OUTSIDE_BUSINESS_HOURS` e `SERVICE_REQUIRES_EVALUATION` (ambos contornáveis, `overridable: true`) e `SERVICE_INACTIVE` (nunca contornável).
- A consulta de horários livres não muda: continua respeitando expediente e recusando serviços com avaliação.

- Não há antecedência mínima ou máxima artificial. O cancelamento é efetivado pela profissional.
- Bloqueios são manuais e simples, podem cobrir um dia inteiro e não podem colidir com ocupações ativas; recorrência e férias ficam para depois.
- O intervalo completo, inclusive a pausa configurada, cabe no expediente. Reservas confirmadas e bloqueios ativos ocupam períodos semiabertos; cancelados liberam o horário.
- Serviços inativos ou que exigem avaliação não são confirmados neste comando (salvo pela exceção administrativa abaixo). A reserva guarda nome e telefone como snapshots mínimos, sem cadastro separado de clientes.
