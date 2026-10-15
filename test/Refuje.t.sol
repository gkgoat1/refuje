pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {Refuje, IERC20} from "../src/Refuje.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {CallTarget} from "../src/CallTarget.sol";
import {RefujeTree, RefujeTrees, RefujeWire} from "../src/RefujeSigner.sol";

/// Reentrancy probe: a call blob that tries to replay the enclosing withdrawal.
contract Reenterer {
    receive() external payable {}

    Refuje internal refuje;
    bytes32 internal path;
    bytes internal targets;
    bytes[] internal blobs;
    bytes internal proof;
    bool public attempted;
    bool public replaySucceeded;
    bytes public revertData;

    function setUp(Refuje refuje_, bytes32 path_, bytes memory targets_, bytes[] memory blobs_, bytes memory proof_)
        external
    {
        refuje = refuje_;
        path = path_;
        targets = targets_;
        blobs = blobs_;
        proof = proof_;
    }

    function attack() external {
        attempted = true;
        try refuje.widthdrawEth(path, targets, blobs, proof) {
            replaySucceeded = true;
        } catch (bytes memory data) {
            revertData = data;
        }
    }
}

/// End-to-end tests for Refuje driven entirely by the Solidity signer library.
contract RefujeTest is Test {
    using RefujeTrees for RefujeTree;

    Refuje internal refuje;
    MockERC20 internal token;
    CallTarget internal callTarget;
    RefujeTree[] internal trees;

    receive() external payable {}

    function setUp() public {
        refuje = new Refuje();
        token = new MockERC20();
        callTarget = new CallTarget();
        vm.deal(address(this), 1_000_000 ether);
    }

    function _newTree() internal returns (RefujeTree storage) {
        trees.push();
        return trees[trees.length - 1];
    }

    function _priv(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode("refuje-test-key", seed));
    }

    function _path(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode("refuje-test-path", seed));
    }

    /// Registers `priv` at the ETH tree path for `path` in a fresh tree and
    /// funds the tree root with `fund` wei.
    function _fundedEthKey(RefujeTree storage t, bytes32 priv, bytes32 path, uint256 fund) internal returns (bytes32 pk) {
        pk = RefujeWire.insertEthKey(t, priv, path);
        refuje.registerPubKey(pk);
        if (fund > 0) refuje.depositToKey{value: fund}(uint256(t.root));
    }

    function _fundedErc20Key(RefujeTree storage t, bytes32 priv, bytes32 path, uint256 fund) internal returns (bytes32 pk) {
        pk = RefujeWire.insertErc20Key(t, address(token), priv, path);
        refuje.registerPubKey(pk);
        if (fund > 0) {
            token.mint(address(this), fund);
            token.approve(address(refuje), fund);
            refuje.depositErc20(IERC20(address(token)), uint256(t.root), fund, address(this));
        }
    }

    function _noBlobs() internal pure returns (bytes[] memory) {
        return new bytes[](0);
    }

    function _assumePayableRecipient(address to) internal view {
        // Exclude the deployed contracts (no receive()) and this test contract
        // (it is also the relayer, so fee and payout would merge).
        vm.assume(to != address(refuje) && to != address(token) && to != address(callTarget) && to != address(this));
    }

    // --- happy paths -------------------------------------------------------

    function testWithdrawEthSingleTarget() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(1);
        _fundedEthKey(t, _priv(1), path, 1_000_000_000);

        address recipient = address(0xB0B);
        uint256 amount = 1_000_000_000;
        uint256 fee = amount >> 7;
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, recipient, 0);
        uint256 relayerBefore = address(this).balance;

        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(1), path, t, targets));

        assertEq(recipient.balance, amount - fee, "recipient receives amount minus fee");
        assertEq(address(this).balance, relayerBefore + fee, "relayer receives the fee");
        assertEq(address(refuje).balance, 0, "fully spent");
    }

    function testWithdrawEthExactBalanceBoundary() public {
        // deposit == amount must succeed; a `balance <= amount` mutation reverts here.
        RefujeTree storage t = _newTree();
        bytes32 path = _path(2);
        uint256 amount = 123_456_789;
        _fundedEthKey(t, _priv(2), path, amount);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, address(0xB0B), 0);
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(2), path, t, targets));
        assertEq(address(0xB0B).balance, amount - (amount >> 7));
        assertEq(address(refuje).balance, 0);
    }

    function testWithdrawEthFeeRoundingBoundary() public {
        // 127 wei -> fee 0; 128 wei -> fee 1. Both keys are inserted before
        // funding so both withdrawals charge the same final tree root.
        RefujeTree storage t = _newTree();
        bytes32 pk1 = RefujeWire.insertEthKey(t, _priv(3), _path(3));
        bytes32 pk2 = RefujeWire.insertEthKey(t, _priv(4), _path(4));
        refuje.registerPubKey(pk1);
        refuje.registerPubKey(pk2);
        refuje.depositToKey{value: 127 + 128}(uint256(t.root));

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 127, address(0xB0B), 0);
        refuje.widthdrawEth(_path(3), targets, _noBlobs(), RefujeWire.ethProof(_priv(3), _path(3), t, targets));
        assertEq(address(0xB0B).balance, 127, "127 wei pays no fee");

        targets = RefujeWire.pushAddress(new bytes(0), 128, address(0xB0B), 0);
        refuje.widthdrawEth(_path(4), targets, _noBlobs(), RefujeWire.ethProof(_priv(4), _path(4), t, targets));
        assertEq(address(0xB0B).balance, 127 + 127, "128 wei pays 1 wei of fee");
    }

    function testWithdrawEthMultipleTargets() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(5);
        uint256 a1 = 1_000_000;
        uint256 a2 = 2_000_000;
        uint256 a3 = 500_000;
        _fundedEthKey(t, _priv(5), path, a1 + a2 + a3);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), a1, address(0xB001), 0);
        targets = RefujeWire.pushAddress(targets, a2, address(0xB002), 0);
        targets = RefujeWire.pushAddress(targets, a3, address(0xB003), 0);
        uint256 relayerBefore = address(this).balance;

        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(5), path, t, targets));

        uint256 fees = (a1 >> 7) + (a2 >> 7) + (a3 >> 7);
        assertEq(address(0xB001).balance, a1 - (a1 >> 7));
        assertEq(address(0xB002).balance, a2 - (a2 >> 7));
        assertEq(address(0xB003).balance, a3 - (a3 >> 7));
        assertEq(address(this).balance, relayerBefore + fees, "one fee per target");
        assertEq(address(refuje).balance, 0);
    }

    /// Key targets move balance between trees; two key targets after an address
    /// target exercise the record-bounds scan fixed in BUGFIX.md.
    function testKeyTargetMovesBetweenTrees() public {
        RefujeTree storage src = _newTree();
        bytes32 srcPath = _path(6);
        _fundedEthKey(src, _priv(6), srcPath, 1_010_000);

        RefujeTree storage d1 = _newTree();
        bytes32 d1Path = _path(7);
        _fundedEthKey(d1, _priv(7), d1Path, 0);
        RefujeTree storage d2 = _newTree();
        bytes32 d2Path = _path(8);
        _fundedEthKey(d2, _priv(8), d2Path, 0);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 10_000, address(0xB0B), 0);
        targets = RefujeWire.pushKey(targets, 600_000, d1.root);
        targets = RefujeWire.pushKey(targets, 400_000, d2.root);
        refuje.widthdrawEth(srcPath, targets, _noBlobs(), RefujeWire.ethProof(_priv(6), srcPath, src, targets));

        // The destination roots now hold amount-minus-fee each; spend d1 fully.
        uint256 d1Balance = 600_000 - (600_000 >> 7);
        uint256 d2Balance = 400_000 - (400_000 >> 7);
        assertEq(address(refuje).balance, d1Balance + d2Balance, "contract keeps key-target funds");
        assertEq(address(0xB0B).balance, 10_000 - (10_000 >> 7));

        bytes memory spend = RefujeWire.pushAddress(new bytes(0), d1Balance, address(0xB0C), 0);
        refuje.widthdrawEth(d1Path, spend, _noBlobs(), RefujeWire.ethProof(_priv(7), d1Path, d1, spend));
        assertEq(address(0xB0C).balance, d1Balance - (d1Balance >> 7));

        bytes memory spend2 = RefujeWire.pushAddress(new bytes(0), d2Balance, address(0xB0D), 0);
        refuje.widthdrawEth(d2Path, spend2, _noBlobs(), RefujeWire.ethProof(_priv(8), d2Path, d2, spend2));
        assertEq(address(0xB0D).balance, d2Balance - (d2Balance >> 7));
    }

    function testSenderFlag() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(9);
        _fundedEthKey(t, _priv(9), path, 100_000);
        bytes memory targets =
            RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), RefujeWire.FLAG_REQUIRE_SENDER);
        bytes memory proof = RefujeWire.ethProof(_priv(9), path, t, targets);

        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("sender check"));
        refuje.widthdrawEth(path, targets, _noBlobs(), proof);

        // The flagged recipient itself may relay the withdrawal; as its own
        // relayer it also earns the fee back.
        vm.prank(address(0xB0B));
        refuje.widthdrawEth(path, targets, _noBlobs(), proof);
        assertEq(address(0xB0B).balance, 100_000);
    }

    function testCallBlobExecutes() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(10);
        _fundedEthKey(t, _priv(10), path, 0);
        bytes memory blob = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (42)));
        (bytes memory targets, bytes memory pushed) = RefujeWire.pushCall(new bytes(0), 0, address(callTarget), 0, blob);
        bytes[] memory blobs = new bytes[](1);
        blobs[0] = pushed;

        refuje.widthdrawEth(path, targets, blobs, RefujeWire.ethProof(_priv(10), path, t, targets));

        assertEq(callTarget.value(), 42);
        assertEq(callTarget.lastCaller(), address(refuje));
    }

    function testCallBlobExecutesTwoBlobs() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(11);
        _fundedEthKey(t, _priv(11), path, 0);
        bytes memory blob1 = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (1)));
        bytes memory blob2 = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (2)));
        (bytes memory targets, bytes memory p1) = RefujeWire.pushCall(new bytes(0), 0, address(callTarget), 0, blob1);
        (bytes memory targets2, bytes memory p2) = RefujeWire.pushCall(targets, 0, address(callTarget), 0, blob2);
        bytes[] memory blobs = new bytes[](2);
        blobs[0] = p1;
        blobs[1] = p2;

        refuje.widthdrawEth(path, targets2, blobs, RefujeWire.ethProof(_priv(11), path, t, targets2));
        assertEq(callTarget.value(), 2, "second blob ran last");
    }

    function testReentrantReplayIsBlocked() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(12);
        _fundedEthKey(t, _priv(12), path, 100_000);

        // First figure out the real withdrawal, then point the blob at a reenterer
        // that replays the same calldata mid-execution.
        Reenterer reenterer = new Reenterer();
        bytes memory blob = RefujeWire.encodeCallBlob(address(reenterer), abi.encodeCall(Reenterer.attack, ()));
        (bytes memory targets, bytes memory pushed) = RefujeWire.pushCall(new bytes(0), 0, address(reenterer), 0, blob);
        bytes[] memory blobs = new bytes[](1);
        blobs[0] = pushed;
        bytes memory proof = RefujeWire.ethProof(_priv(12), path, t, targets);
        reenterer.setUp(refuje, path, targets, blobs, proof);

        refuje.widthdrawEth(path, targets, blobs, proof);

        assertTrue(reenterer.attempted());
        assertFalse(reenterer.replaySucceeded(), "replay must not succeed");
        assertEq(keccak256(reenterer.revertData()), keccak256(abi.encodeWithSignature("Error(string)", "nullified")));
    }

    // --- ERC-20 --------------------------------------------------------------

    function testErc20TransferAndApproveModes() public {
        RefujeTree storage t = _newTree();
        bytes32 pathT = _path(13);
        bytes32 pathA = _path(14);
        // Both keys are inserted before funding so both withdrawals charge the
        // same final tree root.
        bytes32 pkT = RefujeWire.insertErc20Key(t, address(token), _priv(13), pathT);
        bytes32 pkA = RefujeWire.insertErc20Key(t, address(token), _priv(14), pathA);
        refuje.registerPubKey(pkT);
        refuje.registerPubKey(pkA);
        token.mint(address(this), 3_000_000_000);
        token.approve(address(refuje), 3_000_000_000);
        refuje.depositErc20(IERC20(address(token)), uint256(t.root), 3_000_000_000, address(this));

        address transferTo = address(0xB0E);
        address approveTo = address(0xB0F);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 1_000_000_000, transferTo, 0);
        uint256 relayerBefore = token.balanceOf(address(this));
        refuje.widthdrawErc20(
            IERC20(address(token)), pathT, targets, _noBlobs(), RefujeWire.erc20Proof(_priv(13), pathT, t, address(token), targets)
        );
        assertEq(token.balanceOf(transferTo), 1_000_000_000 - (1_000_000_000 >> 7));
        assertEq(token.balanceOf(address(this)), relayerBefore + (1_000_000_000 >> 7), "relayer fee in tokens");

        targets = RefujeWire.pushAddress(new bytes(0), 2_000_000_000, approveTo, RefujeWire.FLAG_APPROVE);
        refuje.widthdrawErc20(
            IERC20(address(token)), pathA, targets, _noBlobs(), RefujeWire.erc20Proof(_priv(14), pathA, t, address(token), targets)
        );
        uint256 approved = 2_000_000_000 - (2_000_000_000 >> 7);
        assertEq(token.balanceOf(approveTo), 0, "approve mode moves nothing yet");
        assertEq(token.allowance(address(refuje), approveTo), approved);
        assertEq(token.balanceOf(address(refuje)), approved, "approved funds stay in the contract");

        vm.prank(approveTo);
        token.transferFrom(address(refuje), approveTo, approved);
        assertEq(token.balanceOf(approveTo), approved);
        assertEq(token.balanceOf(address(refuje)), 0);
    }

    function testErc20DepositPullsFromSrc() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(15);
        bytes32 pk = RefujeWire.insertErc20Key(t, address(token), _priv(15), path);
        refuje.registerPubKey(pk);
        address whale = address(0xCAFE);
        token.mint(whale, 500);
        vm.prank(whale);
        token.approve(address(refuje), 500);
        refuje.depositErc20(IERC20(address(token)), uint256(t.root), 500, whale);
        assertEq(token.balanceOf(address(refuje)), 500);
        assertEq(token.balanceOf(whale), 0);
    }

    // --- negative paths ------------------------------------------------------

    function testReplayReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(16);
        _fundedEthKey(t, _priv(16), path, 200_000);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        bytes memory proof = RefujeWire.ethProof(_priv(16), path, t, targets);
        refuje.widthdrawEth(path, targets, _noBlobs(), proof);
        vm.expectRevert(bytes("nullified"));
        refuje.widthdrawEth(path, targets, _noBlobs(), proof);
    }

    function testUnregisteredKeyReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(17);
        RefujeWire.insertEthKey(t, _priv(17), path); // never registered
        refuje.depositToKey{value: 100_000}(uint256(t.root));
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        vm.expectRevert(bytes("not registered"));
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(17), path, t, targets));
    }

    function testWrongSignerReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(18);
        _fundedEthKey(t, _priv(18), path, 100_000);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        // Proof produced by a different key recovers a different public key.
        bytes memory badProof = RefujeWire.ethProof(_priv(999), path, t, targets);
        vm.expectRevert(bytes("not registered"));
        refuje.widthdrawEth(path, targets, _noBlobs(), badProof);
    }

    function testTamperedTargetsRevert() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(19);
        _fundedEthKey(t, _priv(19), path, 100_000);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        bytes memory proof = RefujeWire.ethProof(_priv(19), path, t, targets);
        // Sign `targets`, then submit a different targets payload.
        bytes memory tampered = RefujeWire.pushAddress(new bytes(0), 100_001, address(0xB0B), 0);
        vm.expectRevert(bytes("not registered"));
        refuje.widthdrawEth(path, tampered, _noBlobs(), proof);
    }

    function testUnderfundedWithdrawalReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(20);
        _fundedEthKey(t, _priv(20), path, 50_000);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        uint256 fee = 100_000 >> 7;
        uint256 shortfall = 100_000 - 50_000; // fee charge (781) passes; second charge fails
        vm.expectRevert(abi.encodeWithSelector(Refuje.NeedBalance.selector, shortfall));
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(20), path, t, targets));
        assertGt(fee, 0);
    }

    function testTruncatedTargetsRevert() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(21);
        _fundedEthKey(t, _priv(21), path, 100_000);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(0xB0B), 0);
        bytes memory truncated = new bytes(32);
        for (uint256 i = 0; i < 32; i++) truncated[i] = targets[i];
        // The signature commits to the truncated payload, so the failure must
        // come from the target-record parser, not the signature check.
        vm.expectRevert();
        refuje.widthdrawEth(path, truncated, _noBlobs(), RefujeWire.ethProof(_priv(21), path, t, truncated));
    }

    function testWrongBlobHashReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(22);
        _fundedEthKey(t, _priv(22), path, 0);
        bytes memory blob = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (42)));
        (bytes memory targets, ) = RefujeWire.pushCall(new bytes(0), 0, address(callTarget), 0, blob);
        bytes[] memory blobs = new bytes[](1);
        blobs[0] = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (43))); // wrong
        vm.expectRevert(bytes("blob check"));
        refuje.widthdrawEth(path, targets, blobs, RefujeWire.ethProof(_priv(22), path, t, targets));
    }

    function testBlobCallFailureReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(23);
        _fundedEthKey(t, _priv(23), path, 0);
        bytes memory blob = RefujeWire.encodeCallBlob(address(callTarget), hex"deadbeef"); // no such function
        (bytes memory targets, bytes memory pushed) = RefujeWire.pushCall(new bytes(0), 0, address(callTarget), 0, blob);
        bytes[] memory blobs = new bytes[](1);
        blobs[0] = pushed;
        vm.expectRevert(bytes("worked"));
        refuje.widthdrawEth(path, targets, blobs, RefujeWire.ethProof(_priv(23), path, t, targets));
    }

    function testEthPayoutToNonpayableReverts() public {
        RefujeTree storage t = _newTree();
        bytes32 path = _path(24);
        _fundedEthKey(t, _priv(24), path, 100_000);
        // Refuje itself has no receive/fallback, so the payout call fails.
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), 100_000, address(refuje), 0);
        vm.expectRevert(bytes("payout"));
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(_priv(24), path, t, targets));
    }

    // --- fuzz -----------------------------------------------------------------

    function testFuzzWithdrawEth(bytes32 priv, bytes32 path, uint96 amount, uint160 to) public {
        vm.assume(to > 0x1000);
        address recipient = address(uint160(uint256(keccak256(abi.encode(to, "eth-recipient")))));
        _assumePayableRecipient(recipient);
        vm.deal(address(this), address(this).balance + uint256(amount));
        RefujeTree storage t = _newTree();
        _fundedEthKey(t, priv, path, amount);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, recipient, 0);
        uint256 relayerBefore = address(this).balance;
        uint256 recipientBefore = recipient.balance;
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(priv, path, t, targets));

        uint256 fee = uint256(amount) >> 7;
        assertEq(recipient.balance, recipientBefore + uint256(amount) - fee);
        assertEq(address(this).balance, relayerBefore + fee);
        assertEq(address(refuje).balance, 0);
    }

    function testFuzzWithdrawEthMultiTarget(bytes32 priv, bytes32 path, uint64 a1, uint64 a2, uint64 a3, uint160 to1)
        public
    {
        vm.assume(to1 > 0x1000);
        address r1 = address(uint160(uint256(keccak256(abi.encode(to1, "eth-multi-recipient")))));
        _assumePayableRecipient(r1);
        RefujeTree storage t = _newTree();
        uint256 total = uint256(a1) + a2 + a3;
        _fundedEthKey(t, priv, path, total);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), a1, r1, 0);
        targets = RefujeWire.pushAddress(targets, a2, address(0xB002), 0);
        targets = RefujeWire.pushAddress(targets, a3, address(0xB003), 0);
        uint256 r1Before = r1.balance;
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(priv, path, t, targets));

        uint256 fees = (uint256(a1) >> 7) + (uint256(a2) >> 7) + (uint256(a3) >> 7);
        assertEq(address(refuje).balance, total - fees - (uint256(a1) - (a1 >> 7)) - (uint256(a2) - (a2 >> 7)) - (uint256(a3) - (a3 >> 7)));
        assertEq(address(refuje).balance, 0, "charges exactly equal payouts");
        assertEq(r1.balance, r1Before + uint256(a1) - (a1 >> 7));
    }

    function testFuzzUnderfundedEth(bytes32 priv, bytes32 path, uint96 deposit, uint96 amount) public {
        uint256 amt = uint256(amount);
        uint256 dep = uint256(deposit);
        vm.assume(amt > dep);
        vm.deal(address(this), address(this).balance + dep);
        RefujeTree storage t = _newTree();
        _fundedEthKey(t, priv, path, dep);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amt, address(0xB0B), 0);
        uint256 fee = amt >> 7;
        // The fee is charged first, so the reported shortfall depends on which
        // charge runs out of balance first.
        uint256 shortfall = dep < fee ? fee - dep : amt - dep;
        vm.expectRevert(abi.encodeWithSelector(Refuje.NeedBalance.selector, shortfall));
        refuje.widthdrawEth(path, targets, _noBlobs(), RefujeWire.ethProof(priv, path, t, targets));
    }

    function testFuzzErc20Transfer(bytes32 priv, bytes32 path, uint96 amount, uint160 to) public {
        vm.assume(to > 0x1000);
        address recipient = address(to);
        vm.assume(recipient != address(refuje) && recipient != address(token) && recipient != address(this));
        RefujeTree storage t = _newTree();
        _fundedErc20Key(t, priv, path, amount);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, recipient, 0);
        uint256 relayerBefore = token.balanceOf(address(this));
        refuje.widthdrawErc20(
            IERC20(address(token)), path, targets, _noBlobs(), RefujeWire.erc20Proof(priv, path, t, address(token), targets)
        );

        uint256 fee = uint256(amount) >> 7;
        assertEq(token.balanceOf(recipient), uint256(amount) - fee);
        assertEq(token.balanceOf(address(this)), relayerBefore + fee);
        assertEq(token.balanceOf(address(refuje)), 0);
    }

    function testFuzzErc20Approve(bytes32 priv, bytes32 path, uint96 amount, uint160 to) public {
        vm.assume(to > 0x1000);
        address recipient = address(to);
        vm.assume(recipient != address(refuje) && recipient != address(token) && recipient != address(this));
        RefujeTree storage t = _newTree();
        _fundedErc20Key(t, priv, path, amount);

        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, recipient, RefujeWire.FLAG_APPROVE);
        refuje.widthdrawErc20(
            IERC20(address(token)), path, targets, _noBlobs(), RefujeWire.erc20Proof(priv, path, t, address(token), targets)
        );

        uint256 fee = uint256(amount) >> 7;
        assertEq(token.allowance(address(refuje), recipient), uint256(amount) - fee);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(refuje)), uint256(amount) - fee, "approved funds stay deposited");
    }

    function testFuzzBlobCallValue(bytes32 priv, bytes32 path, uint256 value) public {
        RefujeTree storage t = _newTree();
        _fundedEthKey(t, priv, path, 0);
        bytes memory blob = RefujeWire.encodeCallBlob(address(callTarget), abi.encodeCall(CallTarget.setValue, (value)));
        (bytes memory targets, bytes memory pushed) = RefujeWire.pushCall(new bytes(0), 0, address(callTarget), 0, blob);
        bytes[] memory blobs = new bytes[](1);
        blobs[0] = pushed;
        refuje.widthdrawEth(path, targets, blobs, RefujeWire.ethProof(priv, path, t, targets));
        assertEq(callTarget.value(), value);
        assertEq(callTarget.lastCaller(), address(refuje));
    }
}
