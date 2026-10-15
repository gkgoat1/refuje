pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {Refuje, IERC20} from "../src/Refuje.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {RefujeTree, RefujeTrees, RefujeWire} from "../src/RefujeSigner.sol";

/// Exposes the accounting core (`widthdrawSettle`) without the one-time
/// signature/Merkle path, so symbolic execution only has to reason about value
/// flows instead of 512 hash-selected branches. The signature path is covered
/// end-to-end by the fuzz suite; the two halves meet at `key` = tree root.
contract RefujeSymbolicHarness is Refuje {
    function settleEth(bytes32 key, bytes calldata targets, bytes[] calldata blobs) external {
        widthdrawSettle(key, targets, blobs, "", ethBalances, ethPayout);
    }

    function settleErc20(IERC20 token, bytes32 key, bytes calldata targets, bytes[] calldata blobs) external {
        widthdrawSettle(key, targets, blobs, abi.encodePacked(address(token)), ercBalances, ercPayout);
    }

    function setEthBalance(bytes32 key, uint256 amount) external {
        keyBalances[uint256(key)] = amount;
    }

    function setErc20Balance(IERC20 token, bytes32 key, uint256 amount) external {
        keyErc20Balances[address(token)][uint256(key)] = amount;
    }

    function ethBalanceOf(bytes32 key) external view returns (uint256) {
        return keyBalances[uint256(key)];
    }

    function erc20BalanceOf(IERC20 token, bytes32 key) external view returns (uint256) {
        return keyErc20Balances[address(token)][uint256(key)];
    }
}

