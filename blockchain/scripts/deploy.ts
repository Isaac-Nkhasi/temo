import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();

  console.log("Network      :", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer     :", deployer.address);
  console.log("Balance      :", ethers.formatEther(balance), "ETH");

  const factory = await ethers.getContractFactory("TemoOrderRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("\nTemoOrderRegistry deployed to:", address);
  console.log("Explorer URL :", `${explorerBase(network.chainId)}/address/${address}`);
  console.log("\nAdd these to Supabase Edge Function secrets:");
  console.log("  REGISTRY_ADDRESS=" + address);
  console.log("  CHAIN_ID=" + network.chainId.toString());
}

function explorerBase(chainId: bigint): string {
  switch (chainId) {
    case 11155111n:
      return "https://sepolia.etherscan.io";
    case 80002n:
      return "https://amoy.polygonscan.com";
    default:
      return "";
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
