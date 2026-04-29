#!/usr/bin/env bash
set -e
PURPLE='\033[0;35m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'; BOLD='\033[1m'

echo -e "${PURPLE}${BOLD}╔════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}${BOLD}║   NEXUS · SOLANA DEVNET DEPLOY     ║${RESET}"
echo -e "${PURPLE}${BOLD}╚════════════════════════════════════╝${RESET}"

# 1. Config
WALLET_PATH="${HOME}/.config/solana/id.json"
[ ! -f "$WALLET_PATH" ] && solana-keygen new --outfile "$WALLET_PATH" --no-bip39-passphrase

# 2. Build (Note: We use Solang because these are .sol files)
echo -e "${CYAN}▸ Compiling Solidity with Solang...${RESET}"
solang compile programs/nexus/src/lib.rs --target solana

# 3. Deploy
PROGRAM_ID=$(solana address -k target/deploy/nexus-keypair.json)
echo -e "${CYAN}▸ Deploying Program: ${GREEN}${PROGRAM_ID}${RESET}"
solana program deploy target/nexus.so --program-id $PROGRAM_ID

# 4. Patch Frontend
FRONTEND="../solana-nexus.html"
if [ -f "$FRONTEND" ]; then
  sed -i "s/NEXUS_PROGRAM_ID_PLACEHOLDER/${PROGRAM_ID}/g" "$FRONTEND"
  echo -e "${GREEN}✔ Frontend patched!${RESET}"
fi

echo -e "${GREEN}${BOLD}🚀 DEPLOY COMPLETE: ${CYAN}https://explorer.solana.com/address/${PROGRAM_ID}?cluster=mainnet-beta${RESET}"
