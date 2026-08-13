---
name: quality-gate
description: Executa a revisão final de uma tarefa antes de commit ou pull request. Use quando uma implementação estiver aparentemente concluída.
---

# Quality gate

1. Leia o diff completo.
2. Confirme que a mudança atende aos critérios de aceitação.
3. Procure código não utilizado, duplicação e abstrações desnecessárias.
4. Confirme tratamento de loading, vazio e erro.
5. Verifique acessibilidade básica.
6. Verifique validação no cliente e no servidor.
7. Verifique regras de autorização.
8. Execute:
   - formatter;
   - lint;
   - typecheck;
   - testes unitários;
   - testes de integração relevantes;
   - testes E2E relevantes.
9. Não corrija silenciosamente mudanças fora do escopo.
10. Apresente os comandos executados e seus resultados.

Aprovação exige todos os checks obrigatórios passando.
