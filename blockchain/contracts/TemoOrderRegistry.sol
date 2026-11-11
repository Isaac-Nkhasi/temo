// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TemoOrderRegistry
/// @notice Tamper-evident registry for Temo marketplace order records (BIDT3110 Part B).
/// @dev   Only a content hash of each order snapshot is written on-chain. No personal
///        data (names, phone numbers, districts) ever leaves the Supabase database,
///        so the on-chain ledger stays compatible with GDPR Article 17 erasure.
contract TemoOrderRegistry {
    struct Record {
        bytes32 dataHash;   // sha256 of the canonical order snapshot
        uint64 recordedAt;  // block timestamp of submission
        address recordedBy; // address that submitted the record
        bool exists;
    }

    /// @notice Contract owner (deployer). May appoint/remove recorders.
    address public owner;

    /// @notice Accounts allowed to submit records (the Temo chain service).
    mapping(address => bool) public isRecorder;

    /// @notice orderId => record
    mapping(bytes32 => Record) private records;

    /// @notice Total number of orders anchored on-chain.
    uint256 public recordCount;

    event OrderRecorded(
        bytes32 indexed orderId,
        bytes32 dataHash,
        address indexed recordedBy,
        uint64 recordedAt
    );
    event RecorderUpdated(address indexed recorder, bool allowed);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error NotRecorder();
    error ZeroHash();
    error AlreadyRecorded(bytes32 orderId);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        isRecorder[msg.sender] = true;
        emit RecorderUpdated(msg.sender, true);
    }

    /// @notice Allow or revoke an account's ability to submit order records.
    function setRecorder(address recorder, bool allowed) external onlyOwner {
        if (recorder == address(0)) revert ZeroAddress();
        isRecorder[recorder] = allowed;
        emit RecorderUpdated(recorder, allowed);
    }

    /// @notice Hand over ownership (e.g. to a group member or multisig).
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Anchor the hash of one order snapshot. Reverts if already recorded.
    function recordOrder(bytes32 orderId, bytes32 dataHash) external {
        if (!isRecorder[msg.sender]) revert NotRecorder();
        if (dataHash == bytes32(0)) revert ZeroHash();
        if (records[orderId].exists) revert AlreadyRecorded(orderId);

        records[orderId] = Record({
            dataHash: dataHash,
            recordedAt: uint64(block.timestamp),
            recordedBy: msg.sender,
            exists: true
        });
        recordCount += 1;

        emit OrderRecorded(orderId, dataHash, msg.sender, uint64(block.timestamp));
    }

    /// @notice Retrieve a stored record (used by the app's verification view).
    function getRecord(bytes32 orderId)
        external
        view
        returns (bytes32 dataHash, uint64 recordedAt, address recordedBy, bool exists)
    {
        Record memory r = records[orderId];
        return (r.dataHash, r.recordedAt, r.recordedBy, r.exists);
    }

    /// @notice Integrity check: does this hash match what is anchored on-chain?
    function verify(bytes32 orderId, bytes32 dataHash) external view returns (bool) {
        Record memory r = records[orderId];
        return r.exists && r.dataHash == dataHash;
    }
}
