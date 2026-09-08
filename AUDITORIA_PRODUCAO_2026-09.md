# Auditoria de Producao — Setembro/2026

## Bloqueadores encontrados

### L1 — Autenticacao atual nao valida senha/operador real para tenants demo
- Arquivo: `src/integrations/adapters/mockPdvAdapter.ts`
- `authenticate()` exige apenas username/password nao vazios e valida a license key; para tenants comuns, o username e a role enviados pelo cliente entram diretamente no resultado de autenticacao.
- Isso permite impersonacao de operador no modo atual.
- Correcao: substituir o adapter de demo por autenticacao real do backend e nunca aceitar papel vindo da UI como autoridade.

### L2 — Token de admin e token de tenant sao mock e previsiveis
- Arquivo: `mockPdvAdapter.ts`
- Tokens sao strings derivadas de tenant/tempo, apropriadas para demo, mas nao para seguranca de producao.
- Correcao: token assinado/gerenciado pelo backend, expiracao, revogacao e armazenamento seguro.

### L3 — Estado offline e idempotencia ainda dependem do contrato do backend
- Arquivo: `src/core/store.ts`
- O app cria `clientOrderId` e fila local, mas a garantia de nao duplicar depende de o backend aceitar e persistir essa chave atomicamente.
- Correcao: contrato server-side com unique constraint/idempotencia e teste de reenvio apos timeout.

### L4 — Calculo de total no cliente nao pode ser autoridade financeira
- Arquivo: `src/core/store.ts`
- `total()` soma `subtotal` local e o payload envia preco/quantidade.
- Para PDV real, o backend deve recalcular preco, impostos/descontos e total a partir do catalogo autorizado.

## Pontos positivos

- Separacao por tenant no SQLite.
- Fila offline e sincronizacao explicitamente modeladas.
- `clientOrderId` preparado para idempotencia.
- Adapter de integracao desacopla o app do backend.

## Prioridade

1. Trocar autenticacao mock por autoridade server-side
2. Backend como autoridade de preco/total
3. Idempotencia atomicamente garantida
4. Testes de offline -> online, timeout, retry e duplicidade
5. Testes em dispositivos Android reais
