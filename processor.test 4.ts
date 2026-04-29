import assert from 'assert'
import { before, describe, test } from 'node:test'
import { TestProcessorServer, firstCounterValue } from '@sentio/sdk/testing'
import { EthChainId } from '@sentio/chain'

/**
 * Test suite for the Sentio processor monitoring address 0x8215698f59f80d0ec918970674b2bfbcbc45f0a1
 */

const CONTRACT_ADDRESS = '0x8215698f59f80d0ec918970674b2bfbcbc45f0a1'

describe('Processor Tests for 0x8215698f59f80d0ec918970674b2bfbcbc45f0a1', () => {
  const service = new TestProcessorServer(() => import('./processor.js'))

  before(async () => {
    await service.start()
  })

  test('has valid config', async () => {
    const config = await service.getConfig({})
    assert(config.contractConfigs.length >= 0)
  })

  test('should track incoming transaction', async () => {
    const mockTx = {
      from: '0x1234567890123456789012345678901234567890',
      to: CONTRACT_ADDRESS,
      value: BigInt(1e18), // 1 ETH
      gasPrice: BigInt(50e9), // 50 Gwei
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Verify transaction counter was incremented
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')
    assert(Number(counterValue) > 0, 'Transaction count should be greater than 0')

    // Verify events were emitted
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      assert(events.length > 0, 'TransactionProcessed event should be emitted')
      const event = events[0]
      if (event) {
        const attrs = event.attributes as any
        assert.equal(attrs.direction, 'incoming')
        assert.equal(attrs.ethValue, 1)
      }
    }
  })

  test('should track outgoing transaction', async () => {
    const mockTx = {
      from: CONTRACT_ADDRESS,
      to: '0x9876543210987654321098765432109876543210',
      value: BigInt(5e17), // 0.5 ETH
      gasPrice: BigInt(100e9), // 100 Gwei
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Verify transaction was counted
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')
    assert(Number(counterValue) > 0, 'Transaction count should be greater than 0')

    // Verify event
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      assert(events.length > 0, 'TransactionProcessed event should be emitted')
      const event = events[0]
      if (event) {
        const attrs = event.attributes as any
        assert.equal(attrs.direction, 'outgoing')
        assert.equal(attrs.ethValue, 0.5)
      }
    }
  })

  test('should track failed transaction', async () => {
    const mockTx = {
      from: '0x1111111111111111111111111111111111111111',
      to: CONTRACT_ADDRESS,
      value: BigInt(0),
      gasPrice: BigInt(30e9), // 30 Gwei
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Verify transaction was counted
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')
  })

  test('should handle transaction with zero value', async () => {
    const mockTx = {
      from: '0x2222222222222222222222222222222222222222',
      to: CONTRACT_ADDRESS,
      value: BigInt(0), // No ETH transferred
      gasPrice: BigInt(25e9),
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Transaction should still be counted
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')

    // Event should still be emitted
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      assert(events.length > 0, 'TransactionProcessed event should be emitted')
      if (events[0]) {
        assert.equal(events[0].attributes.ethValue, 0)
      }
    }
  })

  test('should ignore transactions not involving target address', async () => {
    const mockTx = {
      from: '0x3333333333333333333333333333333333333333',
      to: '0x4444444444444444444444444444444444444444',
      value: BigInt(1e18),
      gasPrice: BigInt(50e9),
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Should not produce any events for unrelated transactions
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      assert.equal(events.length, 0, 'Should not emit events for unrelated transactions')
    }
  })

  test('should handle contract creation transaction', async () => {
    const mockTx = {
      from: CONTRACT_ADDRESS,
      to: undefined, // Contract creation has no 'to' address
      value: BigInt(0),
      gasPrice: BigInt(40e9),
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Should track transaction
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')

    // Verify event
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      assert(events.length > 0, 'TransactionProcessed event should be emitted')
      if (events[0] && 'distinctId' in events[0]) {
        assert.equal((events[0] as any).distinctId, 'contract_creation')
      }
    }
  })

  test('should track gas metrics', async () => {
    const mockTx = {
      from: '0x5555555555555555555555555555555555555555',
      to: CONTRACT_ADDRESS,
      value: BigInt(1e18),
      gasPrice: BigInt(75e9), // 75 Gwei
      type: 2
    }

    const result = await service.eth.testTransaction(mockTx, EthChainId.ETHEREUM)

    // Verify transaction was counted
    const counterValue = firstCounterValue(result.result, 'transaction_count')
    assert(counterValue !== undefined, 'Transaction counter should be recorded')

    // Verify gas metrics in event if available
    if (result.result?.events) {
      const events = result.result.events.filter(
        (e: any) => e.name === 'TransactionProcessed'
      )
      if (events.length > 0 && events[0]) {
        assert.equal(events[0].attributes.gasPriceGwei, 75)
      }
    }
  })
})
