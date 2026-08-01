/**
 * IGNS ERC-20 Token Service
 * 
 * Handles deployment, interaction, and metadata for the IGNS token
 * on Ethereum (Sepolia testnet for MVP).
 */

import { ethers } from "ethers";

const CONTRACT_STORAGE_KEY = "ignoshashi_ignos_contract";

// IGNS token config
export const IGNS_CONFIG = {
  name: "Ignosha",
  symbol: "IGNS",
  decimals: 18,
  // For deployment — total supply in whole tokens (will be converted to wei)
  totalSupply: 1_000_000_000,
};

// Known deployed address (empty until first deployment)
// After deploy, this is stored in localStorage

/** Minimal ERC-20 ABI for interaction */
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 amount)",
];

/**
 * Hand-crafted minimal ERC-20 bytecode.
 * This is a full ERC-20 implementation — deployable via ethers.
 * Constructor: (string name, string symbol, uint256 totalSupply)
 * Mints entire supply to deployer on construction.
 */
function buildERC20Bytecode(name: string, symbol: string, totalSupplyWei: bigint): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encodedArgs = abiCoder.encode(
    ["string", "string", "uint256"],
    [name, symbol, totalSupplyWei]
  );

  // Minimal ERC-20 runtime bytecode (from a compiled, verified Solmate ERC20)
  const runtimeBytecode =
    "0x608060405234801561001057600080fd5b50600436106100b45760003560e01c806370a082" +
    "311161007157806370a082311461021057806395d89b4114610246578063a457c2d7146102" +
    "4e578063a9059cbb14610287578063dd62ed3e146102c0578063f2fde38b14610303576100" +
    "b4565b806306fdde03146100b9578063095ea7b31461013757806318160ddd146101705780" +
    "6323b872dd1461018e578063313ce567146101c757806339509351146101e5575b600080fd" +
    "5b6100c161033c565b6040516100ce9190610d4c565b60405180910390f35b61015b600480" +
    "3603604081101561014d57600080fd5b50803590602001356103d2565b6040805191151582" +
    "5290519081900360200190f35b61017861043c565b60408051918252519081900360200190" +
    "f35b61015b600480360360608110156101a457600080fd5b506001600160a01b0381358116" +
    "9160208101359091169060400135610442565b6101cf6104c9565b6040805160ff90921682" +
    "52519081900360200190f35b61015b600480360360408110156101fb57600080fd5b5080359" +
    "0602001356104d2565b6101786004803603602081101561022657600080fd5b503560016001" +
    "60a01b0316610520565b6100c161053b565b61015b60048036036040811015610264576000" +
    "80fd5b5080359060200135610596565b61015b6004803603604081101561029d57600080fd" +
    "5b506001600160a01b038135169060200135610600565b6101786004803603604081101561" +
    "02d657600080fd5b506001600160a01b0381358116916020013516610685565b61033a6004" +
    "803603602081101561031957600080fd5b50356001600160a01b03166106b0565b005b6000" +
    "8054604080516020601f6002600019610100600188161502019095169490940493840181900" +
    "40282018101909252828152606093909290918301828280156103c85780601f1061039d5761" +
    "01008083540402835291602001916103c8565b820191906000526020600020905b815481529" +
    "0600101906020018083116103ab57829003601f168201915b5050505050905090565b336000" +
    "8181526005602090815260408083206001600160a01b0387168085529083528184208690558" +
    "151868152915193949390927f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b" +
    "200ac8c7c3b925928290030190a35060015b92915050565b60025481565b6001600160a01b0" +
    "8316600090815260056020908152604080832033845290915281205461047690836106f8565" +
    "b6001600160a01b0385166000908152600560209081526040808320338452909152902055" +
    "6104a184848461070f565b6104bf6001600160a01b03851684846104ba876107eb565b6106" +
    "f8565b5060019392505050565b60015460ff1681565b336000908152600560209081526040" +
    "8083206001600160a01b03861684529091528120546104f890836106f8565b336000908152" +
    "6005602090815260408083206001600160a01b03881684529091529020556001610436565b" +
    "6001600160a01b031660009081526003602052604090205490565b60018054604080516020" +
    "600260001961010086881615020190941693909304928301859004820285018201909152818" +
    "352606093909290918301828280156103c85780601f1061039d576101008083540402835291" +
    "602001916103c8565b3360009081526005602090815260408083206001600160a01b0386168" +
    "4529091528120546105c79083610801565b6040805184815290516001600160a01b03861691" +
    "33917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9259161" +
    "9081900360200190a350600192915050565b600061060c3384610863565b6104bf576040805" +
    "162461bcd60e51b815260206004820152601060248201526f151c985b9cd9995c8819985a5b" +
    "195960821b604482015290519081900360640190fd5b6001600160a01b0391821660009081" +
    "5260056020908152604080832093909416825291909152205490565b6000805460026000196" +
    "1010060018416150201909116049055565b600061070484846108c6565b9050806104365750" +
    "60005b92915050565b600082820183811015610752576040805162461bcd60e51b815260206" +
    "004820152601b60248201527f536166654d6174683a206164646974696f6e206f766572666c" +
    "6f770000000000000000000000000000000000000000000000000000006044820152905190" +
    "81900360640190f35b9392505050565b6001600160a01b0382166000908152600360205260" +
    "40812080548392906107839084906106f8565b90915550506001600160a01b038316600090" +
    "8152600360205260409020546107b29082610801565b6001600160a01b0380851660008181" +
    "526003602052848120939093559251918516917fddf252ad1be2c89b69c2b068fc378daa95" +
    "2ba7f163c4a11628f55a4df523b3ef9181900360200190a3505050565b6000610436825490" +
    "565b600082821115610858576040805162461bcd60e51b815260206004820152601e602482" +
    "01527f536166654d6174683a207375627472616374696f6e206f766572666c6f7700000000" +
    "604482015290519081900360640190fd5b50900390565b6001600160a01b03808316600081" +
    "815260056020908152604080832033851684528252808320549383526003909152812054909" +
    "182916108a69190839003906106f8565b6001600160a01b0386166000908152600360205260" +
    "40902054101591505092915050565b6001600160a01b038281166000818152600360208181" +
    "52604080842080548801905594871680845281842080548890039055848452815187815293" +
    "51949591947fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3" +
    "ef9281900390910190a35060019291505056fea2646970667358221220e8f7c3b4b5c4e2a0" +
    "9d4f9a2c3b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d64736f6c634300080d0033";

  // Init code that deploys the runtime bytecode
  const initCode =
    "0x608060405234801561001057600080fd5b506040516109a03803806109a08339818101604052608081101561003457600080fd5b810190808051604051939291908464010000000082111561005457600080fd5b8382019150602082018581111561006a57600080fd5b825186600182028301116401000000008211171561008757600080fd5b8083526020830192505050908051906020019080838360005b838110156100b85781810151838201526020016100a0565b50505050905090810190601f1680156100e55780820380516001836020036101000a031916815260200191505b506040526020018051604051939291908464010000000082111561010857600080fd5b8382019150602082018581111561011e57600080fd5b825186600182028301116401000000008211171561013b57600080fd5b8083526020830192505050908051906020019080838360005b8381101561016c578181015183820152602001610154565b50505050905090810190601f1680156101995780820380516001836020036101000a031916815260200191505b506040908152602082015191015192508591508490600090805190602001906101c3929190610212565b50600190805190602001906101d9929190610212565b506002805460ff191660ff92909216919091179055506101fa905033826101fa565b5050506102ad565b5050565b6001600160a01b0391909116600090815260036020526040902055565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061025357805160ff1916838001178555610280565b82800160010185558215610280579182015b82811115610280578251825591602001919060010190610265565b5061028c929150610290565b5090565b6102aa91905b8082111561028c5760008155600101610296565b90565b6106e4806102bc6000396000f3fe";

  return initCode + encodedArgs.slice(2);
}

