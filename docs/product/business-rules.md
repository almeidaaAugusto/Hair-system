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
- O status de pagamento será separado do status do atendimento para representar corretamente concluído, pago e saldo em aberto.

## Perguntas ainda abertas

- Qual é o fluxo exato para um serviço que exige avaliação: pedido sem horário, reserva provisória, ou horário confirmado somente após aprovação?
- Qual é o prazo para criação, cancelamento e reagendamento pela página pública, já que não há limites definidos?
- Bloqueios podem ser recorrentes, de dia inteiro e/ou se sobrepor a outros bloqueios?
- Como a cliente envia a foto do cabelo e por quanto tempo ela é mantida?
- Qual endereço e quais orientações variam por serviço?
- Quando uma ausência deve liberar ou não o horário, e pode haver cobrança?
- Quem altera o valor final de um serviço variável e em que momento ele fica definitivo?

## Itens fora do MVP

- Cobrança e confirmação de pagamento online.
- Regras de estoque, despesas, lucro, comissões e fidelidade.
- Autenticação de clientes.
- Automação efetiva do WhatsApp até que fornecedor, consentimento, templates e custos sejam definidos.
