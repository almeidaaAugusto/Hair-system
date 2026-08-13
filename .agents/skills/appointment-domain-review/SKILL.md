---
name: appointment-domain-review
description: Revisa alterações no domínio de agendamento. Use sempre que uma mudança afetar disponibilidade, duração, conflitos, cancelamentos, bloqueios, confirmação de atendimentos ou timezone.
---

# Revisão do domínio de agendamento

Revise o diff e os módulos de domínio relacionados antes de aprovar a alteração. Mantenha regras de negócio fora de componentes React e trate toda escrita pública de agendamento no servidor.

## Invariantes obrigatórias

Confirme que a alteração preserva todas as invariantes abaixo:

- Um profissional não pode ter atendimentos conflitantes.
- A duração ocupada inclui o intervalo configurado de 10 minutos.
- Um atendimento não começa fora do expediente nem termina depois dele.
- Um horário cancelado volta a ficar disponível.
- Bloqueios impedem reservas no período bloqueado.
- Serviços que exigem avaliação não recebem confirmação automática.
- Datas são persistidas em UTC e a interface converte e exibe em `America/Sao_Paulo`.
- Valores monetários permanecem em centavos inteiros; snapshots de serviço, duração e preço são preservados no agendamento.
- Cada documento de negócio contém `salonId`.
- Um atendimento só compõe o total recebido quando está concluído e pago.
- Um lembrete não pode ser enviado mais de uma vez.

## Concorrência e persistência

Exija que a confirmação de horário seja atômica: use transação no servidor ao verificar e gravar disponibilidade. Não aceite escrita direta do navegador em `appointments`.

Procure especialmente por condições de corrida, sobreposição nos limites (fim de um atendimento e início de outro), consultas dependentes do relógio do navegador, reenvios não idempotentes e alterações que recalculam snapshots históricos indevidamente.

## Testes exigidos

Não aprove mudanças sem testes unitários ou de integração que incluam, para cada regra afetada, pelo menos um caso de sucesso e um de falha.

Exija também:

1. Um teste de concorrência com duas tentativas simultâneas para o mesmo profissional e horário; apenas uma pode confirmar.
2. Limites de expediente: início exatamente no primeiro e no último horário permitido, e rejeição de início antes/depois ou término após o expediente.
3. Duração com intervalo de 10 minutos, incluindo o limite em que o próximo atendimento começa exatamente após a ocupação total.
4. Cancelamento que libera o horário e bloqueio que o torna indisponível.
5. Conversão e persistência em `America/Sao_Paulo`, incluindo casos próximos à virada do dia.
6. Serviço que exige avaliação, reenvio idempotente da requisição e edição de agendamento sem corromper snapshots históricos.

Relate invariantes verificadas, lacunas de teste e qualquer risco que impeça a aprovação.
