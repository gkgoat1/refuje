pragma solidity ^0.8.37;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Refuje} from "../src/Refuje.sol";

contract DeployScript is Script {
    function run() external returns (Refuje refuje) {
        vm.startBroadcast();
        refuje = new Refuje();
        vm.stopBroadcast();

        console2.log("Refuje deployed at", address(refuje));
    }
}
