# MVP — sistema de agendamento

## Objetivo

Organizar o agendamento de uma profissional de cabelo, permitindo que a cliente reserve pelo fluxo público e que a profissional administre agenda, pagamentos e comunicação de acompanhamento.

## Requisitos confirmados

- Uma única profissional atende no lançamento.
- A captação ocorre por Instagram, WhatsApp e indicação; o link público de agendamento atende especialmente ao fluxo vindo do Instagram.
- A cliente escolhe serviço, data e horário, informa seus dados e recebe o resultado do agendamento.
- A profissional cadastra serviços com duração e preço inicial, marcando os que exigem avaliação prévia.
- Alguns preços são fixos; outros variam por tamanho, volume e condição do cabelo, produto utilizado e tempo necessário.
- O expediente normal é de segunda a sábado, das 09:00 às 20:00, com configuração administrativa desse horário.
- Cada atendimento reserva a duração do serviço mais 10 minutos de intervalo.
- Agendamentos elegíveis são confirmados imediatamente; serviços que exigem avaliação não são confirmados automaticamente.
- O cadastro público solicita nome, serviço, foto do cabelo e informações sobre procedimentos anteriores.
- A confirmação apresenta serviço, data e horário, duração aproximada, preço ou valor inicial, endereço e orientações prévias.
- Agendamentos recebidos no WhatsApp podem ser cadastrados manualmente durante a adaptação.
- A agenda possui visões diária, semanal e mensal; permite criar, reagendar, alterar serviço, cancelar, bloquear horário, concluir e registrar falta.
- O atendimento mostra rapidamente nome, serviço, data/hora e duração aproximada; a agenda também oferece abertura de conversa no WhatsApp.
- São aceitos Pix, dinheiro, cartão de débito e cartão de crédito.
- Após o atendimento, registra-se o valor do serviço e eventual valor em aberto.
- Os indicadores incluem recebidos por dia, semana, mês e serviço; valores em aberto; e formas de pagamento mais utilizadas.
- Um atendimento só entra no total recebido quando estiver concluído e pago.
- Há estrutura para confirmação e lembrete pelo WhatsApp: lembrete 24 horas antes, pedido de confirmação e mensagens de confirmação, orientação e pós-atendimento.

## Hipóteses técnicas

- A página pública não terá conta nem senha para clientes.
- A foto e o histórico de procedimentos serão tratados como dados do pedido de avaliação; a estratégia de armazenamento e retenção será definida antes da implementação.
- Serviços de avaliação gerarão uma solicitação ou agendamento pendente para ação manual, sem ocupar um horário confirmado até a regra operacional ser definida.
- A agenda será exibida em `America/Sao_Paulo`, ainda que os instantes sejam persistidos em UTC.

## Perguntas ainda abertas

- Definir o fluxo de avaliação, os prazos de criação/cancelamento/reagendamento e o tratamento de fotos antes de liberar o agendamento público.
- Ver [perguntas em aberto](open-questions.md) para a lista completa de decisões pendentes.

## Itens fora do MVP

- Pagamento online.
- Estoque, despesas, lucro contábil e comissões.
- Programa de fidelidade.
- Aplicativo mobile nativo.
- Conta ou senha para clientes.
- Múltiplas profissionais e escolha de profissional pela cliente; a estrutura pode preservar essa evolução, mas não faz parte do lançamento.

## Critérios de sucesso iniciais

- Não permitir sobreposição de atendimentos nem reservas fora do expediente.
- Reduzir o registro manual de horários sem perder os agendamentos vindos do WhatsApp.
- Permitir consultar rapidamente a agenda e os recebimentos do período.
- Preparar dados e fluxos para comunicações por WhatsApp sem prometer automação antes da decisão de integração.
