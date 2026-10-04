import { vi } from "vitest";

// The network is the only thing tests replace: each test answers the app's
// requests through `fetch` and can inspect what was sent. A reply may be a
// promise, to hold a response back until the test lets it through.
export type SentRequest = {
  url: string;
  path: string;
  method: string;
  headers: Headers;
  body: unknown;
};

export type Reply = { status?: number; json?: unknown } | "network-error";

export function stubFetch(reply: (request: SentRequest) => Reply | Promise<Reply>): SentRequest[] {
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const request: SentRequest = {
        url,
        path: new URL(url, "http://web.test").pathname,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      };
      sent.push(request);
      const answer = await reply(request);
      if (answer === "network-error") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(answer.json ?? {}), {
        status: answer.status ?? 200,
        headers: { "content-type": "application/json" }
      });
    })
  );
  return sent;
}

export function storeSession(session = { token: "test-token", playerId: "p1", playerName: "Alice" }) {
  window.localStorage.setItem("vm-tipping-session", JSON.stringify(session));
}
