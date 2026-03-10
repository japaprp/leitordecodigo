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

Credenciais demo:

- `lanchonete_demo` + `LANCH-2026` (scanner + comanda)
- `hortfruit_demo` + `HORT-2026` (scanner ativo, comanda bloqueada)

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

O que esse bridge resolve:

- Busca produto por codigo de barras, QR, ID interno, SKU, `id` e `q`.
- Envio para `/carrinho` com `x-cart-id`.
- Leitura de `/checkout` para total em tempo real.
- Fallback quando nao existe barcode/QR (usa ID/codigo interno/nome).
- Quantidade com decimal para cenarios `kg`.

Exemplo rapido:

```ts
import {
  lookupProductByAnyCode,
  addScannedItemsToCart,
  loadCheckoutSummary,
} from './src/integrations/http/varejaoBridge';

const params = {
  baseUrl: 'https://varejao-backend-1.onrender.com',
  productEndpoint: '/produtos',
  cartEndpoint: '/carrinho',
  checkoutEndpoint: '/checkout',
  timeoutMs: 10000,
};

const product = await lookupProductByAnyCode('7898632473278', params);

if (product) {
  await addScannedItemsToCart('caixa-01', [
    {
      barcode: product.barcode,
      productId: product.productId,
      name: product.name,
      unitPrice: product.unitPrice,
      quantity: 0.5,
      subtotal: product.unitPrice * 0.5,
    },
  ], params);

  const checkout = await loadCheckoutSummary('caixa-01', params);
  console.log(checkout.total);
}
```

## Rodar (Android)

```bash
npm install
npm run android
```

No celular:

- Instalar Expo Go.
- Estar na mesma rede do PC.
- Escanear o QR do terminal.

## Fluxo funcional

1. Login do operador.
2. Escolha de loja/caixa/sessao.
3. Escolha do modo.
4. Leitura por camera ou codigo manual.
5. Revisao.
6. Envio para sistema.
7. Se offline: fila local + sincronizacao depois.

## Observacoes

- O adapter agora ja conversa com API REST quando configurada.
- Se a API cair, o app continua com fila offline.
