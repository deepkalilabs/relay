const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export interface RemoteHttpClientOptions {
  retryDelayMs?: number;
  timeoutMs?: number;
}

class RemoteStorageTransportError extends Error {
  constructor() {
    super("Remote storage could not be reached.");
    this.name = "RemoteStorageTransportError";
  }
}

export class RemoteHttpClient {
  private readonly baseUrl: URL;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string,
    private readonly bearerToken: string,
    options: RemoteHttpClientOptions = {},
  ) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async request(pathname: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const headers = new Headers(init.headers);
        headers.set("accept", "application/json");
        headers.set("authorization", `Bearer ${this.bearerToken}`);
        const response = await fetch(new URL(pathname.replace(/^\//, ""), this.baseUrl), {
          ...init,
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) return response;
        await response.body?.cancel().catch(() => undefined);
      } catch {
        if (attempt === 1) throw new RemoteStorageTransportError();
      }
      if (this.retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
    throw new RemoteStorageTransportError();
  }
}
