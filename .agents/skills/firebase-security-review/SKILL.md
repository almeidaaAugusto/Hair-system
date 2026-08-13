---
name: firebase-security-review
description: Revisa Firestore, Firebase Authentication, Cloud Functions e regras de segurança. Use quando houver alteração de banco, autenticação, endpoints públicos, dados pessoais ou permissões.
---

# Firebase security review

## Verificações

- Clientes públicos não podem gravar diretamente em appointments.
- Operações críticas devem executar no servidor.
- Toda entrada externa deve ser validada com schema.
- Firestore Rules devem seguir menor privilégio.
- Usuários administrativos somente acessam o próprio salonId.
- Não confiar em salonId enviado pelo navegador.
- Não expor secrets em variáveis NEXT_PUBLIC.
- Não gravar telefone completo em logs.
- Não permitir alteração de preço recebido pelo cliente público.
- Transações devem proteger a disponibilidade.
- Endpoints públicos devem considerar abuso e rate limiting.
- Consultas devem possuir índices adequados.
- Testes das Firestore Rules devem ser executados no Emulator Suite.

## Resultado

Classifique cada problema como:

- crítico;
- alto;
- médio;
- baixo.

Para cada problema, informe:

- arquivo e trecho;
- cenário de exploração ou falha;
- correção recomendada;
- teste de regressão necessário.
