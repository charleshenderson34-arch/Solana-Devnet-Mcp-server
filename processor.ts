mport { ERC20Processor } from "@sentio/sdk/eth"
import { cbWETHStakingContract } from "./types/eth/cbweth_staking" // Generated from your repo

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
const CBWETH_STAKING = "0x..." // Your contract address from the repo

ERC20Processor.bind({
  address: USDC_ADDRESS,
  network: 1, // Mainnet
}).onEventTransfer(async (event, ctx) => {
  const amount = event.args.value.asBigInt()
  
  // Logic for your 9,999,999 limit
  if (amount <= 9999999000000n) { // 9.9M USDC (6 decimals)
    ctx.meter.Counter("migration_limit").add(1)
    
    // LOGIC: Trigger Provenance Attestation check
    // This part interfaces with your 'provenance-assertion' repo
    ctx.eventLogger.emit("MigrationTriggered", {
      amount: amount,
      user: event.args.to,
      type: "cbWETH_Staking"
    })
  }
})