/// Symbolic (halmos `--function testSymbolic`) tests over withdrawal accounting. Every function
/// is also a valid Forge fuzz test, so the same properties run with concrete
/// random inputs under `forge test` and fully symbolic inputs under:
///
///     uvx --from halmos halmos --function testSymbolic --contract RefujeSymbolicTest
contract RefujeSymbolicTest is Test {
    RefujeSymbolicHarness internal harness;
    MockERC20 internal token;

    address internal constant R1 = address(0xB01);
    address internal constant R2 = address(0xB02);
    bytes32 internal constant KEY = bytes32(uint256(0x0B0A));

    receive() external payable {}

    function setUp() public {
        harness = new RefujeSymbolicHarness();
        token = new MockERC20();
    }

    function _noBlobs() internal pure returns (bytes[] memory) {
        return new bytes[](0);
    }

    /// An exactly-funded single-target withdrawal drains the key, pays the
    /// recipient amount-minus-fee and the relayer the fee: nothing is created
    /// or left behind for ANY amount.
    function testSymbolicSettleEthSingleTargetExact(uint256 amount) public {
        vm.assume(amount <= type(uint128).max);
        vm.deal(address(harness), amount);
        harness.setEthBalance(KEY, amount);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, 0);

        uint256 relayerBefore = address(this).balance;
        harness.settleEth(KEY, targets, _noBlobs());

        uint256 fee = amount >> 7;
        assert(harness.ethBalanceOf(KEY) == 0);
        assert(R1.balance == amount - fee);
        assert(address(this).balance == relayerBefore + fee);
        assert(address(harness).balance == 0);
    }

    /// Two targets charging one key conserve value exactly.
    function testSymbolicSettleEthConservation(uint256 a, uint256 b) public {
        vm.assume(a <= type(uint128).max && b <= type(uint128).max);
        vm.deal(address(harness), a + b);
        harness.setEthBalance(KEY, a + b);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), a, R1, 0);
        targets = RefujeWire.pushAddress(targets, b, R2, 0);

        harness.settleEth(KEY, targets, _noBlobs());

        assert(harness.ethBalanceOf(KEY) == 0);
        assert(R1.balance == a - (a >> 7));
        assert(R2.balance == b - (b >> 7));
        assert(address(harness).balance == 0);
    }

    /// A partial withdrawal leaves the remainder on the key.
    function testSymbolicSettleEthPartial(uint256 amount, uint256 extra) public {
        vm.assume(amount <= type(uint128).max && extra <= type(uint128).max);
        vm.deal(address(harness), amount + extra);
        harness.setEthBalance(KEY, amount + extra);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, 0);

        harness.settleEth(KEY, targets, _noBlobs());

        assert(harness.ethBalanceOf(KEY) == extra);
        assert(address(harness).balance == extra);
    }

    /// Any withdrawal above the key balance reverts with the exact NeedBalance
    /// shortfall (the fee charge runs first, so it can be the failing one).
    function testSymbolicSettleEthUnderfunded(uint256 balance, uint256 amount) public {
        vm.assume(balance <= type(uint128).max && amount <= type(uint128).max);
        vm.assume(balance < amount);
        vm.deal(address(harness), balance);
        harness.setEthBalance(KEY, balance);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, 0);

        uint256 fee = amount >> 7;
        uint256 shortfall = balance < fee ? fee - balance : amount - balance;
        (bool ok, bytes memory err) =
            address(harness).call(abi.encodeCall(RefujeSymbolicHarness.settleEth, (KEY, targets, _noBlobs())));
        assert(!ok);
        assert(keccak256(err) == keccak256(abi.encodeWithSelector(Refuje.NeedBalance.selector, shortfall)));
        assert(harness.ethBalanceOf(KEY) == balance);
        assert(address(harness).balance == balance);
    }

    /// Key targets move value between keys: the destination is credited exactly
    /// amount-minus-fee and the source is drained.
    function testSymbolicSettleEthKeyTarget(uint256 amount) public {
        vm.assume(amount <= type(uint128).max);
        vm.deal(address(harness), amount);
        harness.setEthBalance(KEY, amount);
        // Key targets need a nonzero byte in the high 11 bytes, otherwise the
        // contract (by design) decodes the record as an address target.
        bytes32 dest = bytes32(type(uint256).max);
        bytes memory targets = RefujeWire.pushKey(new bytes(0), amount, dest);

        uint256 relayerBefore = address(this).balance;
        harness.settleEth(KEY, targets, _noBlobs());

        uint256 fee = amount >> 7;
        assert(harness.ethBalanceOf(KEY) == 0);
        assert(harness.ethBalanceOf(dest) == amount - fee);
        assert(address(this).balance == relayerBefore + fee);
    }

    /// The sender-check flag rejects any caller other than the target.
    function testSymbolicSettleEthSenderFlag(uint256 amount) public {
        vm.assume(amount <= type(uint128).max);
        vm.deal(address(harness), amount);
        harness.setEthBalance(KEY, amount);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, RefujeWire.FLAG_REQUIRE_SENDER);

        // msg.sender here is this test contract, which is not R1.
        (bool ok, bytes memory err) =
            address(harness).call(abi.encodeCall(RefujeSymbolicHarness.settleEth, (KEY, targets, _noBlobs())));
        assert(!ok);
        assert(keccak256(err) == keccak256(abi.encodeWithSignature("Error(string)", "sender check")));
        assert(harness.ethBalanceOf(KEY) == amount);
    }

    /// ERC-20 transfer mode: recipient gets amount-minus-fee, relayer the fee,
    /// contract is drained.
    function testSymbolicSettleErc20TransferExact(uint256 amount) public {
        vm.assume(amount <= type(uint128).max);
        token.mint(address(harness), amount);
        harness.setErc20Balance(IERC20(address(token)), KEY, amount);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, 0);

        uint256 relayerBefore = token.balanceOf(address(this));
        harness.settleErc20(IERC20(address(token)), KEY, targets, _noBlobs());

        uint256 fee = amount >> 7;
        assert(harness.erc20BalanceOf(IERC20(address(token)), KEY) == 0);
        assert(token.balanceOf(R1) == amount - fee);
        assert(token.balanceOf(address(this)) == relayerBefore + fee);
        assert(token.balanceOf(address(harness)) == 0);
    }

    /// ERC-20 approve mode: the recipient is granted (not paid) amount-minus-fee
    /// and the granted funds stay in the contract.
    function testSymbolicSettleErc20ApproveExact(uint256 amount) public {
        vm.assume(amount <= type(uint128).max);
        token.mint(address(harness), amount);
        harness.setErc20Balance(IERC20(address(token)), KEY, amount);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, RefujeWire.FLAG_APPROVE);

        harness.settleErc20(IERC20(address(token)), KEY, targets, _noBlobs());

        uint256 fee = amount >> 7;
        assert(harness.erc20BalanceOf(IERC20(address(token)), KEY) == 0);
        assert(token.allowance(address(harness), R1) == amount - fee);
        assert(token.balanceOf(R1) == 0);
        assert(token.balanceOf(address(harness)) == amount - fee);
    }

    /// ERC-20 underfunding reverts with the exact shortfall and moves nothing.
    function testSymbolicSettleErc20Underfunded(uint256 balance, uint256 amount) public {
        vm.assume(balance <= type(uint128).max && amount <= type(uint128).max);
        vm.assume(balance < amount);
        token.mint(address(harness), balance);
        harness.setErc20Balance(IERC20(address(token)), KEY, balance);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount, R1, 0);

        uint256 fee = amount >> 7;
        uint256 shortfall = balance < fee ? fee - balance : amount - balance;
        (bool ok, bytes memory err) = address(harness).call(
            abi.encodeCall(RefujeSymbolicHarness.settleErc20, (IERC20(address(token)), KEY, targets, _noBlobs()))
        );
        assert(!ok);
        assert(keccak256(err) == keccak256(abi.encodeWithSelector(Refuje.NeedBalance.selector, shortfall)));
        assert(harness.erc20BalanceOf(IERC20(address(token)), KEY) == balance);
    }
}
