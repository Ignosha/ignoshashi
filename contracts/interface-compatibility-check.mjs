import { Interface } from "/home/team/shared/site/node_modules/ethers/lib.esm/index.js";
const curve = new Interface(["function graduate(address token, tuple(uint256 tokenAmount,uint256 nativeAmount,uint256 minTokenAmount,uint256 minNativeAmount,uint256 deadline,uint256 nonce,address lpTimelock) params) payable returns (address pool)"]);
const adapter = new Interface(["function graduate(address token, tuple(uint256 tokenAmount,uint256 nativeAmount,uint256 minTokenAmount,uint256 minNativeAmount,uint256 deadline,uint256 nonce,address lpTimelock) params) payable returns (address pool)"]);
if(curve.getFunction("graduate").selector!==adapter.getFunction("graduate").selector) throw new Error("graduate selector mismatch");
console.log(`graduate selector compatible: ${curve.getFunction("graduate").selector}`);
