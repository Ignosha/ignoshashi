// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal PancakeSwap V2-compatible factory boundary.
interface IPancakeV2FactoryV1 {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

/// @notice Minimal PancakeSwap V2-compatible router boundary.
interface IPancakeV2RouterV1 {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IERC20GraduationV1 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Registry controlled by the production factory/multisig. It binds a curve to its token.
interface IBnbGraduationRegistryV1 {
    function isAuthorizedGraduationCurve(address curve, address token) external view returns (bool);
}

interface IBnbDexGraduationAdapterV1 {
    struct GraduationParams { uint256 tokenAmount; uint256 nativeAmount; uint256 minTokenAmount; uint256 minNativeAmount; uint256 deadline; uint256 nonce; address lpTimelock; }
    function graduate(address token, GraduationParams calldata params) external payable returns (address pool);
    function isVerifiedPool(address token, address pool) external view returns (bool);
}

/// @title Pancake V2 graduation adapter V1
/// @notice Atomic token/native handoff and LP custody for BnbProductionBondingCurveV1.
///         No chain addresses are embedded; every dependency is injected and verified.
contract PancakeV2GraduationAdapterV1 {
    IPancakeV2FactoryV1 public immutable factory;
    IPancakeV2RouterV1 public immutable router;
    address public immutable WBNB;
    address public immutable lpTimelock;
    IBnbGraduationRegistryV1 public immutable registry;

    mapping(bytes32 => bool) public completed;

    error ZeroAddress(); error InvalidConfiguration(); error UnauthorizedCurve();
    error WrongTimelock(); error InvalidParams(); error DeadlineExpired();
    error Slippage(); error PairUnavailable(); error WrongPair(); error ZeroLiquidity();
    error ExactAmountMismatch(); error LpCustodyMismatch(); error Replay();
    error TokenTransferFailed(); error ApprovalFailed(); error NativeAmountMismatch();

    event Graduated(address indexed curve, address indexed token, address indexed pair,
        uint256 tokenAmount, uint256 nativeAmount, uint256 liquidity, address lpTimelock, uint256 nonce);

    constructor(address factory_, address router_, address wbnb_, address timelock_, address registry_) {
        if (factory_ == address(0) || router_ == address(0) || wbnb_ == address(0) ||
            timelock_ == address(0) || registry_ == address(0)) revert ZeroAddress();
        if (IPancakeV2RouterV1(router_).factory() != factory_ || IPancakeV2RouterV1(router_).WETH() != wbnb_)
            revert InvalidConfiguration();
        factory = IPancakeV2FactoryV1(factory_); router = IPancakeV2RouterV1(router_);
        WBNB = wbnb_; lpTimelock = timelock_; registry = IBnbGraduationRegistryV1(registry_);
    }

    function graduate(address token, IBnbDexGraduationAdapterV1.GraduationParams calldata p) external payable returns (address pair) {
        uint256 tokenAmount = p.tokenAmount; uint256 nativeAmount = p.nativeAmount;
        uint256 minTokenAmount = p.minTokenAmount; uint256 minNativeAmount = p.minNativeAmount;
        uint256 deadline = p.deadline; uint256 nonce = p.nonce;
        if (!registry.isAuthorizedGraduationCurve(msg.sender, token)) revert UnauthorizedCurve();
        if (p.lpTimelock != lpTimelock) revert WrongTimelock();
        if (token == address(0) || tokenAmount == 0 || nativeAmount == 0 ||
            minTokenAmount > tokenAmount || minNativeAmount > nativeAmount || deadline < block.timestamp)
            revert InvalidParams();
        if (msg.value != nativeAmount) revert NativeAmountMismatch();
        bytes32 key = keccak256(abi.encode(msg.sender, token, nonce));
        if (completed[key]) revert Replay();
        completed[key] = true; // reverted automatically if any downstream operation fails

        pair = factory.getPair(token, WBNB);
        if (pair == address(0)) pair = factory.createPair(token, WBNB);
        if (pair == address(0) || factory.getPair(token, WBNB) != pair) revert PairUnavailable();
        address token0 = _pairToken0(pair); address token1 = _pairToken1(pair);
        if (!((token0 == token && token1 == WBNB) || (token0 == WBNB && token1 == token))) revert WrongPair();

        uint256 tokenBefore = IERC20GraduationV1(token).balanceOf(address(this));
        if (!IERC20GraduationV1(token).transferFrom(msg.sender, address(this), tokenAmount)) revert TokenTransferFailed();
        if (IERC20GraduationV1(token).balanceOf(address(this)) - tokenBefore != tokenAmount) revert ExactAmountMismatch();
        if (!IERC20GraduationV1(token).approve(address(router), tokenAmount)) revert ApprovalFailed();

        uint256 lpBefore = IERC20GraduationV1(pair).balanceOf(lpTimelock);
        (uint256 actualToken, uint256 actualNative, uint256 liquidity) = router.addLiquidityETH{value: nativeAmount}(
            token, tokenAmount, minTokenAmount, minNativeAmount, lpTimelock, deadline);
        // Reject routers that silently retain/refund the wrong amounts or mint no LP.
        if (actualToken < minTokenAmount || actualNative < minNativeAmount || actualToken > tokenAmount || actualNative > nativeAmount)
            revert Slippage();
        if (liquidity == 0) revert ZeroLiquidity();
        if (IERC20GraduationV1(pair).balanceOf(lpTimelock) - lpBefore != liquidity) revert LpCustodyMismatch();
        if (IERC20GraduationV1(token).balanceOf(address(this)) != tokenBefore) revert ExactAmountMismatch();
        // Reset the temporary approval; a non-compliant token is not accepted.
        if (!IERC20GraduationV1(token).approve(address(router), 0)) revert ApprovalFailed();
        emit Graduated(msg.sender, token, pair, actualToken, actualNative, liquidity, lpTimelock, nonce);
    }

    function isVerifiedPool(address token, address pair) external view returns (bool) {
        if (pair == address(0) || factory.getPair(token, WBNB) != pair) return false;
        address a = _pairToken0(pair); address b = _pairToken1(pair);
        return (a == token && b == WBNB) || (a == WBNB && b == token);
    }
    function _pairToken0(address pair) private view returns (address a) { (bool ok, bytes memory d)=pair.staticcall(abi.encodeWithSignature("token0()")); if(!ok||d.length<32) revert WrongPair(); a=abi.decode(d,(address)); }
    function _pairToken1(address pair) private view returns (address a) { (bool ok, bytes memory d)=pair.staticcall(abi.encodeWithSignature("token1()")); if(!ok||d.length<32) revert WrongPair(); a=abi.decode(d,(address)); }
    receive() external payable { }
}
