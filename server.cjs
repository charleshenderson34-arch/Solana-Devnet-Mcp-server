
    // Block Identification
    number: string;
    hash: string;
    parentHash: string;
    sha3Uncles: string;
    miner: string;
    
    // State and Roots
    stateRoot: string;
    transactionsRoot: string;
    receiptsRoot: string;
    withdrawalsRoot?: string; // Added for Post-Shanghai blocks
    parentBeaconBlockRoot?: string; // Added for Cancun upgrade
    
    // Usage and Fees
    gasLimit: string;
    gasUsed: string;
    baseFeePerGas?: string; // EIP-1559
    blobGasUsed?: string;   // EIP-4844
    excessBlobGas?: string; // EIP-4844
    difficulty: string;     // Usually 0 post-merge
    
    // Metadata
    timestamp: string;
    extraData: string;
    mixHash: string;
    nonce: string;
    size: string;
    
    // Lists
    transactions: string[]; 
    withdrawals?: EthereumWithdrawal[];
    uncles: string[];
  };
}

export interface EthereumWithdrawal {
  index: string;
  validatorIndex: string;
  address: string;
  amount: string;
}