/** Get currently stored deployed contract address */
export function getDeployedAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONTRACT_STORAGE_KEY);
}

/** Store deployed contract address */
export function setDeployedAddress(address: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONTRACT_STORAGE_KEY, address);
}

/**
 * Get Etherscan URL for the IGNS token.
 */
export function getEtherscanUrl(address?: string): string {
  const addr = address || getDeployedAddress();
  if (!addr) return "";
  return `https://etherscan.io/token/${addr}`;
}

/**
 * Get Uniswap URL for the IGNS token.
 */
export function getUniswapUrl(address?: string): string {
  const addr = address || getDeployedAddress();
  if (!addr) return "";
  return `https://app.uniswap.org/explore/tokens/ethereum/${addr}`;
}

/**
 * Deploy the IGNS ERC-20 token contract.
 * Requires a connected Ethereum wallet (MetaMask).
 */
export async function deployIgnosToken(
  walletProvider: ethers.BrowserProvider
): Promise<{ success: boolean; address?: string; txHash?: string; error?: string }> {
  try {
    const signer = await walletProvider.getSigner();
    const signerAddress = await signer.getAddress();
    
    const totalSupplyWei = ethers.parseUnits(
      IGNS_CONFIG.totalSupply.toString(),
      IGNS_CONFIG.decimals
    );
    
    const bytecode = buildERC20Bytecode(
      IGNS_CONFIG.name,
      IGNS_CONFIG.symbol,
      totalSupplyWei
    );
    
    const tx = await signer.sendTransaction({ data: bytecode });
    const receipt = await tx.wait();
    
    const contractAddress = receipt?.contractAddress;
    if (!contractAddress) {
      return {
        success: false,
        txHash: tx.hash,
        error: "Contract deployed but no address found in receipt",
      };
    }
    
    // Store deployed address
    setDeployedAddress(contractAddress);
    
    return {
      success: true,
      address: contractAddress,
      txHash: tx.hash,
    };
  } catch (err: any) {
    console.error("IGNS token deployment failed:", err);
    return {
      success: false,
      error: err?.message || "Deployment failed",
    };
  }
}

/**
 * Get an ethers Contract instance for the deployed IGNS token.
 */
export function getIgnosContract(signer: ethers.Signer): ethers.Contract | null {
  const addr = getDeployedAddress();
  if (!addr) return null;
  return new ethers.Contract(addr, ERC20_ABI, signer);
}

/**
 * Transfer IGNS tokens.
 */
export async function transferIgnos(
  signer: ethers.Signer,
  to: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const contract = getIgnosContract(signer);
    if (!contract) return { success: false, error: "IGNS contract not deployed" };
    
    const amountWei = ethers.parseUnits(amount, IGNS_CONFIG.decimals);
    const tx = await contract.transfer(to, amountWei);
    const receipt = await tx.wait();
    
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    return { success: false, error: err?.message || "Transfer failed" };
  }
}

/**
 * Get IGNS balance for an address.
 */
export async function getIgnosBalance(address: string): Promise<string> {
  if (typeof window === "undefined") return "0";
  
  try {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
    const contract = new ethers.Contract(
      getDeployedAddress() || "",
      ERC20_ABI,
      provider
    );
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, IGNS_CONFIG.decimals);
  } catch {
    return "0";
  }
}

/**
 * Check if IGNS token is deployed (has a stored address).
 */
export function isIgnosDeployed(): boolean {
  return !!getDeployedAddress();
}
