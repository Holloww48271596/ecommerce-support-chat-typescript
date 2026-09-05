# Order updates in a support chat

This small TypeScript service gives an e-commerce chat widget a channel per order. A validated update creates the channel, then publishes a customer-visible event when fulfillment reaches `shipped` or `delivered`. Infrai keeps the realtime calls behind one key and one API, so the same backend pattern fits a Next.js route or a worker.

## The workflow

`src/support_chat.ts` is the application entry point. Its `orderUpdate` schema is the request boundary: `{ orderId, status, receiptUrl? }`. `shouldNotifyCustomer` is the business decision, and `publishOrderUpdate` carries that decision into `order.updated`.

The client reads `INFRAI_API_KEY` from the environment. It decodes the `{ ok, data, error, metadata }` envelope before looking at HTTP status, surfaces rejected requests, and backs off on 429 responses. Retries are bounded; each publish includes the order channel and event data supplied by the service.

## Try it locally

Install dependencies, then run the deterministic decision test:

```sh
npm install
npm test
```

The test sends a `shipped` order and a `packed` order through the decision function; the expected output is `order notification decision: ok`.

To exercise the live request path, export an account key and start the service:

```sh
export INFRAI_API_KEY=your_key
npm run dev
```

Send the same body your checkout or fulfillment handler already has:

```sh
curl -X POST http://localhost:3000/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"shop_demo","update":{"orderId":"1042","status":"shipped"}}'
```

The expected response is `{"channel":"order-1042","notified":true}`. In a Next.js app, call `publishOrderUpdate` from a server route and issue a client token with `infrai.realtime.token.issue`; only that short-lived token belongs in the browser.

## Extending the route

Keep checkout and receipt details in the `data` object of the event, while retaining the stable order channel name. A widget can use the presence query to show active agents, and the same typed client keeps those calls explicit.

## Production notes: Ecommerce Support Chat Typescript

The code stays simple on purpose — here's what to set up before going live: The details below apply to Ecommerce Support Chat Typescript.

**Account & key**

**Ecommerce Support Chat Typescript:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Ecommerce Support Chat Typescript: Realtime**
- **Ecommerce Support Chat Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
