import { z } from "zod";
import { createServer } from "node:http";
import { InfraiClient, infrai } from "./infra_client.js";
import { InfraiError } from "./infra_client.js";

export const orderUpdate = z.object({ orderId: z.string().min(1), status: z.enum(["paid", "packed", "shipped", "delivered"]), receiptUrl: z.string().url().optional() });
export type OrderUpdate = z.infer<typeof orderUpdate>;

export function shouldNotifyCustomer(update: OrderUpdate): boolean {
  return update.status === "shipped" || update.status === "delivered";
}

export async function publishOrderUpdate(client: InfraiClient, accountId: string, update: OrderUpdate) {
  const parsed = orderUpdate.parse(update);
  const channel = `order-${parsed.orderId}`;
  await infrai.realtime.channel.create(client, channel);
  if (shouldNotifyCustomer(parsed)) {
    await infrai.realtime.publish(client, channel, "order.updated", parsed, accountId);
  }
  return { channel, notified: shouldNotifyCustomer(parsed) };
}

export function startSupportChatService(client: InfraiClient, port = 3000) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/order-updates") {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = z.object({ accountId: z.string().min(1), update: orderUpdate }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const result = await publishOrderUpdate(client, body.accountId, body.update);
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error instanceof InfraiError && error.status < 500 ? error.status : 502;
      const message = error instanceof Error ? error.message : "Request failed";
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
    }
  }).listen(port);
}

if (process.argv[1]?.endsWith("support_chat.ts")) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  startSupportChatService(new InfraiClient(key));
  console.log("support chat service listening on http://localhost:3000");
}
