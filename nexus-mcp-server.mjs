/**
 * NEXUS · Isolated MCP Server
 * ════════════════════════════
 * Security model:
 *   • Runs as a separate process, completely isolated from the web frontend
 *   • All secrets loaded from environment (populated by Cloudflare Secrets or .env)
 *   • No HTTP server — stdio transport only (no network exposure)
 *   • Wallet operations gated behind identifier + chain validation
 *   • All tool inputs validated with Zod before any network call
 *
 * Run:
 *   THIRDWEB_SECRET_KEY=... node nexus-mcp-server.mjs
 *
 * Configure in Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "nexus-wallet": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/nexus-mcp-server.mjs"],
 *       "env": {
 *         "THIRDWEB_SECRET_KEY": "<from-cloudflare-secrets>",
 *         "SOLANA_RPC_URL": "<your-rpc>",
 *         "ALLOWED_CHAIN_IDS": "1,137,8453,1399811149"
 *       }
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── ENV VALIDATION ────────────────────────────────────────────
const SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ALLOWED_CHAINS = new Set(
  (process.env.ALLOWED_CHAIN_IDS || "1,137,8453,1399811149,101").split(",").map(Number)
);

if (!SECRET_KEY) {
  process.stderr.write("[NEXUS-MCP] FATAL: THIRDWEB_SECRET_KEY not set. Refusing to start.\n");
  process.exit(1);
}

// ── LOGGING (stderr only — stdout is MCP protocol) ───────────
function log(level, msg, data) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(data || {}) });
  process.stderr.write(`[NEXUS-MCP] ${entry}\n`);
}

log("info", "Server starting", { rpc: RPC_URL.replace(/\/\/.*@/, "//***@"), chains: [...ALLOWED_CHAINS] });

// ── THIRDWEB CLIENT ───────────────────────────────────────────
const TW_BASE = "https://api.thirdweb.com/v1";
const TW_HDR = { "x-secret-key": SECRET_KEY, "Content-Type": "application/json" };

async function twFetch(path, body) {
  const res = await fetch(`${TW_BASE}${path}`, {
    method: "POST",
    headers: TW_HDR,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Thirdweb API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── SOLANA RPC CLIENT ─────────────────────────────────────────
async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

// ── MCP SERVER SETUP ──────────────────────────────────────────
const server = new McpServer({
  name: "nexus-wallet-mcp",
  version: "2.0.0",
});

// ── TOOL: get_or_create_wallet ────────────────────────────────
server.tool(
  "get_or_create_wallet",
  {
    identifier: z.string().min(3).max(128).describe(
      "Unique stable identifier for this wallet (e.g. user ID, email hash). Never a raw private key."
    ),
  },
  async ({ identifier }) => {
    log("info", "get_or_create_wallet", { identifier });
    try {
      const data = await twFetch("/wallets/server", { identifier });
      const address = data?.result?.address;
      if (!address) throw new Error("No address in response");
      log("info", "wallet_fetched", { identifier, address });
      return {
        content: [{ type: "text", text: `✅ Wallet Address: ${address}\nIdentifier: ${identifier}` }],
      };
    } catch (err) {
      log("error", "get_or_create_wallet_failed", { identifier, error: err.message });
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
  }
);

// ── TOOL: queue_transaction ───────────────────────────────────
server.tool(
  "queue_transaction",
  {
    identifier: z.string().min(3).max(128).describe("Wallet identifier (same as used in get_or_create_wallet)"),
    chainId: z.number().int().positive().describe("EVM chain ID (e.g. 1 = Ethereum, 137 = Polygon, 8453 = Base)"),
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Recipient EVM address (0x...)"),
    value: z.string().regex(/^\d+$/).describe("Amount in Wei as a string integer"),
  },
  async ({ identifier, chainId, to, value }) => {
    if (!ALLOWED_CHAINS.has(chainId)) {
      log("warn", "chain_not_allowed", { chainId });
      return {
        content: [{ type: "text", text: `❌ Chain ID ${chainId} is not on the allowlist: [${[...ALLOWED_CHAINS].join(", ")}]` }],
        isError: true,
      };
    }
    log("info", "queue_transaction", { identifier, chainId, to, valueLamports: value });
    try {
      const walletData = await twFetch("/wallets/server", { identifier });
      const from = walletData?.result?.address;
      if (!from) throw new Error("Could not resolve wallet address");

      const txData = await twFetch("/transactions", {
        chainId,
        from,
        transactions: [{ to, value, data: "0x" }],
      });
      const txId = txData?.result?.transactionIds?.[0];
      log("info", "transaction_queued", { txId, from, to, chainId });
      return {
        content: [{
          type: "text",
          text: `✅ Transaction Queued\nID: ${txId}\nFrom: ${from}\nTo: ${to}\nValue: ${value} wei\nChain: ${chainId}`,
        }],
      };
    } catch (err) {
      log("error", "queue_transaction_failed", { identifier, error: err.message });
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }], isError: true };
    }
  }
);

// ── TOOL: get_solana_slot ─────────────────────────────────────
server.tool(
  "get_solana_slot",
  {},
  async () => {
    try {
      const slot = await rpcCall("getSlot");
      return { content: [{ type: "text", text: `Current Solana Slot: ${slot}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ RPC Error: ${err.message}` }], isError: true };
    }
  }
);

// ── TOOL: get_solana_balance ──────────────────────────────────
server.tool(
  "get_solana_balance",
  {
    pubkey: z.string().min(32).max(44).describe("Base58-encoded Solana public key"),
  },
  async ({ pubkey }) => {
    try {
      const result = await rpcCall("getBalance", [pubkey]);
      const sol = (result?.value ?? 0) / 1e9;
      return {
        content: [{ type: "text", text: `Address: ${pubkey}\nBalance: ${sol.toFixed(9)} SOL (${result?.value ?? 0} lamports)` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ RPC Error: ${err.message}` }], isError: true };
    }
  }
);

// ── TOOL: get_noc_status ──────────────────────────────────────
server.tool(
  "get_noc_status",
  {},
  async () => {
    try {
      const [slot, perf] = await Promise.all([
        rpcCall("getSlot"),
        rpcCall("getRecentPerformanceSamples", [3]),
      ]);
      const avgTps = perf?.length
        ? Math.round(perf.reduce((a, s) => a + s.numTransactions / s.samplePeriodSecs, 0) / perf.length)
        : 0;
      return {
        content: [{
          type: "text",
          text: `NEXUS NOC Status\n━━━━━━━━━━━━━━━━\nSlot: ${slot}\nAvg TPS: ${avgTps}\nRPC: ${RPC_URL.split("//")[1]?.split("/")[0]}\nTime: ${new Date().toISOString()}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ RPC Error: ${err.message}` }], isError: true };
    }
  }
);

// ── CONNECT ───────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
log("info", "MCP server ready", { tools: ["get_or_create_wallet", "queue_transaction", "get_solana_slot", "get_solana_balance", "get_noc_status"] });
