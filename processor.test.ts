import assert from 'assert'
import { before, describe, test } from 'node:test'
import { TestProcessorServer } from '@sentio/sdk/testing'

describe('cbETH Processor Tests', () => {
  const service = new TestProcessorServer(() => import('./processor.js'))

  before(async () => {
    await service.start()
  })

  test('has valid config', async () => {
    const config = await service.getConfig({})
    assert(config.contractConfigs.length > 0, 'Should have at least one contract config')
  })

  test('contract is bound to correct address and chain', async () => {
    const config = await service.getConfig({})
    const contractConfig = config.contractConfigs[0]

    assert.equal(
      contractConfig.contract?.address.toLowerCase(),
      '0xbe9895146f7af43049ca1c1ae358b0541ea49704',
      'Contract address should match cbETH address'
    )
    assert.equal(
      contractConfig.contract?.chainId,
      '1',
      'Chain ID should be 1 (Ethereum mainnet)'
    )
  })

  test('processor can be initialized without errors', async () => {
    // This test verifies that the processor initializes successfully
    // even though it doesn't have any event handlers
    const config = await service.getConfig({})
    assert(config !== null, 'Config should not be null')
  })
})
