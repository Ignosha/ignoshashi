// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Native-BNB bonding curve token. Chain-neutral EVM logic; intended for BNB
/// Smart Chain Testnet until independently audited and deployed. No DEX graduation
/// path is implemented in this contract.
abstract contract BnbReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private status = NOT_ENTERED;
    modifier nonReentrant() { require(status != ENTERED, "REENTRANCY"); status = ENTERED; _; status = NOT_ENTERED; }
}

contract BnbSmartChainTestnetBondingCurve is BnbReentrancyGuard {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    uint256 public currentSupply;
    uint256 public immutable basePrice;
    uint256 public immutable slope;
    uint256 public immutable feeBps;
    uint256 public immutable platformFeeBps;
    address public immutable creator;
    address public immutable platformFeeRecipient;
    address public immutable factory;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public feeCredits;

    enum GraduationState { Active, Pending, Graduated }
    GraduationState public graduationState;
    // Deliberately always zero: there is no unverified/fake DEX address.
    address public pool;
    uint256 public trackedGraduationReserve;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed tokenOwner, address indexed spender, uint256 value);
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost, uint256 fee);
    event TokensSold(address indexed seller, uint256 amount, uint256 proceeds, uint256 fee);
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    constructor(string memory n, string memory s, uint256 supply, address tokenCreator,
        address platform, uint256 base, uint256 curveSlope, uint256 totalFeeBps,
        uint256 platformShareBps) {
        require(supply > 0 && supply <= 1e12, "INVALID_SUPPLY");
        require(tokenCreator != address(0) && platform != address(0), "ZERO_RECIPIENT");
        require(base > 0 && totalFeeBps <= 1000 && platformShareBps <= 10000, "INVALID_CONFIG");
        require(platformShareBps <= 10000, "INVALID_SPLIT");
        name = n; symbol = s; totalSupply = supply; creator = tokenCreator;
        platformFeeRecipient = platform; factory = msg.sender; basePrice = base; slope = curveSlope;
        feeBps = totalFeeBps; platformFeeBps = platformShareBps;
        balanceOf[address(this)] = supply;
        emit Transfer(address(0), address(this), supply);
    }

    modifier active() { require(graduationState == GraduationState.Active, "CURVE_NOT_ACTIVE"); _; }
    modifier beforeDeadline(uint256 deadline) { require(block.timestamp <= deadline, "DEADLINE"); _; }

    function _cost(uint256 from, uint256 amount) internal view returns (uint256) {
        uint256 to = from + amount;
        return basePrice * amount + (slope * (to * to - from * from)) / (2 * totalSupply);
    }
    function getBuyCost(uint256 amount) public view returns (uint256 cost, uint256 fee) {
        require(amount > 0 && currentSupply + amount <= totalSupply, "INVALID_AMOUNT");
        cost = _cost(currentSupply, amount); fee = (cost * feeBps) / 10000;
    }
    function getSellProceeds(uint256 amount) public view returns (uint256 proceeds, uint256 fee) {
        require(amount > 0 && amount <= currentSupply, "INVALID_AMOUNT");
        proceeds = _cost(currentSupply - amount, amount); fee = (proceeds * feeBps) / 10000;
    }

    function buy(uint256 amount, uint256 maxCost, uint256 deadline)
        external payable nonReentrant active beforeDeadline(deadline) {
        (uint256 cost, uint256 fee) = getBuyCost(amount);
        uint256 total = cost + fee;
        require(total <= maxCost && msg.value >= total, "SLIPPAGE");
        currentSupply += amount; balanceOf[address(this)] -= amount; balanceOf[msg.sender] += amount;
        trackedGraduationReserve += cost; _creditFees(fee);
        uint256 refund = msg.value - total; if (refund != 0) _send(msg.sender, refund);
        emit Transfer(address(this), msg.sender, amount);
        emit TokensPurchased(msg.sender, amount, cost, fee);
    }

    function sell(uint256 amount, uint256 minProceeds, uint256 deadline)
        external nonReentrant active beforeDeadline(deadline) {
        (uint256 proceeds, uint256 fee) = getSellProceeds(amount);
        uint256 net = proceeds - fee;
        require(net >= minProceeds, "SLIPPAGE");
        require(balanceOf[msg.sender] >= amount && allowance[msg.sender][address(this)] >= amount, "INSUFFICIENT_TOKEN");
        require(trackedGraduationReserve >= net, "RESERVE_UNDERFLOW");
        allowance[msg.sender][address(this)] -= amount; balanceOf[msg.sender] -= amount;
        balanceOf[address(this)] += amount; currentSupply -= amount; trackedGraduationReserve -= net;
        _creditFees(fee); _send(msg.sender, net);
        emit Transfer(msg.sender, address(this), amount);
        emit TokensSold(msg.sender, amount, net, fee);
    }

    function _creditFees(uint256 fee) internal {
        uint256 platform = (fee * platformFeeBps) / 10000;
        feeCredits[platformFeeRecipient] += platform;
        feeCredits[creator] += fee - platform;
    }
    function withdrawFees() external nonReentrant {
        uint256 amount = feeCredits[msg.sender]; require(amount > 0, "NO_FEES");
        feeCredits[msg.sender] = 0; _send(msg.sender, amount); emit FeesWithdrawn(msg.sender, amount);
    }

    /// @dev Graduation is intentionally gated until a verified BNB DEX adapter exists.
    function requestGraduation(address) external pure { revert("BNB_GRADUATION_GATED"); }
    function executeGraduation() external pure { revert("BNB_GRADUATION_GATED"); }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0) && balanceOf[msg.sender] >= amount, "INVALID_TRANSFER");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; emit Transfer(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to != address(0) && balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "INVALID_TRANSFER");
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount); return true;
    }
    function _send(address to, uint256 amount) internal { (bool ok,) = to.call{value: amount}(""); require(ok, "BNB_TRANSFER"); }
    receive() external payable {}
}

contract BnbSmartChainTestnetTokenFactory is BnbReentrancyGuard {
    address public immutable platformFeeRecipient;
    uint256 public immutable feeBps;
    uint256 public immutable platformFeeBps;
    address[] public tokens;
    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 supply);

    constructor(address platform, uint256 totalFeeBps, uint256 platformShareBps) {
        require(platform != address(0), "ZERO_PLATFORM");
        require(totalFeeBps <= 1000 && platformShareBps <= 10000, "INVALID_CONFIG");
        platformFeeRecipient = platform; feeBps = totalFeeBps; platformFeeBps = platformShareBps;
    }
    function createToken(string calldata n, string calldata s, uint256 supply, uint256 base, uint256 slope)
        external nonReentrant returns (address token) {
        token = address(new BnbSmartChainTestnetBondingCurve(n, s, supply, msg.sender,
            platformFeeRecipient, base, slope, feeBps, platformFeeBps));
        tokens.push(token); emit TokenCreated(token, msg.sender, n, s, supply);
    }
    function tokenCount() external view returns (uint256) { return tokens.length; }
}
