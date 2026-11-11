import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Never commit a real key: DEPLOYER_PRIVATE_KEY lives in blockchain/.env (gitignored).
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const accounts = PRIVATE_KEY.length > 0 ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Ethereum Sepolia testnet
    sepolia: {
      // `||` (not `??`) so a blank SEPOLIA_RPC_URL in .env still uses the public default
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts,
    },
    // Polygon Amoy testnet (cheaper alternative if the Sepolia faucet is dry)
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY ?? "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY ?? "",
    },
  },
};

export default config;
