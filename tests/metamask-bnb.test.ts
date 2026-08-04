import { describe, expect, test } from "bun:test";
import { connectMetaMaskBnb, shortAddress } from "../src/services/metamaskBnb";

const ACCOUNT = "0x5985a841601aE93D8Ddfec88715C755235490404";

describe("MetaMask BNB QA connector", () => {
  test("rejects when injected provider is absent", async () => {
    await expect(connectMetaMaskBnb(undefined)).rejects.toThrow("MetaMask was not detected");
  });
  test("requests accounts and switches wrong chain", async () => {
    const calls: string[] = [];
    const provider = { request: async ({ method }: { method: string; params?: unknown[] }) => {
      calls.push(method);
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "eth_chainId") return calls.filter((m) => m === "eth_chainId").length === 1 ? "0x1" : "0x61";
      return null;
    } };
    const result = await connectMetaMaskBnb(provider);
    expect(result.address).toBe(ACCOUNT);
    expect(calls).toEqual(["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
  });
  test("adds BNB testnet when wallet reports unknown chain", async () => {
    const calls: string[] = [];
    const provider = { request: async ({ method }: { method: string; params?: unknown[] }) => {
      calls.push(method);
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "eth_chainId") return calls.filter((m) => m === "eth_chainId").length === 1 ? "0x539" : "0x61";
      if (method === "wallet_switchEthereumChain") throw { code: 4902 };
      return null;
    } };
    await connectMetaMaskBnb(provider);
    expect(calls).toContain("wallet_addEthereumChain");
  });
  test("shortens addresses safely", () => expect(shortAddress(ACCOUNT)).toBe("0x5985…0404"));
});
