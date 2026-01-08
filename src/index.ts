import { handleScheduled } from "./fetch";
import type { Env } from "./types";

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Cron triggered at ${new Date().toISOString()}`);
    ctx.waitUntil(handleScheduled(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Manual trigger endpoint for testing
    if (url.pathname === "/trigger-fetch" && request.method === "POST") {
      ctx.waitUntil(handleScheduled(env));
      return new Response(JSON.stringify({ status: "fetch triggered" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
