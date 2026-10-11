pragma solidity ^0.8.37;
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
contract Refuje {
    mapping(uint256 => uint256) keyBalances;
    mapping(address => mapping(uint256 => uint256)) keyErc20Balances;
    function depositToKey(uint256 key) external payable {
        keyBalances[key] += msg.value;
    }
    function depositErc20(
        IERC20 token,
        uint256 key,
        uint256 value,
        address src
    ) external {
        require(token.transferFrom(src, address(this), value));
        keyErc20Balances[address(token)][key] += value;
    }
    function widthdrawDeriveKey(
        bytes32 hash,
        bytes32 path,
        bytes calldata proof
    ) internal returns (bytes32 root) {
        bytes memory a = new bytes(32 * 512);
        for (uint256 i = 0; i < 512; i++) {
            bool x = (uint8(hash[i >> 4]) & ((1 << ((i >> 1) & 7))) != 0) ==
                (i & 1 != 0);
            if (x) {
                bytes32 hash = keccak256(proof[(i * 32):(i * 32) + 32]);
                for (uint256 j = 0; j < 32; j++) a[i * 32 + j] = hash[j];
            } else {
                for (uint256 j = 0; j < 32; j++)
                    a[i * 32 + j] = proof[i * 32 + j];
            }
        }
        root = keccak256(a);
        for (uint256 i = 0; i < 256; i++) {
            bool x = uint8(path[i >> 3]) & ((1 << (i & 7))) != 0;
            if (x) {
                root = keccak256(
                    abi.encodePacked(root, proof[(i + 512) * 32:(i + 513) * 32])
                );
            } else {
                root = keccak256(
                    abi.encodePacked(proof[(i + 512) * 32:(i + 513) * 32], root)
                );
            }
        }
    }
    function widthdrawMeta(
        bytes32 path,
        bytes calldata targets,
        bytes[] calldata blobs,
        bytes calldata proof,
        bytes memory prefix,
        bytes memory meta,
        function(bytes memory, bytes32, uint256, bool) internal balances,
        function(bytes memory, address, uint256, uint8) internal payout
    ) internal {
        bytes32 key = widthdrawDeriveKey(
            keccak256(abi.encodePacked(prefix, meta, targets)),
            keccak256(abi.encodePacked(prefix, meta, path)),
            proof
        );
        uint256 j = 0;
        for (uint256 i = 0; i < targets.length; i += 64) {
            uint256 k = uint256(bytes32(targets[i:(i + 32)]));
            uint256 fee = k >> 7;
            balances(meta, key, fee, true);
            payout(meta, msg.sender, fee, 0);
            k -= fee;
            bool targetIsKey = false;
            for (uint256 j = i + 52; j < 63; j++) {
                if (targets[j] != 0) {
                    targetIsKey = true;
                }
            }
            if (!targetIsKey) {
                uint8 flags = uint8(targets[i + 63]);
                address target = address(bytes20(targets[(i + 32):(i + 52)]));
                if (flags & 0x40 != 0) require(target == msg.sender);
                balances(meta, key, k, true);
                // (bool success, ) = target.call{value: k}("");
                payout(meta, target, k, flags & 0x1);
                if (flags & 0x80 != 0) {
                    i += 32;
                    require(
                        keccak256(blobs[j]) ==
                            bytes32(targets[(i + 32):(i + 64)])
                    );
                    j += 1;
                    (address contract_, bytes1 flags, bytes memory data) = abi
                        .decode(blobs[j - 1], (address, bytes1, bytes));
                    (bool success, bytes memory result) = contract_.call(data);
                    require(success);
                    if (uint8(flags) & 1 != 0) {
                        (success, ) = address(this).delegatecall(
                            abi.decode(result, (bytes))
                        );
                        require(success);
                    }
                }
            } else {
                balances(meta, key, k, true);
                balances(meta, bytes32(targets[(i + 32):(i + 64)]), k, false);
            }
        }
    }
    function ethBalances(
        bytes memory meta,
        bytes32 key,
        uint256 amount,
        bool charge
    ) internal {
        if (charge) {
            require(keyBalances[uint256(key)] >= amount);
            keyBalances[uint256(key)] -= amount;
        } else {
            keyBalances[uint256(key)] += amount;
        }
    }
    function ethPayout(
        bytes memory meta,
        address target,
        uint256 amount,
        uint8 flags
    ) internal {
        (bool success, ) = target.call{value: amount}("");
        require(success);
    }
    function ercBalances(
        bytes memory meta,
        bytes32 key,
        uint256 amount,
        bool charge
    ) internal {
        IERC20 token = IERC20(address(bytes20(meta)));
        if (charge) {
            require(keyErc20Balances[address(token)][uint256(key)] > amount);
            keyErc20Balances[address(token)][uint256(key)] -= amount;
        } else {
            keyErc20Balances[address(token)][uint256(key)] += amount;
        }
    }
    function ercPayout(
        bytes memory meta,
        address target,
        uint256 amount,
        uint8 flags
    ) internal {
        IERC20 token = IERC20(address(bytes20(meta)));
        if (flags & 1 == 0) {
            require(token.transfer(target, amount));
        } else {
            require(token.approve(target, amount));
        }
    }
    function widthdrawEth(
        bytes32 path,
        bytes calldata targets,
        bytes[] calldata blobs,
        bytes calldata proof
    ) external {
        widthdrawMeta(
            path,
            targets,
            blobs,
            proof,
            "pay",
            "",
            ethBalances,
            ethPayout
        );
    }
    function widthdrawErc20(
        IERC20 token,
        bytes32 path,
        bytes calldata targets,
        bytes[] calldata blobs,
        bytes calldata proof
    ) external {
        widthdrawMeta(
            path,
            targets,
            blobs,
            proof,
            "pay20",
            abi.encodePacked(address(token)),
            ercBalances,
            ercPayout
        );
    }
}
