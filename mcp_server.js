import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "tw-mcp", version: "1.0.0" });
const KEY = process.env.THIRDWEB_SECRET_KEY;
const HDR = { "x-secret-key": KEY || "", "Content-Type": "application/json" };

server.tool("get_wallet", { id: z.string() }, async ({ id }) => {
  const r = await fetch("https://api.thirdweb.com/v1/wallets/server", {
    method: "POST", headers: HDR, body: JSON.stringify({ identifier: id })
  });
  const d = await r.json();
  return { content: [{ type: "text", text: `Address: ${d?.result?.address}` }] };
});

server.tool("send_tx", { id: z.string(), chainId: z.number(), to: z.string(), val: z.string() }, async ({ id, chainId, to, val }) => {
  const wR = await fetch("https://api.thirdweb.com/v1/wallets/server", { method: "POST", headers: HDR, body: JSON.stringify({ identifier: id }) });
  const wD = await wR.json();
  const tR = await fetch("https://api.thirdweb.com/v1/transactions", {
    method: "POST", headers: HDR, body: JSON.stringify({ chainId, from: wD.result.address, transactions: [{ to, value: val, data: "0x" }] })
  });
  const tD = await tR.json();
  return { content: [{ type: "text", text: `Queued ID: ${tD?.result?.transactionIds?.[0]}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

