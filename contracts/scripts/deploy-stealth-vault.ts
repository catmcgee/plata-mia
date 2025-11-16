import hre from "hardhat";
import { formatEther } from "viem";

async function main() {
  console.log("Deploying StealthVault with updated contract...\n");

  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();

  console.log("Deploying from:", deployer.account.address);

  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("Balance:", formatEther(balance), "PAS\n");

  // Deploy TestToken
  console.log("Deploying TestToken...");
  const testToken = await hre.viem.deployContract("TestToken", []);
  console.log("TestToken deployed to:", testToken.address);

  // Deploy StealthVault
  console.log("\nDeploying StealthVault...");
  const stealthVault = await hre.viem.deployContract("StealthVault", [testToken.address]);
  console.log("StealthVault deployed to:", stealthVault.address);

  console.log("\n=== Deployment Complete ===");
  console.log("TestToken:", testToken.address);
  console.log("StealthVault:", stealthVault.address);
  console.log("\nUpdate your .env.local with:");
  console.log(`NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_PASSET=${stealthVault.address}`);
  console.log(`NEXT_PUBLIC_TEST_TOKEN_ADDRESS_PASSET=${testToken.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
