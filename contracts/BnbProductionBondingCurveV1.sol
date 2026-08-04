// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The sole external boundary for production graduation. The adapter must
/// pull exactly `tokenAmount` with transferFrom and atomically create/fund the pool.
interface IBnbDexGraduationAdapterV1 {
    struct GraduationParams {
        uint256 tokenAmount;
        uint256 nativeAmount;
        uint256 minTokenAmount;
        uint256 minNativeAmount;
        uint256 deadline;
        uint256 nonce;
        address lpTimelock;
    }
    function graduate(address token, GraduationParams calldata params) external payable returns (address pool);
    function isVerifiedPool(address token, address pool) external view returns (bool);
}

abstract contract BnbProductionReentrancyGuardV1 {
    uint256 private _guard = 1;
    modifier nonReentrant() { if (_guard != 1) revert BnbReentrancy(); _guard = 2; _; _guard = 1; }
    error BnbReentrancy();
}

/// @title BNB production bonding curve foundation V1
/// @notice This contract deliberately contains no DEX implementation. Graduation
/// is fail-closed and pool stays zero until a configured adapter proves its pool.
/// User principal (trackedReserve) and fee liabilities are never recoverable.
contract BnbProductionBondingCurveV1 is BnbProductionReentrancyGuardV1 {
    uint256 public constant BPS=10_000; uint256 public constant MAX_FEE_BPS=1_000; uint256 public constant MAX_SUPPLY=1e30;
    uint8 public constant decimals=18;
    string public name; string public symbol; uint256 public immutable totalSupply; uint256 public currentSupply;
    uint256 public immutable basePrice; uint256 public immutable slope; uint256 public immutable feeBps; uint256 public immutable platformFeeBps;
    address public immutable creator; address public immutable platformFeeRecipient; address public immutable admin;
    IBnbDexGraduationAdapterV1 public immutable graduationAdapter; address public immutable minLpTimelock;
    address public pool; uint256 public trackedReserve; uint256 public graduationNonce;
    mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance; mapping(address=>uint256) public feeCredits;
    bool public paused; enum GraduationState { Active, Pending, Graduated } GraduationState public graduationState;
    bytes32 public pendingGraduationHash; IBnbDexGraduationAdapterV1.GraduationParams public pendingGraduation;

    error ZeroAddress(); error InvalidConfig(); error InvalidAmount(); error Paused(); error NotAdmin(); error NotActive(); error NotPending(); error DeadlineExpired(); error Slippage(); error InsufficientBalance(); error ReserveUnderflow(); error NoFees(); error TransferFailed(); error GraduationNotReady(); error AdapterNotConfigured(); error PoolNotVerified(); error InvalidNonce(); error InvalidTimelock(); error InvalidPendingParams(); error RecoveryExceedsExcess();
    event Transfer(address indexed from,address indexed to,uint256 value); event Approval(address indexed owner,address indexed spender,uint256 value);
    event TokensPurchased(address indexed buyer,uint256 amount,uint256 cost,uint256 fee); event TokensSold(address indexed seller,uint256 amount,uint256 proceeds,uint256 fee); event FeesWithdrawn(address indexed recipient,uint256 amount);
    event PauseChanged(bool paused); event GraduationRequested(uint256 indexed nonce,bytes32 paramsHash,uint256 nativeAmount,uint256 tokenAmount); event GraduationCancelled(uint256 indexed nonce);
    event Graduated(address indexed adapter,address indexed pool,uint256 nativeAmount,uint256 tokenAmount,address lpTimelock); event ExcessRecovered(address indexed recipient,uint256 nativeAmount,uint256 tokenAmount);

    constructor(string memory n,string memory s,uint256 supply,address tokenCreator,address platform,uint256 base,uint256 curveSlope,uint256 totalFeeBps,uint256 platformShareBps,address tokenAdmin,address adapter,address lpTimelockMin) {
        if(supply==0||supply>MAX_SUPPLY||tokenCreator==address(0)||platform==address(0)||tokenAdmin==address(0)||adapter==address(0)) revert InvalidConfig();
        if(base==0||totalFeeBps>MAX_FEE_BPS||platformShareBps>totalFeeBps||lpTimelockMin==address(0)) revert InvalidConfig();
        name=n; symbol=s; totalSupply=supply; creator=tokenCreator; platformFeeRecipient=platform; basePrice=base; slope=curveSlope; feeBps=totalFeeBps; platformFeeBps=platformShareBps; admin=tokenAdmin; graduationAdapter=IBnbDexGraduationAdapterV1(adapter); minLpTimelock=lpTimelockMin;
        balanceOf[address(this)]=supply; emit Transfer(address(0),address(this),supply);
    }
    modifier onlyAdmin(){if(msg.sender!=admin) revert NotAdmin(); _;} modifier active(){if(paused) revert Paused(); if(graduationState!=GraduationState.Active) revert NotActive(); _;} modifier deadline(uint256 d){if(block.timestamp>d) revert DeadlineExpired(); _;}
    function _cost(uint256 from,uint256 amount) internal view returns(uint256){uint256 to=from+amount; return basePrice*amount+(slope*(to*to-from*from))/(2*totalSupply);}
    function getBuyCost(uint256 amount) public view returns(uint256 cost,uint256 fee){if(amount==0||currentSupply+amount>totalSupply) revert InvalidAmount(); cost=_cost(currentSupply,amount); fee=cost*feeBps/BPS;}
    function getSellProceeds(uint256 amount) public view returns(uint256 proceeds,uint256 fee){if(amount==0||amount>currentSupply) revert InvalidAmount(); proceeds=_cost(currentSupply-amount,amount); fee=proceeds*feeBps/BPS;}
    function buy(uint256 amount,uint256 maxCost,uint256 d) external payable nonReentrant active deadline(d){(uint256 c,uint256 f)=getBuyCost(amount);uint256 total=c+f;if(total>maxCost||msg.value<total) revert Slippage();currentSupply+=amount;balanceOf[address(this)]-=amount;balanceOf[msg.sender]+=amount;trackedReserve+=c;_creditFees(f);_send(msg.sender,msg.value-total);emit Transfer(address(this),msg.sender,amount);emit TokensPurchased(msg.sender,amount,c,f);}
    function sell(uint256 amount,uint256 minProceeds,uint256 d) external nonReentrant active deadline(d){(uint256 p,uint256 f)=getSellProceeds(amount);uint256 net=p-f;if(net<minProceeds||balanceOf[msg.sender]<amount||allowance[msg.sender][address(this)]<amount) revert Slippage();if(trackedReserve<net) revert ReserveUnderflow();allowance[msg.sender][address(this)]-=amount;balanceOf[msg.sender]-=amount;balanceOf[address(this)]+=amount;currentSupply-=amount;trackedReserve-=net;_creditFees(f);_send(msg.sender,net);emit Transfer(msg.sender,address(this),amount);emit TokensSold(msg.sender,amount,net,f);}
    function _creditFees(uint256 fee) internal {uint256 p=fee*(feeBps==0?0:platformFeeBps)/ (feeBps==0?1:feeBps);feeCredits[platformFeeRecipient]+=p;feeCredits[creator]+=fee-p;}
    function liabilities() public view returns(uint256){return feeCredits[platformFeeRecipient]+(creator==platformFeeRecipient?0:feeCredits[creator]);}
    function withdrawFees() external nonReentrant {uint256 a=feeCredits[msg.sender];if(a==0) revert NoFees();if(address(this).balance<a+trackedReserve+liabilities()-a) revert ReserveUnderflow();feeCredits[msg.sender]=0;_send(msg.sender,a);emit FeesWithdrawn(msg.sender,a);}
    function approve(address spender,uint256 amount) external returns(bool){if(spender==address(0)) revert ZeroAddress();allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;} function transferFrom(address from,address to,uint256 amount) external returns(bool){if(allowance[from][msg.sender]<amount) revert InsufficientBalance();allowance[from][msg.sender]-=amount;_transfer(from,to,amount);return true;} function _transfer(address from,address to,uint256 amount) internal {if(to==address(0)||balanceOf[from]<amount) revert InsufficientBalance();balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);}
    function setPaused(bool value) external onlyAdmin{paused=value;emit PauseChanged(value);}

    /// @notice Stores a nonce-bound request. All amounts and the immutable LP timelock policy are validated before Pending.
    function requestGraduation(IBnbDexGraduationAdapterV1.GraduationParams calldata p) external onlyAdmin active {if(p.tokenAmount==0||p.nativeAmount==0||p.minTokenAmount>p.tokenAmount||p.minNativeAmount>p.nativeAmount||p.deadline<block.timestamp) revert InvalidPendingParams();if(p.nonce!=graduationNonce) revert InvalidNonce();if(p.lpTimelock==address(0)||p.lpTimelock!=minLpTimelock) revert InvalidTimelock();if(p.nativeAmount>trackedReserve||p.tokenAmount>balanceOf[address(this)]) revert GraduationNotReady();pendingGraduation=p;pendingGraduationHash=keccak256(abi.encode(p));graduationState=GraduationState.Pending;emit GraduationRequested(p.nonce,pendingGraduationHash,p.nativeAmount,p.tokenAmount);}
    /// @notice Adapter receives only the exact curve inventory amount through a temporary allowance. Any revert leaves all state and balances unchanged.
    function executeGraduation(IBnbDexGraduationAdapterV1.GraduationParams calldata p) external onlyAdmin nonReentrant {if(graduationState!=GraduationState.Pending||keccak256(abi.encode(p))!=pendingGraduationHash) revert NotPending();if(p.deadline<block.timestamp) revert DeadlineExpired();uint256 beforeToken=balanceOf[address(this)];uint256 beforeLiabilities=liabilities();if(address(this).balance<beforeLiabilities+trackedReserve||p.nativeAmount>trackedReserve) revert ReserveUnderflow();allowance[address(this)][address(graduationAdapter)]=p.tokenAmount;emit Approval(address(this),address(graduationAdapter),p.tokenAmount);address candidate=graduationAdapter.graduate{value:p.nativeAmount}(address(this),p);allowance[address(this)][address(graduationAdapter)]=0;emit Approval(address(this),address(graduationAdapter),0);if(beforeToken-balanceOf[address(this)]!=p.tokenAmount||!graduationAdapter.isVerifiedPool(address(this),candidate)||candidate==address(0)) revert PoolNotVerified();trackedReserve-=p.nativeAmount;pool=candidate;graduationState=GraduationState.Graduated;graduationNonce++;emit Graduated(address(graduationAdapter),candidate,p.nativeAmount,p.tokenAmount,p.lpTimelock);}
    function cancelGraduation() external onlyAdmin {if(graduationState!=GraduationState.Pending) revert NotPending();pendingGraduationHash=bytes32(0);graduationState=GraduationState.Active;emit GraduationCancelled(graduationNonce);}
    /// @notice Only unsolicited excess may be recovered; tracked reserve and all fee credits are permanently protected.
    function recoverExcess(address payable to,uint256 nativeAmount,uint256 tokenAmount) external onlyAdmin nonReentrant {if(to==address(0)) revert ZeroAddress();uint256 excessNative=address(this).balance-(trackedReserve+liabilities());uint256 protectedTokens=graduationState==GraduationState.Graduated?totalSupply-currentSupply-pendingGraduation.tokenAmount:totalSupply-currentSupply;if(nativeAmount>excessNative||tokenAmount>balanceOf[address(this)]-protectedTokens) revert RecoveryExceedsExcess();if(nativeAmount>0)_send(to,nativeAmount);if(tokenAmount>0){balanceOf[address(this)]-=tokenAmount;balanceOf[to]+=tokenAmount;emit Transfer(address(this),to,tokenAmount);}emit ExcessRecovered(to,nativeAmount,tokenAmount);}
    function _send(address to,uint256 amount) internal {if(amount==0)return;(bool ok,)=to.call{value:amount}("");if(!ok) revert TransferFailed();}receive() external payable{}
}

