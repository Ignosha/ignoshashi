import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { encodeBaseSepoliaCreateToken, createBaseSepoliaToken, parseCreatedTokenAddress } from "../src/services/baseSepoliaTokenCreation";
import { getBondingCurveFactoryAddress } from "../src/contracts/addresses";
const abi = [{ anonymous:false, inputs:[{indexed:true,name:"token",type:"address"},{indexed:true,name:"creator",type:"address"},{indexed:false,name:"name",type:"string"},{indexed:false,name:"symbol",type:"string"},{indexed:false,name:"supply",type:"uint256"}],name:"TokenCreated",type:"event" }];
describe("Base Sepolia token creation", () => {
 test("maps Base Sepolia to the verified factory and keeps BNB unconfigured", () => {
  expect(getBondingCurveFactoryAddress(84532)).toBe("0x4Ed3f3925D1cd5fEd721Baf49A8a7f557dA62572");
  expect(getBondingCurveFactoryAddress(97)).toBeNull();
 });
 test("encodes factory arguments", () => { const data=encodeBaseSepoliaCreateToken("A","A",100n); expect(data.slice(0,10)).toBe(new ethers.Interface([{name:"createToken",type:"function",inputs:[{name:"n",type:"string"},{name:"s",type:"string"},{name:"supply",type:"uint256"},{name:"base",type:"uint256"},{name:"slope",type:"uint256"}],outputs:[],stateMutability:"nonpayable"}]).getFunction("createToken")!.selector); });
 test("rejects wrong chain and null factory without sending", async () => { let sent=false; const p={request:async({method}:{method:string})=>method==="eth_chainId"?"0x1":(sent=true,"0x0")}; await expect(createBaseSepoliaToken(p,{name:"A",symbol:"A",supply:1n})).rejects.toThrow("Base Sepolia"); expect(sent).toBe(false); const q={request:async({method}:{method:string})=>method==="eth_chainId"?"0x14a34":[]}; await expect(createBaseSepoliaToken(q,{name:"A",symbol:"A",supply:1n,factoryAddress:null})).rejects.toThrow("factory address"); });
 test("parses TokenCreated address",()=>{const i=new ethers.Interface(abi);const token="0x00000000000000000000000000000000000000a1";const log=i.encodeEventLog(i.getEvent("TokenCreated")!,[token,token,"A","A",1n]);expect(parseCreatedTokenAddress({logs:[log]})?.toLowerCase()).toBe(token.toLowerCase());});
});
