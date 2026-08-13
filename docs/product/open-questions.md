# Perguntas em aberto e decisões pendentes

## Perguntas ainda abertas

### Fluxo público

1. Um serviço que exige avaliação deve permitir escolher horário? Se sim, o horário é provisoriamente bloqueado ou só é reservado após aprovação manual?
2. Quais são os prazos mínimos e máximos para criar, cancelar e reagendar pela página pública?
3. A cliente poderá alterar ou cancelar sem autenticação? Qual mecanismo seguro identificará o agendamento?
4. Foto do cabelo é obrigatória para todos os serviços ou apenas para avaliação? Qual tamanho, formatos aceitos e tempo de retenção?

### Operação da agenda

5. Há exceções ao expediente normal — feriados, folgas, férias ou jornadas diferentes por dia — e como devem ser cadastradas?
6. Bloqueios podem se repetir e abrangem apenas intervalos ou também dias inteiros?
7. Alterar serviço ou horário pode mudar o preço e a duração já informados à cliente? Como registrar a justificativa e a versão anterior?
8. Como tratar faltas: cobrar, manter saldo em aberto, enviar mensagem e/ou liberar um reagendamento?

### Financeiro e comunicação

9. O pagamento pode ser parcial ou dividido entre formas de pagamento?
10. O valor final de serviços variáveis é conhecido na confirmação, no atendimento ou depois? Quem o atualiza?
11. Quais dados devem constar no endereço e nas orientações de cada serviço?
12. Qual solução de WhatsApp será usada, quem aprova as mensagens e como será registrado consentimento e entrega?

### Segurança e operação

13. Qual conta administrativa será autorizada no Firebase Authentication e haverá mais de uma administradora no futuro?
14. Quais são os requisitos de retenção e exclusão de dados pessoais, fotos e histórico químico?
15. Quais relatórios precisam de exportação ou fechamento mensal?

## Requisitos confirmados que restringem as decisões

- Uma profissional no MVP, atendimento normal de segunda a sábado, 09:00–20:00, e intervalo de 10 minutos.
- Confirmação imediata apenas para serviços elegíveis; avaliação não recebe confirmação automática.
- Instantes persistidos em UTC, interface em `America/Sao_Paulo` e valores em centavos inteiros.
- Não haverá conta ou senha para clientes no MVP.

## Hipóteses técnicas a validar

- Usar um link opaco e com expiração para ações públicas de alteração/cancelamento, caso esse fluxo seja aprovado.
- Armazenar fotos fora do Firestore, com acesso controlado, metadados mínimos e prazo de retenção definido.
- Implementar a integração de WhatsApp por uma camada de envio desacoplada, iniciando com registros de intenção/estado antes do provedor escolhido.
- Até haver uma estratégia de equipe, o acesso administrativo exigirá um token Firebase com as claims `admin: true` e `salonId`; o servidor determina o salão a partir dessas claims.
- Para o MVP, o expediente semanal será um único documento por `salonId` e profissional interna `primary`. A futura expansão para mais profissionais criará um documento de expediente por profissional, sem alterar o isolamento por salão.

## Itens fora do MVP

- Definir ou implantar pagamento online.
- Módulos de estoque, despesas, lucro, comissões, fidelidade e aplicativo móvel.
