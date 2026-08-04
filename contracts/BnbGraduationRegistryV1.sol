// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Explicit allow-list binding a production curve to its token.
contract BnbGraduationRegistryV1 {
    address public immutable owner;
    mapping(address => mapping(address => bool)) public isAuthorizedGraduationCurve;
    error InvalidConfig(); error NotOwner();
    event CurveAuthorizationChanged(address indexed curve, address indexed token, bool authorized);
    constructor(address owner_) { if (owner_ == address(0)) revert InvalidConfig(); owner = owner_; }
    function setAuthorizedGraduationCurve(address curve, address token, bool authorized) external {
        if (msg.sender != owner) revert NotOwner();
        if (curve == address(0) || token == address(0)) revert InvalidConfig();
        isAuthorizedGraduationCurve[curve][token] = authorized;
        emit CurveAuthorizationChanged(curve, token, authorized);
    }
}
