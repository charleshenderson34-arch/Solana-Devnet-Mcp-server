#!/bin/sh
# 1. Ask for a slot (Check if Devnet is alive)
echo "📡 Pinging Solana Devnet..."
SLOT=$(curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1, "method":"getSlot"}' https://api.devnet.solana.com | grep -o '[0-9]\+' | head -n1)

if [ -z "$SLOT" ]; then
    echo "❌ Connection Failed. Check your internet."
else
    echo "🚀 Success! Current Devnet Slot: $SLOT"
fi

# 2. Check a wallet balance (Replace YOUR_PUBKEY with your real address)
PUBKEY="4zMMC9MSbiuMvC9vscWU6yR6sK92VPT6U45iZgC5" # Example USDC Devnet address
echo "💰 Checking balance for: $PUBKEY"
curl -s -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1, "method":"getBalance", "params":["'$PUBKEY'"]}' https://api.devnet.solana.com
