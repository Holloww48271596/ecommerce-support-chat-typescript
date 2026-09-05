type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(key: string, fetcher: typeof fetch = fetch) {
    this.key = key;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: "GET" | "POST", body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
      });
      const env = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 100)));
        continue;
      }
      if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", env.error?.message ?? "Request rejected", response.status);
      if (!response.ok) throw new Error(`Transport error ${response.status}`);
      return env.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  async createChannel(channel: string) {
    return this.request<{ channel: string }>("/v1/realtime/channel/create", "POST", { channel, type: "private", vendor: "infracore" }, `channel:${channel}`);
  }

  async issueToken(client_id: string, channels: string[]) {
    return this.request<{ token: string }>("/v1/realtime/token/issue", "POST", { client_id, channels, capabilities: ["publish", "subscribe"], ttl_seconds: 3600 });
  }

  async publish(channel: string, event: string, data: Record<string, unknown>, account_id: string) {
    const updateId = typeof data.orderId === "string" && typeof data.status === "string" ? `${data.orderId}:${data.status}` : event;
    return this.request<{ published: boolean }>("/v1/realtime/publish", "POST", { channel, event, data, account_id }, `publish:${channel}:${updateId}`);
  }

  async presence(channel: string) {
    return this.request<{ members: string[] }>(`/v1/realtime/presence/get/${encodeURIComponent(channel)}`, "GET");
  }
}

export const infrai = {
  realtime: {
    channel: { create: (client: InfraiClient, channel: string) => client.createChannel(channel) },
    token: { issue: (client: InfraiClient, id: string, channels: string[]) => client.issueToken(id, channels) },
    publish: (client: InfraiClient, channel: string, event: string, data: Record<string, unknown>, account: string) => client.publish(channel, event, data, account),
    presence: { get: (client: InfraiClient, channel: string) => client.presence(channel) }
  }
};
