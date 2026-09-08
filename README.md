# Leitor de Codigo - App Auxiliar de PDV (Android)

MVP mobile em React Native + Expo com foco em operacao rapida no caixa e atendimento.

## Modos principais

- Caixa Scanner: leitura por camera + lista de itens + envio para PDV.
- Garcom Comanda: montagem por mesa/comanda + envio para caixa/cozinha.

## Multi-tenant (clientes independentes)

Cada cliente opera isolado por `tenant_id` + `license_key`.

- Login separado por cliente.
- Modulos liberados por licenca (feature flags).
- Historico e fila offline separados por tenant no SQLite.
- Payload com `tenantId` e `clientOrderId` (idempotencia).

## Stack

- React Native (Expo)
- TypeScript
- Expo Camera
- Expo SQLite (offline-first)
- Zustand
- Adapter de integracao multi-PDV

## Estrutura

- `src/integrations/contracts/pdvAdapter.ts`: contrato padrao de integracao.
- `src/integrations/adapters/mockPdvAdapter.ts`: adapter multi-tenant com fallback local e integracao REST.
- `src/integrations/http/varejaoBridge.ts`: funcoes plug-and-play de scan/add/checkout para backend estilo Varejao.
- `src/data/storage/localDb.ts`: historico + fila offline por tenant.
- `src/core/store.ts`: regras de negocio, envio e sincronizacao.
- `src/features/*`: telas do app.

## Bridge Plug-and-Play (Android)

Arquivo: `src/integrations/http/varejaoBridge.ts`

Funcoes prontas:

- `lookupProductByAnyCode(code, params)`
- `addScannedItemsToCart(cartId, items, params)`
- `loadCheckoutSummary(cartId, params)`

O bridge permite busca por codigo de barras/QR/SKU/ID e envio ao carrinho com `x-cart-id`, incluindo quantidade decimal para cenarios de venda por peso.

## Fluxo funcional

1. Login do operador.
2. Escolha de loja/caixa/sessao.
3. Escolha do modo.
4. Leitura por camera ou codigo manual.
5. Revisao.
6. Envio para sistema.
7. Se offline: fila local + sincronizacao depois.

---

# Roadmap de producao real

## 1. Scanner e operacao de caixa

- [ ] Testar leitura em dispositivos Android reais e em diferentes condicoes de luz
- [ ] Tratar camera indisponivel/permissao negada
- [ ] Evitar leitura duplicada acidental
- [ ] Feedback de produto encontrado/nao encontrado
- [ ] Suportar quantidade e itens pesaveis sem inconsistencias
- [ ] Confirmacao antes de operacoes irreversiveis

## 2. Offline-first e sincronizacao

- [ ] Definir estados da fila: pendente -> enviando -> confirmado -> falhou
- [ ] Retry com backoff seguro
- [ ] Idempotencia ponta a ponta com `clientOrderId`
- [ ] Evitar envio duplicado apos queda de internet
- [ ] Resolver conflitos de estoque/preco de forma explicita
- [ ] Limpeza segura da fila apos confirmacao
- [ ] Testar perda de internet durante envio
- [ ] Testar fechamento/reabertura do app com fila pendente

## 3. Integracao com PDV

- [ ] Contrato de API versionado
- [ ] Timeouts definidos
- [ ] Tratamento de 4xx/5xx
- [ ] Autenticacao segura do dispositivo/operador
- [ ] Nunca confiar em `tenantId` vindo apenas do cliente
- [ ] Testar Varejao e demais adapters reais
- [ ] Testar incompatibilidade de versao da API

## 4. Multi-tenant e licenca

- [ ] Testar isolamento completo entre tenants
- [ ] Revisar `license_key` e ciclo de vida da licenca
- [ ] Impedir acesso a dados de outro cliente
- [ ] Revogacao/expiracao de licenca
- [ ] Armazenamento seguro de credenciais e tokens
- [ ] Logs sem tokens/PII desnecessaria

## 5. Seguranca mobile

- [ ] Revisar armazenamento local de dados
- [ ] Proteger dados sensiveis em SQLite
- [ ] Validar TLS/HTTPS em producao
- [ ] Evitar segredos embutidos no bundle
- [ ] Revisar deep links e intents quando aplicavel
- [ ] Tratar permissao de camera de forma segura

## 6. Testes

- [ ] Testes unitarios das regras do store
- [ ] Testes da fila offline
- [ ] Testes de idempotencia
- [ ] Testes de integracao com adapter
- [ ] Testes de erro/retry
- [ ] Testes de regressao
- [ ] Teste em aparelhos Android reais
- [ ] Teste com conexao instavel

## 7. Performance e diagnostico

- [ ] Medir tempo de leitura e resposta da API
- [ ] Evitar bloqueio da UI durante sincronizacao
- [ ] Limitar tamanho da fila local
- [ ] Logs tecnicos para diagnostico sem dados sensiveis
- [ ] Tela/rotina de diagnostico para suporte

## 8. Distribuicao comercial

- [ ] Build de release assinado
- [ ] Configurar identificador e versao
- [ ] Politica de atualizacao
- [ ] Mecanismo seguro de configuracao do endpoint
- [ ] Onboarding do operador
- [ ] Manual rapido
- [ ] Checklist de homologacao por PDV

## Criterio de pronto

O LeitorCodigo so deve ser vendido como modulo pronto quando conseguir operar **leitura -> carrinho/comanda -> envio -> confirmacao -> recuperacao de falha** de forma confiavel, inclusive com internet instavel, sem duplicar operacoes ou misturar dados entre clientes.

## Rodar Android

```bash
npm install
npm run android
```

No celular:

- Instalar Expo Go.
- Estar na mesma rede do PC.
- Escanear o QR do terminal.

## Regra de continuidade

Priorizar **integridade offline/sincronizacao -> seguranca -> integracao -> testes -> dispositivos reais -> diagnostico -> distribuicao comercial** antes de adicionar novos modos.
