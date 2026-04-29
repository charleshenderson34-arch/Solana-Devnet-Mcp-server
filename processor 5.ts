import { EthChainId } from '@sentio/chain'
import { ERC20Processor } from '@sentio/sdk/eth/builtin'

// Contract address on Optimism (Chain ID 10)
const address = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'

// Empty processor - binds to the contract but has no event handlers
ERC20Processor.bind({ address, network: EthChainId.OPTIMISM })
