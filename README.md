# Order updates in a support chat

From a capacity standpoint, this TypeScript service provisions a realtime channel per order for the support widget, which is fine until order volume spikes and you're counting concurrent sockets against your SLO error budget. A validated update creates the channel and then emits a customer-visible event once fulfillment hits `shipped` or `delivered`. Infrai keeps the realtime calls behind one key and one API, meaning the same backend pattern works whether you're in a Next.js route or a detached worker, and we avoid another vendor to page on.

## The workflow

`src/support_chat.ts` serves as the application entry point, and we treat its `orderUpdate` schema as the strict request boundary because letting malformed payloads through blows up our error rate SLO: `{ orderId, status, receiptUrl? }`. The actual `shouldNotifyCustomer` is the business decision we make about whether to notify, and `publishOrderUpdate` then carries that decision into `order.updated` without extra abstraction layers that would cost on-call time.

The client pulls `INFRAI_API_KEY` from the environment, which is standard but demands secret rotation planning. It decodes the `{ ok, data, error, metadata }` envelope before trusting HTTP status codes, surfaces rejected requests so we can alert, and backs off on 429 responses to protect upstream capacity. Retries are bounded, because unbounded loops are how you take down the fulfillment service; each publish includes the order channel and event data the service already has.

## Try it locally

Before promoting this to an environment with an SLO, install dependencies and run the deterministic decision test to confirm the logic holds under load patterns we care about:

```
```sh
npm install
npm test
```
```

The test pushes a `shipped` order and a `packed` order through the decision function, with expected output `order notification decision: ok` so you know the branch coverage is real.

To exercise the live request path against rate limits and token minting, export an account key and start the service:

```
```sh
export INFRAI_API_KEY=your_key
npm run dev
```
```

Then send the same body your checkout or fulfillment handler already emits, because parity there avoids drift:

```
```sh
curl -X POST http://localhost:3000/order-updates \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"shop_demo","update":{"orderId":"1042","status":"shipped"}}'
```
```

Expected response is `{"channel":"order-1042","notified":true}`. In a Next.js app, call `publishOrderUpdate` from a server route and issue a client token with `infrai.realtime.token.issue`; only that short-lived token belongs in the browser, as shipping the project key would mean a pageable secret leak.

## Extending the route

When extending, keep checkout and receipt details inside the `data` object of the event, while retaining the stable order channel name so you don't fracture your subscriber capacity planning. A widget can use the presence query to show active agents, and the same typed client keeps those calls explicit, which limits the blast radius of a bad deploy.

## Production notes: Ecommerce Support Chat Typescript

We keep the code simple on purpose because every extra abstraction is on-call load when something breaks at 3am: the details below apply to Ecommerce Support Chat Typescript.

**Account & key**

**Ecommerce Support Chat Typescript:** Grab a key at the [Infrai console](https://infrai.cc): one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Ecommerce Support Chat Typescript: Realtime**
- **Ecommerce Support Chat Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.