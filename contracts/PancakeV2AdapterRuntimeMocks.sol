// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockERC20 {
    string public name;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public shortTransfer;
    bool public rejectReset;

    constructor(string memory n) { name = n; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        if (amount == 0 && rejectReset) return false;
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        uint256 sent = shortTransfer && amount > 1 ? amount - 1 : amount;
        require(balanceOf[from] >= sent, "balance");
        balanceOf[from] -= sent;
        balanceOf[to] += sent;
        return true;
    }
}

contract MockPair is MockERC20 {
    address public token0;
    address public token1;
    constructor(address a, address b) MockERC20("LP") { token0 = a; token1 = b; }
}

contract MockFactory {
    address public pair;
    address public forcedPair;
    function getPair(address, address) external view returns (address) { return pair; }
    function createPair(address a, address b) external returns (address) {
        pair = forcedPair == address(0) ? address(new MockPair(a, b)) : forcedPair;
        return pair;
    }
    function setPair(address p) external { pair = p; }
    function setForcedPair(address p) external { forcedPair = p; }
}

contract MockRouter {
    address public factory;
    address public WETH;
    uint256 public actualToken;
    uint256 public actualNative;
    uint256 public liquidity = 1;
    bool public useActualToken;
    bool public useActualNative;
    bool public retainToken;
    bool public transferFullToken;

    constructor(address f, address w) { factory = f; WETH = w; }
    function setActualToken(uint256 amount, bool enabled) external { actualToken = amount; useActualToken = enabled; }
    function setActualNative(uint256 amount, bool enabled) external { actualNative = amount; useActualNative = enabled; }
    function setLiquidity(uint256 amount) external { liquidity = amount; }
    function setRetainToken(bool enabled) external { retainToken = enabled; }
    function setTransferFullToken(bool enabled) external { transferFullToken = enabled; }
    function addLiquidityETH(
        address token, uint256 amount, uint256, uint256, address to, uint256
    ) external payable returns (uint256, uint256, uint256) {
        uint256 usedToken = useActualToken ? actualToken : amount;
        uint256 usedNative = useActualNative ? actualNative : msg.value;
        uint256 transferToken = transferFullToken ? amount : usedToken;
        if (!retainToken) require(MockERC20(token).transferFrom(msg.sender, address(this), transferToken), "token transfer");
        address p = MockFactory(factory).getPair(token, WETH);
        if (p == address(0)) p = MockFactory(factory).createPair(token, WETH);
        MockPair(p).mint(to, liquidity);
        return (usedToken, usedNative, liquidity);
    }
}

contract MockRegistry {
    mapping(address => mapping(address => bool)) public auth;
    function set(address curve, address token, bool value) external { auth[curve][token] = value; }
    function isAuthorizedGraduationCurve(address curve, address token) external view returns (bool) { return auth[curve][token]; }
}
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
