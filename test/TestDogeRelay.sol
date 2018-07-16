pragma solidity ^0.4.15;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
//import "../contracts/DogeRelayForTests.sol";
import "../contracts/DogeParser/DogeTx.sol";

contract TestDogeRelay {

    function testFlip32BytesLargeNumber() public {
        // DogeRelayForTests dr = DogeRelayForTests(DeployedAddresses.DogeRelayForTests());
        uint expected = 0x201f1e1d1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201;
        Assert.equal(DogeTx.flip32Bytes(0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20), expected, "flip32Bytes failed");
    }

}
