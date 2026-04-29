import assert from 'assert'
import { before, describe, test } from 'node:test'
import { TestProcessorServer } from '@sentio/sdk/testing'

describe('Test Processor', () => {
  const service = new TestProcessorServer(() => import('./processor.js'))

  before(async () => {
    await service.start()
  })

  test('has valid config', async () => {
    const config = await service.getConfig({})
    assert(config.contractConfigs.length > 0)
  })

  test('contract is bound to correct address and chain', async () => {
    const config = await service.getConfig({})
    const contractConfig = config.contractConfigs[0]

    // Verify the contract address
    assert.equal(contractConfig.contract?.address.toLowerCase(), '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599')

    // Verify the chain ID is 10 (Optimism)
    assert.equal(contractConfig.contract?.chainId, '10')
  })
})