contract BnbProductionTokenFactoryV1 is BnbProductionReentrancyGuardV1 {address public immutable owner;address public immutable platformFeeRecipient;uint256 public immutable feeBps;uint256 public immutable platformFeeBps;address public immutable graduationAdapter;address public immutable minLpTimelock;address[] public tokens;event TokenCreated(address indexed token,address indexed creator,string name,string symbol,uint256 supply);error ZeroAddress();error InvalidConfig();error NotOwner();constructor(address platform,uint256 totalFeeBps,uint256 platformShareBps,address adapter,address lpTimelockMin){if(platform==address(0)||adapter==address(0)) revert ZeroAddress();if(totalFeeBps>1000||platformShareBps>totalFeeBps||lpTimelockMin==address(0)) revert InvalidConfig();owner=msg.sender;platformFeeRecipient=platform;feeBps=totalFeeBps;platformFeeBps=platformShareBps;graduationAdapter=adapter;minLpTimelock=lpTimelockMin;}function createToken(string calldata n,string calldata s,uint256 supply,uint256 base,uint256 slope) external nonReentrant returns(address token){token=address(new BnbProductionBondingCurveV1(n,s,supply,msg.sender,platformFeeRecipient,base,slope,feeBps,platformFeeBps,owner,graduationAdapter,minLpTimelock));tokens.push(token);emit TokenCreated(token,msg.sender,n,s,supply);}function pauseToken(address token,bool value) external{if(msg.sender!=owner) revert NotOwner();BnbProductionBondingCurveV1(payable(token)).setPaused(value);}function tokenCount() external view returns(uint256){return tokens.length;}}
