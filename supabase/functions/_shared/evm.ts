// Shared EVM helpers for the Temo blockchain service (Supabase Edge Functions).
// Requires these function secrets (set with `supabase secrets set`):
//   RPC_URL, REGISTRY_ADDRESS, CHAIN_ID, ANCHOR_PRIVATE_KEY
import { ethers } from "npm:ethers@6.13.4";

export const REGISTRY_ABI = [
  "function recordOrder(bytes32 orderId, bytes32 dataHash)",
  "function verify(bytes32 orderId, bytes32 dataHash) view returns (bool)",
  "function getRecord(bytes32 orderId) view returns (bytes32 dataHash, uint64 recordedAt, address recordedBy, bool exists)",
  "function isRecorder(address account) view returns (bool)",
  "function recordCount() view returns (uint256)",
  "event OrderRecorded(bytes32 indexed orderId, bytes32 dataHash, address indexed recordedBy, uint64 recordedAt)",
] as const;

export function explorerBase(chainId: number): string {
  switch (chainId) {
    case 11155111:
      return "https://sepolia.etherscan.io";
    case 80002:
      return "https://amoy.polygonscan.com";
    default:
      return "";
  }
}

export function chainId(): number {
  const value = Deno.env.get("CHAIN_ID");
  if (!value) throw new Error("CHAIN_ID secret is not set");
  return Number(value);
}

export function registryAddress(): string {
  const value = Deno.env.get("REGISTRY_ADDRESS");
  if (!value) throw new Error("REGISTRY_ADDRESS secret is not set");
  return value;
}

export function provider(): ethers.JsonRpcProvider {
  const url = Deno.env.get("RPC_URL");
  if (!url) throw new Error("RPC_URL secret is not set");
  return new ethers.JsonRpcProvider(url);
}

/** Signer used to submit records. ANCHOR_PRIVATE_KEY is a RESTRICTED secret. */
export function signer(): ethers.Wallet {
  const pk = Deno.env.get("ANCHOR_PRIVATE_KEY");
  if (!pk) throw new Error("ANCHOR_PRIVATE_KEY secret is not set");
  return new ethers.Wallet(pk, provider());
}

export function registry(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(registryAddress(), REGISTRY_ABI, signerOrProvider);
}

/** Deterministic bytes32 id for an order (keccak256 of the UUID text). */
export function orderIdToBytes32(orderId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(orderId));
}

export function explorerUrl(kind: "tx" | "address", value: string): string {
  const base = explorerBase(chainId());
  return base ? `${base}/${kind}/${value}` : "";
}
