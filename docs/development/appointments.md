# Agenda administrativa

Todas as operações usam autenticação administrativa já existente e derivam salão e usuário do contexto verificado. As respostas têm `Cache-Control: no-store`. IDs não podem conter `/` e têm até 128 caracteres; queries e objetos são estritos, inclusive sem parâmetros duplicados.

| Método e caminho                                                             | Entrada              | Resposta                                            |
| ---------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| GET `/api/admin/appointments?date=2026-11-12`                                | data local           | `{ date, timezone, appointments, timeBlocks }`      |
| GET `/api/admin/appointments/availability?date=2026-11-12&serviceId=servico` | data local e serviço | data, fuso, serviço, duração, intervalo e `windows` |
| POST `/api/admin/appointments`                                               | JSON abaixo          | `{ appointment, replayed }`, 201 ou 200             |
| POST `/api/admin/appointments/[appointmentId]/cancel`                        | identificador na URL | `{ appointment }`, 200                              |
| POST `/api/admin/time-blocks`                                                | JSON abaixo          | `{ timeBlock, replayed }`, 201 ou 200               |
| POST `/api/admin/time-blocks/[blockId]/cancel`                               | identificador na URL | `{ timeBlock }`, 200                                |

Exemplos fictícios:

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174000",
  "serviceId": "servico",
  "startAt": "2026-11-12T12:00:00Z",
  "client": { "name": "Exemplo", "phone": "11999999999" },
  "source": "whatsapp"
}
```

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174001",
  "startAt": "2026-11-12T12:00:00Z",
  "endAt": "2026-11-12T13:00:00Z",
  "reason": "Pausa"
}
```

Os instantes são UTC com precisão de minuto, datas e expediente usam `America/Sao_Paulo`, e disponibilidade retorna janelas livres com último início possível. A reserva inclui a pausa na ocupação e a transação revalida o serviço e o expediente. Um UUID repetido com o mesmo conteúdo retorna o registro original (também se cancelado); conteúdo diferente gera conflito. Cancelamentos são idempotentes. Bloqueios são diários, simples e podem cobrir o dia inteiro.

JSON malformado retorna 400; autenticação/autorização 401/403; recurso ausente ou fora do salão 404; validação e período inválido 422; conflito, serviço inelegível, fora do expediente ou UUID divergente 409. Falhas internas retornam 500 genérico sem dados pessoais. Não há limite artificial de antecedência. O fluxo público, interface, cadastro separado de clientes, recorrência, férias, reagendamento e pagamentos ainda não estão implementados neste marco.

## Verificação local do marco

Verificado em 2026-11-12, sem implantação:

- Prettier nos arquivos alterados, `npm run lint` e `npm run typecheck`: aprovados.
- `npm test`: 263 testes em 30 arquivos aprovados, incluindo 19 testes HTTP.
- `npm run test:integration`: 31 testes aprovados nos emuladores de teste, cobrindo transações e Rules. Após centralizar a validação de reenvios, os seis casos de integração afetados foram executados novamente e aprovados.
- `npm run test:e2e`: três verificações de navegador aprovadas.
- `npm run build`: aprovado; no servidor compilado, as seis operações sem sessão retornaram 401 JSON com `no-store`, e as três páginas administrativas retornaram 307 para o login.

A integração exige Java 21 e usa somente `firebase.test.json` e o projeto fictício `demo-sistema-cabelo`. Execute emuladores, testes de navegador e build em sequência para evitar disputa por portas e pelo diretório `.next`. Os testes HTTP compartilham um arquivo de fixtures e mocks; a separação por rota pode ser feita quando a manutenção justificar.
