pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {Refuje, IERC20} from "../src/Refuje.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {RefujeKeys, RefujeTree, RefujeTrees, RefujeWire} from "../src/RefujeSigner.sol";

/// Drives randomized sequences of registrations, deposits, withdrawals
/// (address/key targets, transfer/approve modes), allowance draws, and replay
/// attempts against Refuje, tracking ghost balances so the invariant contract
/// can assert exact solvency after every sequence.
contract RefujeHandler is Test {
    uint256 internal constant MAX_SLOTS = 24;
    uint256 public constant GRANTEES = 4;

    Refuje public refuje;
    MockERC20 public token;

    RefujeTree[] internal trees;
    mapping(uint256 => uint256) internal slotEth;
    mapping(uint256 => uint256) internal slotErc;
    mapping(uint256 => uint256) internal usedMask;
    uint256 public slotCount;

    // Ghost accounting: ETH/ERC-20 that ever entered vs. ever left Refuje.
    uint256 public ethIn;
    uint256 public ethOut;
    uint256 public ercIn;
    uint256 public ercOut;

    // Approve-mode grants: what the handler believes each grantee can still draw.
    mapping(address => uint256) public granted;
    address[] public grantees;
    uint256 public totalOutstanding;

    // Replay probing.
    uint256 public replayEscapes;
    bool internal haveLast;
    bytes32 internal lastPath;
    bytes internal lastTargets;
    bytes internal lastProof;

    receive() external payable {}

    constructor(Refuje refuje_, MockERC20 token_) {
        refuje = refuje_;
        token = token_;
    }

    function _priv(uint256 slot, uint256 which) internal pure returns (bytes32) {
        return keccak256(abi.encode("refuje-invariant-priv", slot, which));
    }

    function _path(uint256 slot, uint256 which) internal pure returns (bytes32) {
        return keccak256(abi.encode("refuje-invariant-path", slot, which));
    }

    function _freshAddress(uint256 entropy) internal returns (address) {
        return address(uint160(uint256(keccak256(abi.encode("refuje-invariant-addr", entropy, slotCount, block.number)))));
    }

    function grantee(uint256 i) public pure returns (address) {
        return address(uint160(0xA1100000 + i));
    }

    /// Opens a new balance slot: a fresh tree with two pre-inserted keys (so it
    /// supports two withdrawals), funded with the fuzzed amounts.
    function openSlot(uint96 ethAmt, uint96 ercAmt) public {
        if (slotCount >= MAX_SLOTS) return;
        uint256 i = slotCount++;
        trees.push();
        RefujeTree storage t = trees[i];
        for (uint256 k = 0; k < 2; k++) {
            // Each key is inserted at both its ETH and ERC-20 tree paths so
            // either asset can be withdrawn against the same tree root.
            bytes32 pk = RefujeKeys.pubkeyOf(_priv(i, k));
            refuje.registerPubKey(pk);
            t.insert(RefujeWire.treePathEth(_path(i, k)), pk);
            t.insert(RefujeWire.treePathErc20(address(token), _path(i, k)), pk);
        }
        uint256 rootKey = uint256(t.root);
        if (ethAmt > 0) {
            vm.deal(address(this), address(this).balance + ethAmt);
            refuje.depositToKey{value: ethAmt}(rootKey);
            slotEth[i] += ethAmt;
            ethIn += ethAmt;
        }
        if (ercAmt > 0) {
            token.mint(address(this), ercAmt);
            token.approve(address(refuje), ercAmt);
            refuje.depositErc20(IERC20(address(token)), rootKey, ercAmt, address(this));
            slotErc[i] += ercAmt;
            ercIn += ercAmt;
        }
    }

    /// Withdraws ETH from a slot, splitting between an address target and
    /// either a second address or a key target naming another slot's root.
    function spendEth(uint8 slotSeed, bool second, uint96 a1, uint96 a2, bool useKeyTarget, uint8 destSeed) public {
        if (slotCount == 0) return;
        uint256 slot = slotSeed % slotCount;
        uint256 which = second ? 1 : 0;
        if (usedMask[slot] & (1 << which) != 0) return;
        uint256 avail = slotEth[slot];
        uint256 amount1 = _bound(a1, 0, avail);
        uint256 amount2 = _bound(a2, 0, avail - amount1);

        RefujeTree storage t = trees[slot];
        bytes32 path = _path(slot, which);
        bytes memory targets = RefujeWire.pushAddress(new bytes(0), amount1, _freshAddress(amount1), 0);
        uint256 destSlot = slot;
        if (useKeyTarget) {
            destSlot = destSeed % slotCount;
            targets = RefujeWire.pushKey(targets, amount2, trees[destSlot].root);
        } else {
            targets = RefujeWire.pushAddress(targets, amount2, _freshAddress(amount2), 0);
        }

        bytes memory proof = RefujeWire.ethProof(_priv(slot, which), path, t, targets);
        refuje.widthdrawEth(path, targets, new bytes[](0), proof);

        usedMask[slot] |= 1 << which;
        slotEth[slot] -= amount1 + amount2;
        // ETH leaving the contract: address targets leave fully; key targets
        // only leak the fee (the rest is credited to the destination slot).
        ethOut += amount1;
        if (useKeyTarget) {
            ethOut += amount2 >> 7;
            slotEth[destSlot] += amount2 - (amount2 >> 7);
        } else {
            ethOut += amount2;
        }

        haveLast = true;
        lastPath = path;
        lastTargets = targets;
        lastProof = proof;
    }

    /// Withdraws ERC-20 from a slot in transfer or approve mode. Approve-mode
    /// grants go to a small fixed grantee pool so overwrites actually happen.
    function spendErc20(uint8 slotSeed, bool second, uint96 amountSeed, bool approveMode, uint8 granteeSeed) public {
        if (slotCount == 0) return;
        uint256 slot = slotSeed % slotCount;
        uint256 which = second ? 1 : 0;
        if (usedMask[slot] & (1 << which) != 0) return;
        uint256 amount = _bound(amountSeed, 0, slotErc[slot]);

        RefujeTree storage t = trees[slot];
        bytes32 path = _path(slot, which);
        address g = grantee(granteeSeed % GRANTEES);
        address target = approveMode ? g : _freshAddress(amount);
        bytes memory targets =
            RefujeWire.pushAddress(new bytes(0), amount, target, approveMode ? RefujeWire.FLAG_APPROVE : 0);

        bytes memory proof = RefujeWire.erc20Proof(_priv(slot, which), path, t, address(token), targets);
        refuje.widthdrawErc20(IERC20(address(token)), path, targets, new bytes[](0), proof);

        usedMask[slot] |= 1 << which;
        slotErc[slot] -= amount;
        uint256 fee = amount >> 7;
        if (approveMode) {
            // Fee is transferred; the rest is granted as an allowance.
            ercOut += fee;
            uint256 grant = amount - fee;
            uint256 old = granted[g];
            if (old == 0 && grant > 0) grantees.push(g);
            totalOutstanding = totalOutstanding - old + grant;
            granted[g] = grant;
        } else {
            ercOut += amount;
        }
    }

    /// A grantee draws its full outstanding allowance.
    function drawAllowance(uint8 granteeSeed) public {
        address g = grantee(granteeSeed % GRANTEES);
        uint256 a = granted[g];
        if (a == 0) return;
        vm.prank(g);
        token.transferFrom(address(refuje), g, a);
        granted[g] = 0;
        totalOutstanding -= a;
        ercOut += a;
    }

    /// Replays the last successful ETH withdrawal; must always revert.
    function replayLastEth() public {
        if (!haveLast) return;
        try refuje.widthdrawEth(lastPath, lastTargets, new bytes[](0), lastProof) {
            replayEscapes++;
        } catch {}
    }

    /// Deposits ETH/ERC-20 to an arbitrary unregistered key (dust that no
    /// withdrawal can ever reference) to shake out solvency assumptions.
    function dustDeposit(uint256 keySeed, uint96 ethAmt, uint96 ercAmt) public {
        uint256 k = uint256(keccak256(abi.encode("refuje-invariant-dust", keySeed)));
        if (ethAmt > 0) {
            vm.deal(address(this), address(this).balance + ethAmt);
            refuje.depositToKey{value: ethAmt}(k);
            ethIn += ethAmt;
        }
        if (ercAmt > 0) {
            token.mint(address(this), ercAmt);
            token.approve(address(refuje), ercAmt);
            refuje.depositErc20(IERC20(address(token)), k, ercAmt, address(this));
            ercIn += ercAmt;
        }
    }

    /// Registers an arbitrary public key (no deposit, no known signer).
    function registerNoise(bytes32 key) public {
        refuje.registerPubKey(key);
    }
}

contract RefujeInvariantTest is Test {
    Refuje internal refuje;
    MockERC20 internal token;
    RefujeHandler internal handler;

    function setUp() public {
        refuje = new Refuje();
        token = new MockERC20();
        handler = new RefujeHandler(refuje, token);
        targetContract(address(handler));
    }

    /// Refuje holds exactly the ETH that entered and never left.
    function invariant_ethSolvency() public view {
        assertEq(address(refuje).balance, handler.ethIn() - handler.ethOut());
    }

    /// Same for the ERC-20 token.
    function invariant_erc20Solvency() public view {
        assertEq(token.balanceOf(address(refuje)), handler.ercIn() - handler.ercOut());
    }

    /// The contract's live allowances match the handler's tracking exactly,
    /// including across approve() overwrites.
    function invariant_allowanceTracking() public view {
        uint256 total;
        for (uint256 i = 0; i < handler.GRANTEES(); i++) {
            address g = handler.grantee(i);
            assertEq(token.allowance(address(refuje), g), handler.granted(g));
            total += handler.granted(g);
        }
        assertEq(total, handler.totalOutstanding());
    }

    /// No withdrawal ever replays.
    function invariant_replayNeverEscapes() public view {
        assertEq(handler.replayEscapes(), 0);
    }
}
