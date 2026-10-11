pragma solidity ^0.8.37;
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "forge-std/safeconsole.sol";
contract Refuje {
    mapping(uint256 => uint256) keyBalances;
    mapping(address => mapping(uint256 => uint256)) keyErc20Balances;
    mapping(uint248 => uint256) nullifiers;
    mapping(uint248 => uint256) pubKeys;
    error NeedBalance(uint256);
    function registerPubKey(bytes32 key) external {
        uint256 nullifier = uint256(key);
        pubKeys[uint248(nullifier >> 8)] |= 1 << (nullifier & 255);
        safeconsole.log(nullifier);
    }
    function depositToKey(uint256 key) external payable {
        keyBalances[key] += msg.value;
        safeconsole.log(key);
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
    ) internal returns (bytes32) {
        bytes memory a = new bytes(32 * 512);
        for (uint256 i = 0; i < 512; i++) {
            bool x = (uint8(hash[(i >> 4) & 31]) >> ((i >> 1) & 7)) & 1 ==
                uint8(i & 1);
            // safeconsole.log(x);

            bytes memory data = new bytes(32);
            for (uint256 j = 0; j < 32; j++) data[j] = proof[i * 32 + j];
            if (x) {
                safeconsole.log(
                    uint256(bytes32(data)),
                    "->",
                    uint256(keccak256(data))
                );
                data = abi.encodePacked(keccak256(data));
            }
            for (uint256 j = 0; j < 32; j++) a[i * 32 + j] = data[j];
        }
        bytes memory b = new bytes(32 * 64);
        for (uint256 i = 0; i < 64; i++) {
            bytes memory d = new bytes(32 * 8);
            for (uint256 j = 0; j < 32 * 8; j++) d[j] = a[j + i * 32 * 8];
            bytes32 h = keccak256(d);
            for (uint256 j = 0; j < 32; j++) b[i * 32 + j] = h[j];
        }
        bytes memory c = new bytes(32 * 8);
        for (uint256 i = 0; i < 8; i++) {
            bytes memory d = new bytes(32 * 8);
            for (uint256 j = 0; j < 32 * 8; j++) d[j] = b[j + i * 32 * 8];
            bytes32 h = keccak256(d);
            for (uint256 j = 0; j < 32; j++) c[i * 32 + j] = h[j];
        }

        bytes32 root = keccak256(c);
        // for (uint256 i = 0; i < 32; i++) safeconsole.log(uint8(root[i]));
        uint256 nullifier = uint256(root);
        safeconsole.log(nullifier);
        require(
            nullifiers[uint248(nullifier >> 8)] & (1 << (nullifier & 255)) == 0,
            "nullified"
        );
        require(
            pubKeys[uint248(nullifier >> 8)] & (1 << (nullifier & 255)) != 0,
            "not registered"
        );
        nullifiers[uint248(nullifier >> 8)] |= 1 << (nullifier & 255);
        for (uint256 i = 0; i < 256; i++) {
            bool x = (uint8(path[i >> 3]) >> (i & 7)) & 1 != 0;
            safeconsole.log(uint256(root), " ", x);
            if (x) {
                root = keccak256(
                    abi.encodePacked(root, bytes32(proof[(i + 512) * 32:]))
                );
            } else {
                root = keccak256(
                    abi.encodePacked(bytes32(proof[(i + 512) * 32:]), root)
                );
            }
        }
        safeconsole.log(uint256(root));
        return root;
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
        bytes32 thash = keccak256(abi.encode(prefix, meta, targets));
        bytes32 tpath = keccak256(abi.encode(prefix, meta, path));
        for (uint256 i = 0; i < 32; i++) safeconsole.log(uint8(tpath[i]));
        safeconsole.log(uint256(tpath));
        bytes32 key = widthdrawDeriveKey(thash, tpath, proof);
        uint256 j = 0;
        for (uint256 i = 0; i < targets.length; i += 64) {
            uint256 k = uint256(bytes32(targets[i:(i + 32)]));
            uint256 fee = k >> 7;
            balances(meta, key, fee, true);
            payout(meta, msg.sender, fee, 0);
            k -= fee;
            bool targetIsKey = false;
            for (uint256 j2 = i + 52; j2 < 63; j2++) {
                if (targets[j2] != 0) {
                    targetIsKey = true;
                }
            }
            if (!targetIsKey) {
                uint8 flags = uint8(targets[i + 63]);
                address target = address(bytes20(targets[(i + 32):(i + 52)]));
                if (flags & 0x40 != 0)
                    require(target == msg.sender, "sender check");
                balances(meta, key, k, true);
                // (bool success, ) = target.call{value: k}("");
                payout(meta, target, k, flags & 0x1);
                if (flags & 0x80 != 0) {
                    i += 32;
                    require(
                        keccak256(blobs[j]) ==
                            bytes32(targets[(i + 32):(i + 64)]),
                        "blob check"
                    );
                    j += 1;
                    (address contract_, bytes1 flags2, bytes memory data) = abi
                        .decode(blobs[j - 1], (address, bytes1, bytes));
                    (bool success, bytes memory result) = contract_.call(data);
                    require(success, "worked");
                    if (uint8(flags2) & 1 != 0) {
                        (success, ) = address(this).delegatecall(
                            abi.decode(result, (bytes))
                        );
                        require(success, "ret call");
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
            require(
                keyBalances[uint256(key)] >= amount,
                NeedBalance(amount - keyBalances[uint256(key)])
            );
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
        require(success, "payout");
    }
    function ercBalances(
        bytes memory meta,
        bytes32 key,
        uint256 amount,
        bool charge
    ) internal {
        IERC20 token = IERC20(address(bytes20(meta)));
        if (charge) {
            require(
                keyErc20Balances[address(token)][uint256(key)] >= amount,
                NeedBalance(
                    amount - keyErc20Balances[address(token)][uint256(key)]
                )
            );
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
            require(token.transfer(target, amount), "payout");
        } else {
            require(token.approve(target, amount), "payout");
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
