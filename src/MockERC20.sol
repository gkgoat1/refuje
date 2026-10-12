pragma solidity ^0.8.37;

contract MockERC20 {
    string public constant name = "Mock Token";
    string public constant symbol = "MOCK";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 value) external {
        balanceOf[account] += value;
        totalSupply += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address recipient, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "balance");
        balanceOf[msg.sender] -= value;
        balanceOf[recipient] += value;
        return true;
    }

    function transferFrom(
        address owner,
        address recipient,
        uint256 value
    ) external returns (bool) {
        require(balanceOf[owner] >= value, "balance");
        uint256 allowed = allowance[owner][msg.sender];
        require(allowed >= value, "allowance");
        allowance[owner][msg.sender] = allowed - value;
        balanceOf[owner] -= value;
        balanceOf[recipient] += value;
        return true;
    }
}
