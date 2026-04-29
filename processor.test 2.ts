import assert from 'assert'
import { before, describe, test } from 'node:test'
import { TestProcessorServer } from '@sentio/sdk/testing'
import { CONTRACT_ADDRESS, CHAIN_ID, CONTRACT_NAME } from './processor.js'
import { EthChainId } from '@sentio/chain'

/**
 * Test suite for the empty processor
 * Tests basic configuration and setup for contract 0x0576a174D229E3cFA37253523E645A78A0C91B57
 */
describe('Empty Processor for EntryPoint Contract', () => {
  const service = new TestProcessorServer(() => import('./processor.js'))

  before(async () => {
    await service.start()
  })

  test('processor loads without errors', async () => {
    // If we get here, the processor loaded successfully
    assert(true, 'Processor loaded successfully')
  })

  test('contract constants are defined correctly', () => {
    assert.strictEqual(CONTRACT_ADDRESS, '0x0576a174D229E3cFA37253523E645A78A0C91B57', 'Contract address should match')
    assert.strictEqual(CHAIN_ID, EthChainId.ETHEREUM, 'Chain ID should be Ethereum mainnet')
    assert.strictEqual(CONTRACT_NAME, 'EntryPoint (ERC-4337)', 'Contract name should be set')
  })

  test('has valid config structure', async () => {
    const config = await service.getConfig({})
    // Config should be defined even for empty processor
    assert(config !== undefined, 'Config should be defined')
    assert(config.contractConfigs !== undefined, 'Contract configs should be defined')
  })
})
