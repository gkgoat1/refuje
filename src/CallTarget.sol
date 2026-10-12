pragma solidity ^0.8.37;

contract CallTarget {
    uint256 public value;

    receive() external payable {}
    address public lastCaller;

    function setValue(uint256 value_) external {
        value = value_;
        lastCaller = msg.sender;
    }
}
