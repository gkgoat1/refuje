pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {RefujeKeys, RefujeTree, RefujeTrees, RefujeWire} from "../src/RefujeSigner.sol";

/// Unit tests for the Solidity signer library, including fixed vectors produced
/// by the reference TypeScript client (src/index.ts) so the implementations
/// cannot drift apart silently.
contract RefujeSignerTest is Test {
    using RefujeTrees for RefujeTree;

    RefujeTree internal tree;

    bytes32 internal constant PRIV1 = bytes32(0x0101010101010101010101010101010101010101010101010101010101010101);
    bytes32 internal constant PRIV2 = bytes32(0x0202020202020202020202020202020202020202020202020202020202020202);
    bytes32 internal constant PRIV3 = bytes32(0x0303030303030303030303030303030303030303030303030303030303030303);
    bytes32 internal constant HASH23 = bytes32(0x2323232323232323232323232323232323232323232323232323232323232323);

    // node --experimental-strip-types vectors from the TypeScript client.
    bytes32 internal constant PUB1 = 0x65e3e3425a0915890afd0b196c0d3743feadb935ef8af36d1b1f4eeb1daa5ac1;
    bytes32 internal constant PUB2 = 0x46adaa86b5765c26ccfb35564fc1d6481e43d58f96b7b9aa9e8ce8b6ad93b4cc;
    bytes32 internal constant PUB3_TS = 0x0; // placeholder to keep the vector block readable
    bytes32 internal constant SIG_FIRST = 0x8dda360b7284d575034c737bfd165d3e5a53491d6ce6703853c834eaeaa63485;
    bytes32 internal constant SIG_LAST = 0x27f49939b3f1b32778cbceb5f6cc51431961c7a6a36d78de2199b45086963dc2;
    bytes32 internal constant PATH1 = 0xf19e9daac363be26d19f11774d1c735e186cb73927086e67e67d9b24f2bb5efe;
    bytes32 internal constant PATH2 = 0xf5372830af5880588500143b36ce6bdbf592fa51e1eec879e2fdb0b76982657d;
    bytes32 internal constant PATH3 = 0x716564e3a0c8880ac7d98ac4a6c04b0cbe1790d851c9c10397ebc753f7892911;
    bytes32 internal constant TREE_ROOT3 = 0xd806beda631b3029eb15ea0fdcb20c7f2aa285ef4701232ce2ddb3bebd0d9923;
    bytes32 internal constant TREE_ROOT1 = 0x2b0b62f87566c0ea89b786308dd155effe9cd1b703523416908c1b7b25e0e94d;
    bytes32 internal constant PROOF2_255 = 0x160ad51935e69efd5ea533ef154f3eccbc8082934c093ef043a19467f6a089e6;

    function testPubkeyVectors() public pure {
        assertEq(RefujeKeys.pubkeyOf(PRIV1), PUB1, "pubkey(priv1) must match the TypeScript client");
        assertEq(RefujeKeys.pubkeyOf(PRIV2), PUB2, "pubkey(priv2) must match the TypeScript client");
    }

    function testSignVector() public {
        bytes memory sig = RefujeKeys.sign(PRIV1, HASH23);
        assertEq(sig.length, 32 * 512, "signature must hold 512 elements");
        assertEq(bytes32(sig), SIG_FIRST, "element 0 must match the TypeScript client");
        bytes32 last;
        assembly {
            last := mload(add(sig, add(32, mul(511, 32))))
        }
        assertEq(last, SIG_LAST, "element 511 must match the TypeScript client");
        assertEq(RefujeKeys.recover(sig, HASH23), PUB1, "recover(sign) must reproduce the public key");
    }

    function testElementAtEncoding() public pure {
        // keccak256(abi.encode(bytes32, uint32)) is the cross-client preimage.
        assertEq(RefujeKeys.elementAt(PRIV1, 0), keccak256(abi.encode(PRIV1, uint32(0))));
        assertEq(RefujeKeys.elementAt(PRIV1, 511), keccak256(abi.encode(PRIV1, uint32(511))));
    }

    function testTreeVectors() public {
        RefujeTree storage t = tree;
        t.insert(PATH1, PUB1);
        assertEq(t.root, TREE_ROOT1, "single-key tree root must match the TypeScript client");
        t.insert(PATH2, RefujeKeys.pubkeyOf(PRIV2));
        t.insert(PATH3, RefujeKeys.pubkeyOf(PRIV3));
        assertEq(t.root, TREE_ROOT3, "three-key tree root must match the TypeScript client");

        bytes32[] memory siblings = t.prove(PATH2);
        assertEq(siblings.length, 256);
        assertEq(siblings[0], bytes32(0), "leaf-level sibling of an isolated leaf is empty");
        assertEq(siblings[1], bytes32(0));
        assertEq(siblings[255], PROOF2_255, "top-level sibling must match the TypeScript client");
        assertEq(RefujeTrees.fold(RefujeKeys.pubkeyOf(PRIV2), PATH2, siblings), TREE_ROOT3, "contract-order fold must reproduce the root");
    }

    /// recover(sign(hash)) == pubkey(priv) for arbitrary keys and hashes.
    function testFuzzRecoverMatchesPubkey(bytes32 priv, bytes32 hash) public {
        bytes memory sig = RefujeKeys.sign(priv, hash);
        assertEq(RefujeKeys.recover(sig, hash), RefujeKeys.pubkeyOf(priv));
    }

    /// prove() output folds back to the tree root for arbitrary paths/keys.
    function testFuzzProveFoldsToRoot(bytes32[4] memory privs, bytes32[4] memory paths, uint8 leafIndex) public {
        RefujeTree storage t = tree;
        for (uint256 i = 0; i < 4; i++) {
            t.insert(paths[i], privs[i] | bytes32(uint256(1)));
        }
        uint256 li = leafIndex % 4;
        // When a path is inserted twice the last insert wins, so the expected
        // leaf comes from the last occurrence of paths[li].
        bytes32 expectedLeaf;
        for (uint256 i = 0; i < 4; i++) {
            if (paths[i] == paths[li]) expectedLeaf = privs[i] | bytes32(uint256(1));
        }
        bytes32[] memory siblings = t.prove(paths[li]);
        assertEq(RefujeTrees.fold(expectedLeaf, paths[li], siblings), t.root);
    }

    /// The wire preimages must match the contract's keccak256(abi.encodePacked(...)).
    function testWirePreimages() public pure {
        bytes32 path = bytes32(uint256(0x1234));
        address token = address(0x3333333333333333333333333333333333333333);
        assertEq(RefujeWire.treePathEth(path), keccak256(abi.encodePacked("pay", "", path)));
        assertEq(RefujeWire.treePathErc20(token, path), keccak256(abi.encodePacked("pay20", abi.encodePacked(token), path)));
        bytes memory targets = hex"0102";
        assertEq(RefujeWire.targetsHashEth(targets), keccak256(abi.encodePacked("pay", "", targets)));
        assertEq(RefujeWire.targetsHashErc20(token, targets), keccak256(abi.encodePacked("pay20", abi.encodePacked(token), targets)));
    }

    function _wordAt(bytes memory b, uint256 offset) internal pure returns (bytes32 w) {
        assembly {
            w := mload(add(add(b, 32), offset))
        }
    }

    /// Target record encodings must match the contract's parser layout.
    function testTargetEncoding() public pure {
        address target = address(0x2222222222222222222222222222222222222222);
        bytes memory t = RefujeWire.pushAddress(new bytes(0), 0x5678, target, 0xc1);
        assertEq(t.length, 64);
        assertEq(uint256(bytes32(t)), 0x5678, "amount occupies the first 32 bytes");
        assertEq(address(uint160(uint256(_wordAt(t, 32)) >> 96)), target, "address occupies bytes 32..52");
        assertEq(uint8(t[63]), 0xc1, "flags occupy byte 63");

        bytes32 key = bytes32(uint256(0xabcdef));
        t = RefujeWire.pushKey(new bytes(0), 0x1234, key);
        assertEq(t.length, 64);
        assertEq(uint256(bytes32(t)), 0x1234);
        assertEq(_wordAt(t, 32), key);

        bytes memory blob = RefujeWire.encodeCallBlob(target, hex"12345678");
        assertEq(blob, abi.encode(target, bytes1(0), hex"12345678"));
        (bytes memory t2, bytes memory pushed) = RefujeWire.pushCall(new bytes(0), 7, target, 0x01, blob);
        assertEq(t2.length, 96, "call records carry a 32-byte blob hash");
        assertEq(uint8(t2[63]), 0x81, "pushCall sets FLAG_CALL");
        assertEq(_wordAt(t2, 64), keccak256(blob), "blob hash is appended to the record");
        assertEq(keccak256(pushed), keccak256(blob));
    }

    /// buildProof must lay out signature ‖ bottom-up siblings contiguously.
    function testBuildProofLayout() public {
        RefujeTree storage t = tree;
        bytes32 path = bytes32(uint256(0xbeef));
        RefujeWire.insertEthKey(t, PRIV1, path);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 1, address(0x9999), 0);
        bytes memory proof = RefujeWire.ethProof(PRIV1, path, t, targets);
        assertEq(proof.length, 32 * 768);
        bytes32[] memory siblings = t.prove(RefujeWire.treePathEth(path));
        for (uint256 i = 0; i < 256; i++) {
            bytes32 got;
            assembly {
                got := mload(add(proof, add(32, mul(add(512, i), 32))))
            }
            assertEq(got, siblings[i]);
        }
    }
}
