# Visão geral da arquitetura

## Requisitos confirmados

- A aplicação usa Next.js com App Router e TypeScript em modo estrito.
- O painel administrativo usa Firebase Authentication.
- Os dados de negócio ficam no Cloud Firestore; operações críticas usam Cloud Functions.
- Firebase Emulator Suite é o ambiente de desenvolvimento e testes de integração.
- Zod valida entradas, React Hook Form implementa formulários, Vitest cobre testes unitários e Playwright cobre fluxos ponta a ponta.
- O domínio não fica em componentes React.
- Escritas públicas de agendamento passam pelo servidor; o navegador não grava diretamente em `appointments`.
- A confirmação de horário usa transação.
- Persistir datas em UTC, exibir em `America/Sao_Paulo`, persistir dinheiro em centavos inteiros e incluir `salonId` em todo documento de negócio.

## Hipóteses técnicas

```text
Painel administrativo → Route Handlers Next.js (Node, autenticação e validação)
                                  ↓
                     Domínio e repositório
                                  ↓
                   Firestore (transações e dados)
```

- Encapsular comandos críticos — confirmar, reagendar, cancelar, bloquear, concluir e registrar pagamento — em funções de servidor que validam entrada e autorização antes da escrita.
- Concentrar cálculo de disponibilidade, duração ocupada, conflitos, limites de expediente e transições de status em módulos puros de domínio, testáveis com Vitest.
- Negar ao navegador leituras e escritas diretas das coleções de agenda; o servidor verifica identidade e escopo `salonId`.
- Representar integrações de WhatsApp como adaptadores; a definição do provedor não deve vazar para a regra de negócio.
- Usar transações do Firestore nas mutações que dependem de disponibilidade, para que tentativas concorrentes não confirmem o mesmo horário.
- Executar testes contra emuladores quando houver Firestore, Authentication, Functions ou regras envolvidas.

### Dependências da fundação

- `next`, `react` e `react-dom` são a base necessária do framework acordado.
- `firebase` implementará os clientes de Firebase Authentication e Cloud Firestore previstos na arquitetura.
- `zod` e `react-hook-form` fazem parte da stack definida e serão usados quando os formulários e validações forem implementados.
- `firebase-admin` é necessário no servidor para verificar tokens do Firebase Authentication e persistir comandos administrativos sem liberar escrita direta no Firestore. Ele permanece fora do bundle do navegador e evita uma implementação própria de verificação de tokens.
- As demais dependências são exclusivamente de desenvolvimento, testes, lint, formatação ou emuladores.

## Perguntas ainda abertas

- A página pública chamará Route Handlers do Next.js, Cloud Functions diretamente ou ambos? A decisão deve considerar autenticação, implantação e observabilidade.
- Onde serão armazenadas fotos e documentos enviados pela cliente, e qual regra de acesso/retenção será aplicada?
- Qual provedor de WhatsApp atenderá confirmação e lembretes, e como serão credenciais, templates e consentimento gerenciados?
- Qual estratégia de autorização administrativa suportará uma futura equipe sem comprometer o MVP de uma profissional?

### Hipótese adotada para o cadastro de serviços

- Um token administrativo possui as claims `admin: true` e `salonId`. As rotas de administração verificam ambas no servidor e derivam o `salonId` do token; o cliente não o envia.

## Itens fora do MVP

- Integração de gateway de pagamento.
- Arquitetura de estoque, despesas, lucro, comissões ou fidelidade.
- Aplicativo mobile nativo e identidade autenticada de clientes.

## Decisão: backend administrativo confiável

Neste marco, Route Handlers Next.js no runtime Node autenticam e validam cada operação administrativa e executam transações no Firestore via Admin SDK. Esse servidor confiável é equivalente ao backend previsto nos requisitos; domínio e repositório independem dos handlers e permitem futura extração para Cloud Functions. As regras negam acesso direto do navegador às coleções de agenda. O fluxo público permanece para outra entrega.
