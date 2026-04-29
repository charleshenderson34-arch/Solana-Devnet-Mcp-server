import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 1. Initialize the Server FIRST
const server = new McpServer({
  name: "ThirdwebWalletServer",
  version: "1.0.0",
});

const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;

// 2. Define the Tools
server.tool(
  "get_or_create_wallet",
  { identifier: z.string().description("Unique ID for the wallet") },
  async ({ identifier }) => {
    const response = await fetch("https://api.thirdweb.com/v1/wallets/server", {
      method: "POST",
      headers: {
        "x-secret-key": THIRDWEB_SECRET_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier }),
    });

    const data = await response.json();
    return {
      content: [{ type: "text", text: `Wallet Address: ${data?.result?.address || "Error fetching address"}` }],
    };
  }
);

server.tool(
  "send_transaction",

