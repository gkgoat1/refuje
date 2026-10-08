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
        token.transferFrom(src, address(this), value);
        keyErc20Balances[address(token)][key] += value;
    }
    function widthdrawDeriveKey(
        bytes32 hash,
        bytes32 path,
        bytes calldata proof
    ) internal returns (bytes32 root) {
        bytes memory a = new bytes(32 * 512);
        for (uint256 i = 0; i < 512; i++) {
            bool x = (uint8(hash[i >> 4]) & ((1 << (i >> 1)) & 7) != 0) ==
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
            bool x = uint8(path[i >> 3]) & ((1 << i) & 7) != 0;
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
    function widthdrawEth(
        bytes32 path,
        bytes calldata targets,
        bytes calldata proof
    ) external {
        bytes32 key = widthdrawDeriveKey(
            keccak256(abi.encodePacked("pay", targets)),
            keccak256(abi.encodePacked("pay", path)),
            proof
        );
        for (uint256 i = 0; i < targets.length; i += 64) {
            uint256 k = uint256(bytes32(targets[i:(i + 32)]));
            bool targetIsKey = false;
            for (uint256 j = i + 52; j < 64; j++) {
                if (targets[j] != 0) {
                    targetIsKey = true;
                }
            }
            if (!targetIsKey) {
                address target = address(bytes20(targets[(i + 32):(i + 52)]));
                keyBalances[uint256(key)] -= k;
                (bool success, ) = target.call{value: k}("");
                require(success);
            } else {
                keyBalances[uint256(key)] -= k;
                keyBalances[uint256(bytes32(targets[(i + 32):(i + 64)]))] += k;
            }
        }
    }
    function widthdrawErc20(
        IERC20 token,
        bytes32 path,
        bytes calldata targets,
        bytes calldata proof
    ) external {
        bytes32 key = widthdrawDeriveKey(
            keccak256(abi.encodePacked("pay20", address(token), targets)),
            keccak256(abi.encodePacked("pay20", address(token), path)),
            proof
        );
        for (uint256 i = 0; i < targets.length; i += 64) {
            uint256 k = uint256(bytes32(targets[i:(i + 32)]));
            bool targetIsKey = false;
            for (uint256 j = i + 52; j < 64; j++) {
                if (targets[j] != 0) {
                    targetIsKey = true;
                }
            }
            if (!targetIsKey) {
                address target = address(bytes20(targets[(i + 32):(i + 52)]));
                keyErc20Balances[address(token)][uint256(key)] -= k;
                token.transfer(target, k);
            } else {
                keyErc20Balances[address(token)][uint256(key)] -= k;
                keyErc20Balances[address(token)][
                    uint256(bytes32(targets[(i + 32):(i + 64)]))
                ] += k;
            }
        }
    }
}
