import { describe, expect, test } from "bun:test";
import { BNB_TESTNET, ensureBnbTestnet } from "../src/config/networks";
import { createBnbTestnetToken, getBnbTestnetFactoryAddress } from "../src/services/bnbTestnetTokenCreation";
describe("BNB Smart Chain Testnet safety", () => {
 test("metadata is testnet chain 97", () => { expect(BNB_TESTNET.chainId).toBe(97); expect(BNB_TESTNET.nativeCurrency.symbol).toBe("tBNB"); expect(BNB_TESTNET.explorerUrl).toContain("testnet"); });
 test("rejects wrong chain", async () => { const p={request: async()=>"0x1"}; await expect(ensureBnbTestnet(p)).rejects.toThrow("chain ID 97"); });
 test("null factory gates without sending", async () => { let sent=false; const p={request: async({method}:{method:string})=> method==="eth_chainId"?"0x61":(sent=true,"0x0")}; expect(getBnbTestnetFactoryAddress()).toBeNull(); await expect(createBnbTestnetToken(p,{name:"A",symbol:"A",supply:1n})).rejects.toThrow("factory address"); expect(sent).toBe(false); });
});
