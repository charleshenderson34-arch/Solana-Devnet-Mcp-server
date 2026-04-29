
m fastmcp import FastMCP

# Create the server
mcp = FastMCP("MCP_THIRDWEB-SOLANA-Server")

# Add a simple tool
@mcp.tool()
def hello_ish() -> str:
    """Returns a greeting from iSH."""
    return "Hello from your iPad/iPhone via iSH!"

if __name__ == "__main__":
    # For iSH, we use HTTP so other apps (like Claude/Cursor) can see it
    mcp.run(transport="http", host="localhost", port=8545)
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
  {
    identifier: z.string().description("The unique ID of the server wallet"),
    chainId: z.number().description("The chain ID (e.g., 1 for Ethereum)"),
    to: z.string().description("Recipient address"),
    value: z.string().description("Amount in Wei")
  },
  async ({ identifier, chainId, to, value }) => {
    // Logic to get address then send tx
    const walletRes = await fetch("https://api.thirdweb.com/v1/wallets/server", {
      method: "POST",
      headers: { "x-secret-key": THIRDWEB_SECRET_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const walletData = await walletRes.json();
    
    const txRes = await fetch("https://api.thirdweb.com/v1/transactions", {
      method: "POST",
      headers: { "x-secret-key": THIRDWEB_SECRET_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId,
        from: walletData.result.address,
        transactions: [{ to, value, data: "0x" }]
      }),
    });

    const txData = await txRes.json();
    return {
      content: [{ type: "text", text: `Transaction Queued: ${txData.result.transactionIds[0]}` }],
    };
  }
);

// 3. Connect the Transport LAST
const transport = new StdioServerTransport();
await server.connect(transport);

