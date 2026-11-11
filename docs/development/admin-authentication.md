# Acesso administrativo

O painel usa uma conta de e-mail e senha do Firebase Authentication com as claims
`admin: true` e `salonId`. Não existe cadastro público de administradoras nem conta
para clientes.

## Entrar e sair

- Acesse `/login`. Depois de entrar, o destino padrão é `/admin/services`.
- O acesso direto a `/admin`, `/admin/services` ou `/admin/business-hours` exige
  sessão verificada no servidor. Sem cookie, o login preserva o destino interno.
- A sessão dura cinco dias e permanece válida entre navegações e atualizações da
  página. O cookie é HttpOnly, SameSite=Lax e Secure em produção.
- `Sair` remove a sessão deste navegador. As sessões de outros dispositivos
  permanecem válidas.
- Cookies inválidos ou revogados levam ao login; o formulário remove o cookie
  antigo antes de permitir outra tentativa.

O Firebase no navegador mantém a autenticação apenas em memória durante a troca
do ID token pelo cookie. Cada API administrativa verifica a identidade novamente
e determina o salão pelas claims verificadas.

Erros internos e de configuração identificados pelo SDK geram erro temporário e
preservam a sessão. A edição do expediente exige uma leitura bem-sucedida da configuração; se a leitura
falhar, use `Tentar novamente` antes de editar ou salvar.

## Autorizar uma conta

Crie a conta de e-mail e senha no Firebase Authentication. Com as credenciais
privadas configuradas fora do repositório, execute:

```powershell
npm run firebase:set-admin -- administradora@exemplo.com identificador-do-salao
```

O script preserva outras claims e revoga os tokens antigos depois da mudança de
permissão. A administradora deve entrar novamente. Nunca exponha a conta de
serviço em variáveis `NEXT_PUBLIC_`.

O diagrama conceitual dos requisitos menciona papéis de usuário e hash de senha.
A implementação usa Firebase Authentication e as claims acima; não armazena
senhas nem hashes próprios no Firestore.

## Verificação local

Pré-requisitos: dependências instaladas com `npm ci`, Java 21 ou superior no
`PATH` e o Chromium do Playwright (`npx playwright install chromium`).

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e:auth
npm run test:e2e
npm run build
```

Os testes de integração e de autenticação iniciam os emuladores de Authentication
e Firestore no projeto fictício `demo-sistema-cabelo`, usando `firebase.test.json`.
A configuração de desenvolvimento em `firebase.json` permanece independente.
A suíte de autenticação provisiona contas locais, usa o servidor na porta 3101 e testa login, recusas de
acesso, persistência, redirecionamentos e logout. O smoke test usa a porta 3100.
Execute essas suítes em sequência para evitar disputa pelas portas dos
emuladores e pelo diretório de desenvolvimento do Next.js.

As portas 8085 (Firestore), 9098 (Authentication), 4405 (hub), 4505 (logging),
3100 e 3101 devem estar livres. Os emuladores de teste não usam a porta 8080,
que pode estar ocupada pelo Docker.
Não use credenciais nem contas de produção para os testes.

`npm run dev` usa Webpack. Durante a validação no Windows, o servidor Turbopack
retornou 404 para os endpoints após reiniciar, embora os handlers compilados
estivessem corretos. O Webpack permitiu testar as rotas HTTP reais. A compilação
de produção continua usando `next build`.

Pendência conhecida: uma falha na leitura dos serviços ainda exibe a mensagem de
catálogo vazio junto do erro. Essa distinção visual fica para a próxima etapa.
