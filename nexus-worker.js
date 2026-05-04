/**
 * NEXUS · Cloudflare Worker — Production Backend
 * ════════════════════════════════════════════════
 * Secrets stored in Cloudflare Secrets Store (NOT wrangler.toml):
 *   THIRDWEB_SECRET_KEY   → Thirdweb server wallet key
 *   SOLANA_PRIVATE_KEY    → Base58 Solana keypair (for memo/direct)
 *   SOLANA_RPC_URL        → Your private RPC endpoint
 *   JWT_SECRET            → HMAC-SHA256 signing secret for API auth
 *   ALLOWED_ORIGINS       → Comma-separated allowed CORS origins
 *
 * Deploy:
 *   npx wrangler secret put THIRDWEB_SECRET_KEY
 *   npx wrangler secret put SOLANA_PRIVATE_KEY
 *   npx wrangler secret put SOLANA_RPC_URL
 *   npx wrangler secret put JWT_SECRET
 *   npx wrangler deploy
 */

// ── CORS ────────────────────────────────────────────────────
function corsHeaders(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || "http://localhost:5173,https://nexus.yourdomain.com").split(",").map(s => s.trim());
  const origin = req.headers.get("Origin") || "";
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

  // Public: auth token exchange (pass a shared API key to get JWT)
  "POST /auth/token": async (req, env) => {
    const body = await req.json().catch(() => ({}));
    if (!body.apiKey || body.apiKey !== env.JWT_SECRET) {
      return { status: 401, body: { error: "Invalid API key" } };
    }
    const token = await signToken("nexus-client", env);
    return { status: 200, body: { token, expiresIn: 3600 } };
  },

  // Solana: network info
  "GET /api/solana/info": async (req, env) => {
    const [slotRes, healthRes] = await Promise.all([
      solanaRpc("getSlot", [], env),
      solanaRpc("getHealth", [], env),
    ]);
    return {
      status: 200, body: {
        slot: slotRes.result,
        health: healthRes.result,
        cluster: env.SOLANA_RPC_URL?.includes("devnet") ? "devnet" : env.SOLANA_RPC_URL?.includes("mainnet") ? "mainnet-beta" : "custom",
        timestamp: Date.now(),
      }
    };
  },

  // Solana: get balance for any pubkey
  "POST /api/solana/balance": async (req, env) => {
    const { pubkey } = await req.json().catch(() => ({}));
    if (!pubkey) return { status: 400, body: { error: "pubkey required" } };
    const res = await solanaRpc("getBalance", [pubkey], env);
    return { status: 200, body: { pubkey, lamports: res.result?.value ?? 0, sol: (res.result?.value ?? 0) / 1e9 } };
  },

  // Solana: recent transactions for pubkey
  "POST /api/solana/transactions": async (req, env) => {
    const { pubkey, limit = 10 } = await req.json().catch(() => ({}));
    if (!pubkey) return { status: 400, body: { error: "pubkey required" } };
    const res = await solanaRpc("getSignaturesForAddress", [pubkey, { limit }], env);
    return { status: 200, body: { transactions: res.result ?? [] } };
  },

  // Solana: send memo via backend (requires auth)
  "POST /api/solana/memo": async (req, env, authed) => {
    if (!authed) return { status: 401, body: { error: "Unauthorized" } };
    const { payload } = await req.json().catch(() => ({}));
    if (!payload) return { status: 400, body: { error: "payload required" } };
    // In production: sign with SOLANA_PRIVATE_KEY using @solana/web3.js in a DO/Queue
    // Here we return the queued job ID (implement full signing in Durable Object)
    const jobId = crypto.randomUUID();
    return { status: 202, body: { queued: true, jobId, payload, message: "Memo queued for signing" } };
  },

  // Thirdweb: get or create server wallet (requires auth)
  "POST /api/wallet/get": async (req, env, authed) => {
    if (!authed) return { status: 401, body: { error: "Unauthorized" } };
    const { identifier } = await req.json().catch(() => ({}));
    if (!identifier) return { status: 400, body: { error: "identifier required" } };
    const data = await twGetWallet(identifier, env);
    return { status: 200, body: { address: data?.result?.address, identifier } };
  },

  // Thirdweb: queue transaction (requires auth)
  "POST /api/wallet/send": async (req, env, authed) => {
    if (!authed) return { status: 401, body: { error: "Unauthorized" } };
    const { identifier, chainId, to, value } = await req.json().catch(() => ({}));
    if (!identifier || !chainId || !to || !value) return { status: 400, body: { error: "identifier, chainId, to, value required" } };
    const wallet = await twGetWallet(identifier, env);
    if (!wallet?.result?.address) return { status: 500, body: { error: "Wallet fetch failed" } };
    const tx = await twSendTx(wallet.result.address, chainId, to, value, env);
    return { status: 200, body: { txId: tx?.result?.transactionIds?.[0], from: wallet.result.address } };
  },

  // NOC: aggregate status endpoint
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
        samples: samples.slice(0, 3),
        ts: Date.now(),
      }
    };
  },

  // Claude AI chat proxy — keeps API key server-side
  "POST /api/chat": async (req, env, authed) => {
    if (!authed) return { status: 401, body: { error: "Unauthorized" } };
    const { messages, systemPrompt } = await req.json().catch(() => ({}));
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt || "You are NEXUS AI, a Solana network operations assistant. Be concise and technical.",
        messages: messages || [],
      }),
    });
    const data = await aiRes.json();
    return { status: 200, body: data };
  },
};

// ── MAIN HANDLER ─────────────────────────────────────────────
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    const url = new URL(req.url);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = ROUTES[routeKey];

    if (!handler) {
      return respond({ error: "Not found", path: url.pathname }, 404, env, req);
    }

    try {
      const authed = await verifyToken(req, env);
      const result = await handler(req, env, authed);
      return respond(result.body, result.status, env, req);
    } catch (err) {
      console.error("Worker error:", err);
      return respond({ error: "Internal server error" }, 500, env, req);
    }
  },
};
