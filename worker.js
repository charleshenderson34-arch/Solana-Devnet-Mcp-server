/**
 * NEXUS · Cloudflare Worker — Production Backend + Isolated MCP Bridge
 * © 2026 Charles Henderson. All rights reserved.
 */

// ── CORS ────────────────────────────────────────────────────
function corsHeaders(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || "http://localhost:5173,https://nexus.yourdomain.com").split(",").map(s => s.trim());
  const origin = req?.headers?.get("Origin") || "";
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function respond(body, status, env, req, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, req),
      ...extra,
    },
  });
}

// ── JWT AUTH (HMAC-SHA256) ──────────────────────────────────
async function verifyToken(req, env) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    if (!valid) return false;
    const payload = JSON.parse(atob(payloadB64));
    return payload.exp > Date.now() / 1000;
  } catch { return false; }
}

async function signToken(sub, env) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${header}.${payload}.${sigB64}`;
}

// ── SOLANA RPC HELPER ────────────────────────────────────────
async function solanaRpc(method, params, env) {
  const rpcUrl = env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

// ── THIRDWEB HELPERS ─────────────────────────────────────────
const TW_BASE = "https://api.thirdweb.com/v1";
function twHeaders(env) {
  return { "x-secret-key": env.THIRDWEB_SECRET_KEY || "", "Content-Type": "application/json" };
}

async function twGetWallet(identifier, env) {
  const r = await fetch(`${TW_BASE}/wallets/server`, {
    method: "POST", headers: twHeaders(env),
    body: JSON.stringify({ identifier }),
  });
  return r.json();
}

async function twSendTx(from, chainId, to, value, env) {
  const r = await fetch(`${TW_BASE}/transactions`, {
    method: "POST", headers: twHeaders(env),
    body: JSON.stringify({ chainId, from, transactions: [{ to, value, data: "0x" }] }),
  });
  return r.json();
}

// ── ROUTES ──────────────────────────────────────────────────
const ROUTES = {
  "POST /auth/token": async (req, env) => {
    const body = await req.json().catch(() => ({}));
    if (!body.apiKey || body.apiKey !== env.JWT_SECRET) {
      return { status: 401, body: { error: "Invalid API key" } };
    }
    const token = await signToken("nexus-client", env);
    return { status: 200, body: { token, expiresIn: 3600 } };
  },

  "GET /api/solana/info": async (req, env) => {
    const [slotRes, healthRes] = await Promise.all([
      solanaRpc("getSlot", [], env),
      solanaRpc("getHealth", [], env),
    ]);
    return {
      status: 200, body: {
        slot: slotRes.result,
        health: healthRes.result,
        cluster: env.SOLANA_RPC_URL?.includes("devnet") ? "devnet" : "mainnet-beta",
        timestamp: Date.now(),
      }
    };
  },

  "POST /api/solana/balance": async (req, env) => {
    const body = req.body || await req.json().catch(() => ({}));
    const { pubkey } = body;
    if (!pubkey) return { status: 400, body: { error: "pubkey required" } };
    const res = await solanaRpc("getBalance", [pubkey], env);
    return { status: 200, body: { pubkey, lamports: res.result?.value ?? 0, sol: (res.result?.value ?? 0) / 1e9 } };
  },

  "GET /api/noc/status": async (req, env) => {
    const [slotRes, perfRes] = await Promise.all([
      solanaRpc("getSlot", [], env),
      solanaRpc("getRecentPerformanceSamples", [5], env),
    ]);
    const samples = perfRes.result ?? [];
    const avgTps = samples.length
      ? Math.round(samples.reduce((a, s) => a + (s.numTransactions / s.samplePeriodSecs), 0) / samples.length)
      : 0;
    return {
      status: 200, body: {
        slot: slotRes.result,
        tps: avgTps,
        ts: Date.now(),
      }
    };
  }
};

// ── MAIN HANDLER (Cloudflare) ────────────────────────────────
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    const url = new URL(req.url);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = ROUTES[routeKey];
    if (!handler) return respond({ error: "Not found" }, 404, env, req);
    try {
      const authed = await verifyToken(req, env);
      const result = await handler(req, env, authed);
      return respond(result.body, result.status, env, req);
    } catch (err) {
      return respond({ error: "Internal server error" }, 500, env, req);
    }
  },
};

// ── MCP BRIDGE (Node.js/Local) ──────────────────────────────
if (typeof process !== 'undefined' && process.release?.name === 'node') {
  const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
  const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

  const server = new Server({
    name: "nexus-backend-mcp",
    version: "1.0.0"
  }, {
    capabilities: { tools: {} }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_nexus_status",
        description: "Check Solana network operations center status",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "get_solana_balance",
        description: "Check SOL balance for a public key",
        inputSchema: {
          type: "object",
          properties: { pubkey: { type: "string" } },
          required: ["pubkey"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const env = process.env;
    try {
      if (request.params.name === "get_nexus_status") {
        const res = await ROUTES["GET /api/noc/status"](null, env);
        return { content: [{ type: "text", text: JSON.stringify(res.body, null, 2) }] };
      }
      if (request.params.name === "get_solana_balance") {
        const mockReq = { body: request.params.arguments };
        const res = await ROUTES["POST /api/solana/balance"](mockReq, env);
        return { content: [{ type: "text", text: JSON.stringify(res.body, null, 2) }] };
      }
      throw new Error("Tool not found");
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
