// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal LP custody lock. LP tokens are held here and cannot be moved
/// before unlock; only the immutable beneficiary can release them after unlock.
contract BnbLpTimelockV1 {
    address public immutable beneficiary;
    uint256 public immutable unlockTime;
    error InvalidConfig(); error NotBeneficiary(); error StillLocked(); error TransferFailed();
    event Released(address indexed token, uint256 amount, address indexed beneficiary);
    constructor(address beneficiary_, uint256 unlockTime_) {
        if (beneficiary_ == address(0) || unlockTime_ <= block.timestamp) revert InvalidConfig();
        beneficiary = beneficiary_; unlockTime = unlockTime_;
    }
    function release(address token, uint256 amount) external {
        if (msg.sender != beneficiary) revert NotBeneficiary();
        if (block.timestamp < unlockTime) revert StillLocked();
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", beneficiary, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        emit Released(token, amount, beneficiary);
    }
}
