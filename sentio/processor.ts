import { EthChainId } from "@sentio/sdk/eth";
import { ERC20Processor } from "@sentio/sdk/eth/builtin";

const CBETH_CONTRACT = "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704"; 
const TRACKED_WALLET = "0x4828c0e00d0a9903762a3a4406aa9eb1f5df6a6e";

ERC20Processor.bind({
  address: CBETH_CONTRACT,
  network: EthChainId.ETHEREUM,
})
  .onEventTransfer(async (event, ctx) => {
    const { from, to, value } = event.args;
    const amount = value.scaleDown(18);
    const isIncoming = to.toLowerCase() === TRACKED_WALLET.toLowerCase();
    const isOutgoing = from.toLowerCase() === TRACKED_WALLET.toLowerCase();

    ctx.meter.Counter("transfer_count").add(1, { direction: isIncoming ? "in" : "out" });
    ctx.meter.Counter("transfer_volume_eth").add(amount, { direction: isIncoming ? "in" : "out" });

    if (isIncoming || isOutgoing) {
      ctx.meter.Gauge("wallet_transfer_value").record(amount, {
        wallet: TRACKED_WALLET,
        direction: isIncoming ? "incoming" : "outgoing",
      });

      ctx.eventLogger.emit("WalletTransfer", {
        distinctId: event.transactionHash,
        from,
        to,
        value: value.toString(),
        value_eth: amount.toNumber(),
        tx_hash: event.transactionHash,
        block_number: event.blockNumber,
        direction: isIncoming ? "incoming" : "outgoing",
        wallet: TRACKED_WALLET,
        source: "on_chain",
      });
    }
  })
  .onBlockInterval(async (block, ctx) => {
    ctx.eventLogger.emit("BlockSnapshot", {
      distinctId: `block-${block.number}`,
      block_number: block.number,
      timestamp: block.timestamp,
      wallet: TRACKED_WALLET,
      source: "block_interval",
    });
  }, 100);
