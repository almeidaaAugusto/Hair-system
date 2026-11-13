# Perguntas em aberto e decisões pendentes

## Perguntas ainda abertas

### Fluxo público

1. Um serviço que exige avaliação deve permitir escolher horário? Se sim, o horário é provisoriamente bloqueado ou só é reservado após aprovação manual?
2. Como será o fluxo público de solicitação de alteração e identificação segura do agendamento?
3. Foto do cabelo é obrigatória para todos os serviços ou apenas para avaliação? Qual tamanho, formatos aceitos e tempo de retenção?

### Operação da agenda

5. Há exceções ao expediente normal — feriados, folgas, férias ou jornadas diferentes por dia — e como devem ser cadastradas?
6. Como uma futura interface poderá organizar períodos de férias e outros bloqueios de vários dias?
7. Alterar serviço ou horário pode mudar o preço e a duração já informados à cliente? Como registrar a justificativa e a versão anterior? (Hoje: reagendar mantém o snapshot; trocar o serviço tira um novo snapshot; a versão anterior não é guardada.)
8. Como tratar faltas: cobrar, manter saldo em aberto, enviar mensagem e/ou liberar um reagendamento? (Hoje a falta só fica registrada no histórico, sem valor e sem reagendamento automático.)

### Financeiro e comunicação

9. O pagamento pode ser dividido entre formas de pagamento? Sinais antes do atendimento entram no recebido? (Hoje: pagamento parcial é aceito com uma única forma e só após a conclusão.)
10. ~~O valor final de serviços variáveis é conhecido na confirmação, no atendimento ou depois?~~ Resolvido pelos requisitos: a profissional registra o valor final ao concluir ou depois, partindo do preço inicial do snapshot.
11. Concluído ou falta marcados por engano precisam poder ser desfeitos? Hoje são finais.
12. Quais dados devem constar no endereço e nas orientações de cada serviço? (Hoje as mensagens não incluem endereço nem orientações; a profissional pode completar o texto antes de enviar.)
13. Qual solução de WhatsApp será usada, quem aprova as mensagens e como será registrado consentimento e entrega?

### Segurança e operação

14. Qual conta administrativa será autorizada no Firebase Authentication e haverá mais de uma administradora no futuro?
15. Quais são os requisitos de retenção e exclusão de dados pessoais, fotos e histórico químico?
16. Quais relatórios precisam de exportação ou fechamento mensal?

## Requisitos confirmados que restringem as decisões

- Uma profissional no MVP, atendimento normal de segunda a sábado, 09:00–20:00, e intervalo de 10 minutos.
- Confirmação imediata apenas para serviços elegíveis; avaliação não recebe confirmação automática.
- Instantes persistidos em UTC, interface em `America/Sao_Paulo` e valores em centavos inteiros.
- Não haverá conta ou senha para clientes no MVP.

## Hipóteses técnicas a validar

- Avaliar identificação segura para futuras solicitações públicas de alteração.
- Armazenar fotos fora do Firestore, com acesso controlado, metadados mínimos e prazo de retenção definido.
- Implementar a integração de WhatsApp por uma camada de envio desacoplada, iniciando com registros de intenção/estado antes do provedor escolhido.
- Até haver uma estratégia de equipe, o acesso administrativo exigirá um token Firebase com as claims `admin: true` e `salonId`; o servidor determina o salão a partir dessas claims.
- Para o MVP, o expediente semanal será um único documento por `salonId` e profissional interna `primary`. A futura expansão para mais profissionais criará um documento de expediente por profissional, sem alterar o isolamento por salão.

## Itens fora do MVP

- Definir ou implantar pagamento online.
- Módulos de estoque, despesas, lucro, comissões, fidelidade e aplicativo móvel.

## Decisões confirmadas pelos documentos de requisitos

Não há antecedência mínima ou máxima artificial. A profissional efetiva cancelamentos. Bloqueios são manuais e simples, inclusive de dia inteiro; recorrência e férias não fazem parte deste marco. Cadastro separado de clientes fica para entregas futuras. A interface administrativa da agenda (dia, semana, mês, criação manual, bloqueio e cancelamento) foi entregue em 2026-11-12; serviços que exigem avaliação não são confirmados automaticamente; porém, no cadastro manual, a profissional pode registrar a exceção explicitamente (agendamento `confirmed` por decisão humana, com `exceptions` registrado; ver `docs/product/business-rules.md`). O fluxo público de avaliação segue em aberto.
