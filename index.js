t blockData: EthereumBlock = yourImportedJson;

// Example of accessing the data safely
const blockNumber = BigInt(blockData.result.number);
const gasUsed = BigInt(blockData.result.gasUsed);
const isTitanBuilder = blockData.result.miner.toLowerCase() === '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97';

console.log(`Processing Block #${blockNumber.toString()}...`);

