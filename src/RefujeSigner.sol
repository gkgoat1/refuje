pragma solidity ^0.8.37;

/// @title RefujeSigner
/// @notice Solidity re-implementation of the Refuje Rust (src/lib.rs) and
/// TypeScript (src/index.ts) signing clients, intended for Forge-based
/// workflows (unit tests, fuzz tests, invariant handlers, and scripts).
///
/// The library has three layers:
///  - RefujeKeys: Lamport-style one-time keys (element derivation, public key,
///    signing, and recovery), bit-for-bit compatible with the contract's
///    `widthdrawDeriveKey` and the off-chain clients.
///  - RefujeTrees: an incremental sparse Merkle tree of depth 256 whose hashes
///    match `MerkleTree` in the clients (empty subtree = bytes32(0), internal
///    node = keccak256(left ‖ right)).
///  - RefujeWire: wire-format helpers (target records, call blobs, payment
///    preimages, and full withdrawal proofs) matching `Targets`/`Payment`.
library RefujeKeys {
    /// Number of 32-byte signature elements (two per message hash bit).
    uint256 internal constant SIG_ELEMENTS = 512;

    /// The i-th one-time-signature element preimage: keccak256(abi.encode(priv, uint32(i))).
    /// Matches `PrivateKey::at` in Rust and `Privatekey.#at` in TypeScript.
    function elementAt(bytes32 priv, uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode(priv, uint32(i)));
    }

    /// Merkle root over 512 leaves: 512 hashes -> 64 -> 8 -> root, with each
    /// round hashing contiguous 256-byte chunks. Shared by pubkey/recover.
    function rootOf(bytes memory leaves) internal pure returns (bytes32 root) {
        require(leaves.length == 32 * SIG_ELEMENTS, "leaves width");
        bytes memory b = new bytes(32 * 64);
        assembly {
            for { let i := 0 } lt(i, 64) { i := add(i, 1) } {
                mstore(add(b, add(32, mul(i, 32))), keccak256(add(leaves, add(32, mul(i, 256))), 256))
            }
        }
        bytes memory c = new bytes(32 * 8);
        assembly {
            for { let i := 0 } lt(i, 8) { i := add(i, 1) } {
                mstore(add(c, add(32, mul(i, 32))), keccak256(add(b, add(32, mul(i, 256))), 256))
            }
        }
        assembly {
            root := keccak256(add(c, 32), 256)
        }
    }

    /// Hash slot selection identical to the contract and clients: bit
    /// `(i >> 1) & 7` of byte `i >> 4` of `hash` decides, per parity of `i`,
    /// whether the preimage (`true`) or its hash (`false`) is revealed.
    function revealPreimage(bytes32 hash, uint256 i) internal pure returns (bool) {
        return (uint8(hash[(i >> 4) & 31]) >> ((i >> 1) & 7)) & 1 == uint8(i & 1);
    }

    /// Public key committed to by `priv`: keccak-hashed elements folded by rootOf.
    function pubkeyOf(bytes32 priv) internal pure returns (bytes32) {
        bytes memory a = new bytes(32 * SIG_ELEMENTS);
        for (uint256 i = 0; i < SIG_ELEMENTS; i++) {
            bytes32 h = keccak256(abi.encodePacked(elementAt(priv, i)));
            assembly {
                mstore(add(a, add(32, mul(i, 32))), h)
            }
        }
        return rootOf(a);
    }

    /// One-time signature over `hash` (the targets hash), as 512 * 32 bytes.
    function sign(bytes32 priv, bytes32 hash) internal pure returns (bytes memory sig) {
        sig = new bytes(32 * SIG_ELEMENTS);
        for (uint256 i = 0; i < SIG_ELEMENTS; i++) {
            bytes32 e = elementAt(priv, i);
            if (!revealPreimage(hash, i)) {
                e = keccak256(abi.encodePacked(e));
            }
            assembly {
                mstore(add(sig, add(32, mul(i, 32))), e)
            }
        }
    }

    /// Recovers the public key from a signature, mirroring the contract's loop.
    function recover(bytes memory sig, bytes32 hash) internal pure returns (bytes32) {
        require(sig.length == 32 * SIG_ELEMENTS, "sig width");
        bytes memory a = new bytes(32 * SIG_ELEMENTS);
        for (uint256 i = 0; i < SIG_ELEMENTS; i++) {
            bytes32 e;
            assembly {
                e := mload(add(sig, add(32, mul(i, 32))))
            }
            if (revealPreimage(hash, i)) {
                e = keccak256(abi.encodePacked(e));
            }
            assembly {
                mstore(add(a, add(32, mul(i, 32))), e)
            }
        }
        return rootOf(a);
    }
}

