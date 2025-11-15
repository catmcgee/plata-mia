import { keccak256, toBytes } from "viem";

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const STEALTH_VAULT_ABI = [
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [
      { name: "stealthId", type: "bytes32" },
      { name: "assetId", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "depositStealth",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stealthId", type: "bytes32" },
      { name: "assetId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "receiverTag", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stealthId", type: "bytes32" },
      { name: "assetId", type: "bytes32" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const STEALTH_VAULT_ADDRESS_LOCAL = process.env
  .NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_LOCAL as `0x${string}` | undefined;

export const STEALTH_VAULT_ADDRESS_PASSET = process.env
  .NEXT_PUBLIC_STEALTH_VAULT_ADDRESS_PASSET as `0x${string}` | undefined;

export const TEST_TOKEN_ADDRESS_LOCAL = process.env
  .NEXT_PUBLIC_TEST_TOKEN_ADDRESS_LOCAL as `0x${string}` | undefined;

export const TEST_TOKEN_ADDRESS_PASSET = process.env
  .NEXT_PUBLIC_TEST_TOKEN_ADDRESS_PASSET as `0x${string}` | undefined;

export const TEST_ASSET_ID = keccak256(toBytes("TST")) as `0x${string}`;

