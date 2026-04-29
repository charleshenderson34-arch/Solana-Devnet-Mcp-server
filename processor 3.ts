import { EthChainId } from '@sentio/chain'
import { EthContext, GlobalProcessor } from '@sentio/sdk/eth'

// Empty processor for contract 0x8215698f59f80d0ec918970674b2bfbcbc45f0a1 on Ethereum mainnet
// This serves as a foundation that can be extended with event handlers and metrics

const CONTRACT_ADDRESS = '0x8215698f59f80d0ec918970674b2bfbcbc45f0a1'

// Register a global processor bound to Ethereum mainnet
// This creates an empty processor that monitors the specified contract
// It can be extended later with:
// - Event handlers using .onEventLog()
// - Transaction handlers using .onTransaction()
// - Block handlers using .onBlockInterval()
// - Trace handlers using .onTrace()

GlobalProcessor.bind({
  network: EthChainId.ETHEREUM,
  startBlock: 0,
})
  .onTransaction(
    async (tx, ctx: EthContext) => {
      // Filter for transactions involving our target contract
      if (
        tx.to?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() ||
        tx.from?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
      ) {
        // Empty handler - can be extended with custom logic
        // Example: ctx.meter.Counter('contract_transactions').add(1)
      }
    },
    {
      // Only process transactions involving our contract
      transaction: true,
    }
  )