/// Incremental sparse Merkle tree of depth 256, storage-backed. Because it is a
/// struct containing a mapping it can only live in contract storage; declare it
/// as a state variable (or inside a storage array/struct) and pass it around as
/// `RefujeTree storage`.
struct RefujeTree {
    /// level => index => node hash. Level 0 is the root, level 256 the leaves.
    /// Missing entries are zero, matching `MerkleTree::None` in the clients.
    mapping(uint256 => mapping(uint256 => bytes32)) nodes;
    bytes32 root;
}

library RefujeTrees {
    uint256 internal constant DEPTH = 256;

    /// Bit of `path` consumed at `level` (level 0 = root decision), matching
    /// the clients' `bools_bytes` order: byte 31 bit 7 first, byte 0 bit 0 last.
    function bitAt(bytes32 path, uint256 level) internal pure returns (bool) {
        uint256 pos = (level & ~uint256(7)) | (7 - (level & 7));
        return (uint256(path) >> pos) & 1 != 0;
    }

    /// Inserts `leaf` (a public key) at `path` and recomputes the root.
    /// Inserting every key before depositing to `tree.root` keeps the balance
    /// key stable across the tree's withdrawals, as the clients do.
    function insert(RefujeTree storage tree, bytes32 path, bytes32 leaf) internal {
        uint256[DEPTH + 1] memory idx;
        bool[DEPTH] memory bits;
        uint256 cur = 0;
        for (uint256 l = 0; l < DEPTH; l++) {
            bool b = bitAt(path, l);
            bits[l] = b;
            cur = cur * 2 + (b ? 1 : 0);
            idx[l + 1] = cur;
        }
        tree.nodes[DEPTH][idx[DEPTH]] = leaf;
        bytes32 h = leaf;
        for (uint256 l = DEPTH; l > 0; l--) {
            bytes32 sibling = tree.nodes[l][idx[l] ^ 1];
            if (bits[l - 1]) {
                h = keccak256(abi.encodePacked(sibling, h));
            } else {
                h = keccak256(abi.encodePacked(h, sibling));
            }
            tree.nodes[l - 1][idx[l - 1]] = h;
        }
        tree.root = h;
    }

    /// Merkle proof for `path`, bottom-up (leaf-level sibling first), matching
    /// `MerkleTree::prove` after its reverse and the contract's fold order.
    function prove(RefujeTree storage tree, bytes32 path)
        internal
        view
        returns (bytes32[] memory siblings)
    {
        siblings = new bytes32[](DEPTH);
        uint256 cur = 0;
        for (uint256 l = 0; l < DEPTH; l++) {
            bool b = bitAt(path, l);
            uint256 child = cur * 2 + (b ? 1 : 0);
            siblings[l] = tree.nodes[l + 1][child ^ 1];
            cur = child;
        }
        for (uint256 i = 0; i < DEPTH / 2; i++) {
            (siblings[i], siblings[DEPTH - 1 - i]) = (siblings[DEPTH - 1 - i], siblings[i]);
        }
    }

    /// Recomputes the root from a leaf and a bottom-up proof using the exact
    /// fold of `Refuje.widthdrawDeriveKey` (bit i of `path` = fold step i,
    /// byte `i >> 3` bit `i & 7`; set bit = sibling hashed first).
    function fold(bytes32 leaf, bytes32 path, bytes32[] memory siblingsBottomUp)
        internal
        pure
        returns (bytes32 root)
    {
        require(siblingsBottomUp.length == DEPTH, "proof width");
        root = leaf;
        for (uint256 i = 0; i < DEPTH; i++) {
            bytes32 sibling = siblingsBottomUp[i];
            bool x = (uint8(path[i >> 3]) >> (i & 7)) & 1 != 0;
            if (x) {
                root = keccak256(abi.encodePacked(sibling, root));
            } else {
                root = keccak256(abi.encodePacked(root, sibling));
            }
        }
    }
}

library RefujeWire {
    /// Target record flag: pay ERC-20 via approve() instead of transfer().
    uint8 internal constant FLAG_APPROVE = 0x01;
    /// Target record flag: require the recipient to be the transaction sender.
    uint8 internal constant FLAG_REQUIRE_SENDER = 0x40;
    /// Target record flag: the record carries a call-blob hash and executes it.
    uint8 internal constant FLAG_CALL = 0x80;

    /// keccak256("pay" ‖ "" ‖ path): the ETH tree path of `Payment::pay`.
    function treePathEth(bytes32 path) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("pay", "", path));
    }

    /// keccak256("pay20" ‖ token ‖ path): the ERC-20 tree path.
    function treePathErc20(address token, bytes32 path) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("pay20", abi.encodePacked(token), path));
    }

    /// keccak256("pay" ‖ "" ‖ targets): the hash signed for ETH withdrawals.
    function targetsHashEth(bytes memory targets) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("pay", "", targets));
    }

    /// keccak256("pay20" ‖ token ‖ targets): the hash signed for ERC-20 withdrawals.
    function targetsHashErc20(address token, bytes memory targets) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("pay20", abi.encodePacked(token), targets));
    }

    /// Address target record: amount(32) ‖ address(20) ‖ zeros(11) ‖ flags(1).
    function pushAddress(bytes memory targets, uint256 amount, address target, uint8 flags)
        internal
        pure
        returns (bytes memory)
    {
        return bytes.concat(targets, bytes32(amount), abi.encodePacked(target, bytes11(0), bytes1(flags)));
    }

    /// Key target record: amount(32) ‖ key(32). The high 11 bytes of `key` must
    /// be nonzero or the contract decodes the record as an address target.
    function pushKey(bytes memory targets, uint256 amount, bytes32 key) internal pure returns (bytes memory) {
        return bytes.concat(targets, bytes32(amount), key);
    }

    /// Call blob as the contract decodes it: abi.encode(to, bytes1(0), data).
    function encodeCallBlob(address to, bytes memory data) internal pure returns (bytes memory) {
        return abi.encode(to, bytes1(uint8(0)), data);
    }

    /// Address target record with FLAG_CALL and the blob hash appended
    /// (amount ‖ address ‖ zeros ‖ flags|0x80 ‖ keccak256(blob)); returns the
    /// extended targets and the blob to push onto the `blobs` argument.
    function pushCall(bytes memory targets, uint256 amount, address target, uint8 flags, bytes memory blob)
        internal
        pure
        returns (bytes memory newTargets, bytes memory newBlob)
    {
        newTargets = bytes.concat(
            targets,
            bytes32(amount),
            abi.encodePacked(target, bytes11(0), bytes1(flags | FLAG_CALL)),
            keccak256(blob)
        );
        newBlob = blob;
    }

    /// Derives the public key of `priv` and inserts it at the ETH tree path for
    /// `path`, mirroring `payEth().pay(...)`. Returns the public key (to be
    /// registered with `registerPubKey`).
    function insertEthKey(RefujeTree storage tree, bytes32 priv, bytes32 path) internal returns (bytes32 pk) {
        pk = RefujeKeys.pubkeyOf(priv);
        RefujeTrees.insert(tree, treePathEth(path), pk);
    }

    /// Same as insertEthKey for an ERC-20 payment on `token`.
    function insertErc20Key(RefujeTree storage tree, address token, bytes32 priv, bytes32 path)
        internal
        returns (bytes32 pk)
    {
        pk = RefujeKeys.pubkeyOf(priv);
        RefujeTrees.insert(tree, treePathErc20(token, path), pk);
    }

    /// Full withdrawal proof: the 512 signature elements over `targetsHash`
    /// followed by the 256 bottom-up Merkle siblings for `treePath`
    /// (32 * 768 bytes), exactly as `PostPayment::finalize` builds it.
    function buildProof(bytes32 priv, bytes32 targetsHash, RefujeTree storage tree, bytes32 treePath)
        internal
        view
        returns (bytes memory)
    {
        bytes memory sig = RefujeKeys.sign(priv, targetsHash);
        bytes32[] memory siblings = RefujeTrees.prove(tree, treePath);
        return bytes.concat(sig, abi.encodePacked(siblings));
    }

    /// Convenience: full ETH withdrawal calldata pieces for one key/path.
    function ethProof(bytes32 priv, bytes32 path, RefujeTree storage tree, bytes memory targets)
        internal
        view
        returns (bytes memory)
    {
        return buildProof(priv, targetsHashEth(targets), tree, treePathEth(path));
    }

    /// Convenience: full ERC-20 withdrawal calldata pieces for one key/path.
    function erc20Proof(bytes32 priv, bytes32 path, RefujeTree storage tree, address token, bytes memory targets)
        internal
        view
        returns (bytes memory)
    {
        return buildProof(priv, targetsHashErc20(token, targets), tree, treePathErc20(token, path));
    }
}

using RefujeTrees for RefujeTree global;
