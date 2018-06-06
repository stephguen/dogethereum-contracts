const utils = require('./utils');
const DogeClaimManager = artifacts.require('DogeClaimManager');
const DogeSuperblocks = artifacts.require('DogeSuperblocks');
const ScryptCheckerDummy = artifacts.require('ScryptCheckerDummy');
const ScryptVerifier = artifacts.require('ScryptVerifier');
const ClaimManager = artifacts.require('ClaimManager');

contract('DogeClaimManager', (accounts) => {
  const owner = accounts[0];
  const submitter = accounts[1];
  const challenger = accounts[2];
  let claimManager;
  let superblocks;
  let scryptChecker;
  const initHashes = ['0x0000000000000000000000000000000000000000000000000000000000000000'];
  const initMerkleRoot = utils.makeMerkle(initHashes);
  const initAccumulatedWork = 0;
  const initTimestamp = 0;
  const initLastHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const initParentHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const initSuperblock = utils.calcSuperblockId(
    initMerkleRoot,
    initAccumulatedWork,
    initTimestamp,
    initLastHash,
    initParentHash,
  );

  async function initSuperblocks(dummyChecker = true) {
    superblocks = await DogeSuperblocks.new(0x0);
    claimManager = await DogeClaimManager.new(superblocks.address);
    if (dummyChecker) {
      scryptChecker = await ScryptCheckerDummy.new(claimManager.address, false);
    } else {
      const scryptVerifier = await ScryptVerifier.new();
      scryptChecker = await ClaimManager.new(scryptVerifier.address);
    }
    await superblocks.setClaimManager(claimManager.address);
    await claimManager.setScryptChecker(scryptChecker.address);
    await superblocks.initialize(initMerkleRoot, initAccumulatedWork, initTimestamp, initLastHash, initParentHash, { from: owner });
    //FIXME: ganache-cli creates the same transaction hash if two account send the same amount
    await claimManager.makeDeposit({ value: 10, from: submitter });
    await claimManager.makeDeposit({ value: 11, from: challenger });
  }
  describe('Confirm superblock after timeout', () => {
    let superblock0;
    let superblock1;
    let superblock2;
    let claim1;
    let session1;
    before(async () => {
      await initSuperblocks();
    });
    it('Initialize', async () => {
      superblock0 = initSuperblock;
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock0, best, 'Best superblock should match');
    });
    it('Propose', async () => {
      const accumulatedWork = initAccumulatedWork + 2;
      const timestamp = 1;
      const lastHash = initHashes[0];
      const parentHash = superblock0;
      const merkleRoot = utils.makeMerkle(initHashes);
      const result = await claimManager.proposeSuperblock(merkleRoot, accumulatedWork, timestamp, lastHash, parentHash, { from: submitter });
      assert.equal(result.logs[1].event, 'SuperblockClaimCreated', 'New superblock proposed');
      superblock1 = result.logs[1].args.superblockId;
    });
    it('Try to confirm whitout waiting', async () => {
      let result;
      result = await claimManager.checkClaimFinished("0x02", { from: challenger });
      assert.equal(result.logs[0].event, 'ErrorClaim', 'Invalid claim');
      result = await claimManager.checkClaimFinished(superblock1, { from: challenger });
      assert.equal(result.logs[0].event, 'ErrorClaim', 'Invalid timeout');
    });
    it('Confirm', async () => {
      await utils.mineBlocks(web3, 5);
      const result = await claimManager.checkClaimFinished(superblock1, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimSuccessful', 'Superblock challenged');
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock1, best, 'Best superblock should match');
    });
    it('Propose fork', async () => {
      const accumulatedWork = initAccumulatedWork + 1;
      const timestamp = 1;
      const lastHash = initHashes[0];
      const parentHash = superblock0;
      const merkleRoot = utils.makeMerkle(initHashes);
      const result = await claimManager.proposeSuperblock(merkleRoot, accumulatedWork, timestamp, lastHash, parentHash, { from: submitter });
      assert.equal(result.logs[1].event, 'SuperblockClaimCreated', 'New superblock proposed');
      superblock2 = result.logs[1].args.superblockId;
    });
    it('Confirm fork', async () => {
      await utils.mineBlocks(web3, 5);
      const result = await claimManager.checkClaimFinished(superblock2, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimSuccessful', 'Superblock challenged');
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock1, best, 'Best superblock did not change');
    });
  });
  describe('Confirm superblock after verification', () => {
    let superblock0;
    let superblock1;
    let superblock2;
    let claim1;
    let session1;
    const blockHeader = `03016200da16dd5b0168b4dc4301b0c3296b188fdb4b59099537776be21b5a53d65649a8ef7ee5829f401144e8dbd23e386597584558e1972a66e5a48a2b58cac629ee46f8455556481a041b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403439e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6d65fdfa97de61e7932a69b3fc70d71fc5fec14639f4d8d92d8da7574acff1c2cd40000000f09f909f4d696e65642062792061696c696e37363232320000000000000000000000000000000000002a0000000168794696000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88acc5d6f6323569d4c55c658997830bce8f904bf4cb74e63cfcc8e1037a5fab03000000000004f529ba9787936a281f792a15d03dc1c6d2a45e25666432bcbe4663ad193a7f15307380ab3ab6f115e796fe4cea3b297b3c22018edad8d3982cf89fe3102265061ae397c9c145539a1de3eddfeff6ba512096542e41498cade2b4986d43d497c74c10c869bc28e301b2d9e7558237b1655f699f93a9635938f58cf750b94d4e9a00000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f50c27ad8b8e751d85f7e9dc7a5ff18c817a72cd9976063c6849d1538f6a662d342800000003000000c63abe4881f9c765925fffb15c88cdb861e86a32f4c493a36c3e29c54dc62cf45ba4401d07d6d760e3b84fb0b9222b855c3b7c04a174f17c6e7df07d472d0126fe455556358c011b6017f799`;
    const blockHash = utils.calcBlockSha256Hash(blockHeader);
    before(async () => {
      await initSuperblocks(false);
    });
    it('Initialized', async () => {
      superblock0 = initSuperblock;
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock0, best, 'Best superblock should match');
    });
    it('Propose', async () => {
      const accumulatedWork = web3.toBigNumber(initAccumulatedWork).plus(utils.getBlockDifficulty(blockHeader));
      const timestamp = utils.getBlockTimestamp(blockHeader);
      const lastHash = blockHash;
      const parentHash = superblock0;
      const merkleRoot = utils.makeMerkle([blockHash]);
      const result = await claimManager.proposeSuperblock(merkleRoot, accumulatedWork, timestamp, lastHash, parentHash, { from: submitter });
      assert.equal(result.logs[1].event, 'SuperblockClaimCreated', 'New superblock proposed');
      superblock1 = result.logs[1].args.superblockId;
      claim1 = superblock1;
    });
    it('Challenge', async () => {
      const result = await claimManager.challengeSuperblock(superblock1, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimChallenged', 'Superblock challenged');
      assert.equal(claim1, result.logs[1].args.claimId);
    });
    it('Query and verify hashes', async () => {
      let result;
      result = await claimManager.runNextBattleSession(claim1, { from: challenger });
      assert.equal(result.logs[0].event, 'NewSession', 'New battle session');
      session1 = result.logs[0].args.sessionId;
      assert.equal(result.logs[1].event, 'VerificationGameStarted', 'Battle started');
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      const data = utils.hashesToData([blockHash]);
      result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
    });
    it('Query and reply block header', async () => {
      let result;
      result = await claimManager.query(session1, 1, blockHash, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query block header');
      const data = utils.headerToData(blockHeader);
      result = await claimManager.respond(session1, 1, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Block header accepted');
    });
    it('Verify superblock', async () => {
      const result = await claimManager.performVerification(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Superblock verified');
    });
    it('Confirm', async () => {
      await utils.mineBlocks(web3, 5);
      const result = await claimManager.checkClaimFinished(superblock1, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimSuccessful', 'Superblock challenged');
    });
  });
  describe('Challenge superblock', () => {
    let superblock0;
    let superblock1;
    let superblock2;
    let claim1;
    let session1;
    const initHashes = ['0x0000000000000000000000000000000000000000000000000000000000000000'];
    const initMerkleRoot = utils.makeMerkle(initHashes);
    const initAccumulatedWork = 0;
    const initTimestamp = 1;
    const initLastHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const initParentHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const headers = [
      `03016200da16dd5b0168b4dc4301b0c3296b188fdb4b59099537776be21b5a53d65649a8ef7ee5829f401144e8dbd23e386597584558e1972a66e5a48a2b58cac629ee46f8455556481a041b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403439e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6d65fdfa97de61e7932a69b3fc70d71fc5fec14639f4d8d92d8da7574acff1c2cd40000000f09f909f4d696e65642062792061696c696e37363232320000000000000000000000000000000000002a0000000168794696000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88acc5d6f6323569d4c55c658997830bce8f904bf4cb74e63cfcc8e1037a5fab03000000000004f529ba9787936a281f792a15d03dc1c6d2a45e25666432bcbe4663ad193a7f15307380ab3ab6f115e796fe4cea3b297b3c22018edad8d3982cf89fe3102265061ae397c9c145539a1de3eddfeff6ba512096542e41498cade2b4986d43d497c74c10c869bc28e301b2d9e7558237b1655f699f93a9635938f58cf750b94d4e9a00000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f50c27ad8b8e751d85f7e9dc7a5ff18c817a72cd9976063c6849d1538f6a662d342800000003000000c63abe4881f9c765925fffb15c88cdb861e86a32f4c493a36c3e29c54dc62cf45ba4401d07d6d760e3b84fb0b9222b855c3b7c04a174f17c6e7df07d472d0126fe455556358c011b6017f799`,
      `03016200a475894849fe17b79673e7ecda4d0be2814cdbbcdd2376a5d7a4ca56b47703a16694d245b05bc4b65a26ba504fedee7f47acf3c354c2f3897964991b784074ee9446555640b1031b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403449e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6d84117b09e5d99fc04280af2d78bb36915e1b196c65d454aec3b0fb88b8e1ec6240000000f09f909f4d696e65642062792077616e67636875616e776569000000000000000000000000000000001b0100000148e01995000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88acf2770637d9c2b6599fc2bc94a4b9c2a3c8589f2fd62e4a0459bc13f33aa401000000000005462f31ec45cdd06c1098d74e311d2182eb1320694ac39c8b13de927800959eb0c586e12adb95b25281c4fd377bda5f5b4dc4477dd237faf7c68aa7ff690cbc47c58a8ef40c56afe6262c57ccbc88f368caceb048b674a89146794434e3796f9173d35744c56a580399985ea21897a1f4ee112906634bbb7ee00e3652ff2351e1e8550037fffb2db59f11dc1d492d6311e2376abaf895acaa6d5e391259491e2d00000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f5258991030d537050ab2d4b302f1966c3e1d25816ba5c6701710cc2e32d35cf9e280000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be41598052989d551f777b8ba0f13067f45d03627552e878432735738278eb500864da5594465556358c011bff0c2f00`,
      `03016200241bb260a8b2ffd509982c8230475e8c012f5bb41036ed7caa97905ec2c66fb25e2f04306e21065b956b5726e1f1dfed1a468b7309dff926628c53f453c53142b14655564c6e041b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403449e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6d2eb40132424f2d742e503a6052788225449011e7ca46d5ce3be2189aab6f40f940000000f09f909f4d696e6564206279206c7463303031000000000000000000000000000000000000000000003de7050001c8abbe95000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88acc92c61360f08ad87f772eb16bdd893a49bf2f02bb4a3bcb8e3605b9046bb0200000000000531c3275dc3dcb07bcf550a77d5c63b29959d034536ab5afeac74c36c37727dcd5752dd9effcbda9c1e5ddc17aa1f1a984192d834b8ff5a1a60e9efd55bf94f1532391099740d20947b24a3556a61602d43e8eabc8ebdba8152459c3a3f24b5c5276a9eed0dbd8b253cef989c0b3a91ed6c2cfba17488646287cb1a8b31d20a7e808778fa84ff3413c05b7debab62b8385fa7625d5c3db31775911b54f86ddbf000000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f50800d93cbb266b6d9cf068dea7fdb153f648f673583e0c196985ab21d576e86c280000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be41598057f99a71e88ddc60bdd708d004c740b816a55a924759e4de63649d21546584c0e9465556358c011b12ebae8e`,
      `0301620008d2149a4c09211274a5d4aa6664e3744316ec2753c2dd8f8ce120107f553b16f577311cf1a9718fa8d03bd7489867d7c3766f8b4ea6e0556de22a25b35d6c23ce4755569535041b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff3f03449e0d04565547cf2cfabe6d6da47a2bd785497c80460cee1c98e619495798c42cb26f59d83264bba1b84001c3400000000000000008160025482c000000ffffffff0190f4e495000000001976a91457757ed3d226faf12bd43983896ec81e7fca369a88ac00000000c4169f0102d6b4ea63ffa02f68b4b645930c517fce3fef5e8e389d0c18533b9506f3798f240748c042e9b6074526232c818a192df3016a2f8c04835c336db4335ffbf3c336ec1fe51ef9e6e60460c3902d84e3c672a91001d63aa2a22edb0485cc5f7a0fccf78eacfd7023e7b260bf83347f05503ee357d02d3919419aa819288e3d250bd0b3332b25f5cf78e0983e73f5a0b0af951b6119c6f8b8aa1b7192695891417d01f52fad8802638f1590be80bac364ae5a7737c182d604af2e7937ef2e7e7b197151c3525785a6b12b47e73fe3541498c6f407f6279e184d1533b464c60000000006c6ea0f7aad9bf51b3934d6cba36ec25f3fe9849709abd3f44248d78c0bc505d0a631474a1d2dfc29be55058d230afcd4a1d3f0eba12bdd4a2f78346f1b7495bf7d24db2bfa41474bfb2f877d688fac5faa5e10a2808cf9de307370b93352e54894857d3e08918f70395d9206410fbfa942f1a889aa5ab8188ec33c2f6e207dc7a2376894b5181d8d6d1127bf0d19c715089a73cbc25fd09d493c41f1fe9339dd010103373a1abe9e97481fbdaff392c3cf9eeffeca9ba04ef21240aa50126672380000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be4159805196f9b2a4ff0d9a7ff0dd81f8401cf21ca9694e0b5b6f482186a9c0ed3e660bcf475556358c011bfce10a64`,
      `03016200a1477c2168cf76ad6e3525a8ab7e952df235f9d43a583d1bf7ed48ffe6e7451e0db1e5eca6fb65734c7ee1d724d84228e1837f65c55c2b2589abbbd0f3180ce2e3475556742c061b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4c03449e0d04e54755560803e05184dbc42500fabe6d6de531ecc51b2f1888a5de9ce91fed445883e55f1dc1b58d5e3a7684cb56f9945c40000000000000000d2f6e6f64655374726174756d2f0000000001209a0a95000000001976a9145da2560b857f5ba7874de4a1173e67b4d509c46688ac000000004990d6bdc68f086c4a82d90d683046a40d3c546609c368aecc5bc807806edc0903ad4c94d66fa017fe2a75da68fc0a9b84394bf147022deeae001cde7d53d2a480eb32313884371daf6cafbe0e00f264721ad9be2cace3fc838826d2e0f299978f1ae1d13cb5bf47b14651bee13e885f2129654d9106ae04c35684e22a558e9f5b00000000060000000000000000000000000000000000000000000000000000000000000000e2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf97d24db2bfa41474bfb2f877d688fac5faa5e10a2808cf9de307370b93352e54894857d3e08918f70395d9206410fbfa942f1a889aa5ab8188ec33c2f6e207dc778b6e34efd0a4749b771cfe3f5876e880f0d851ebb93a4dab5062a5975a1aa3e11b1acbc3b0b041473bf1f16421df844ba2f1e157add8f2cdbd8e0e0b816f1ad380000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be415980616cb8630c8a108d4ff80240d6adbbd77190369c1b024b9db99b8d1f229191e62b465556358c011b3d099516`,
      `0301620029b451ad79429fc1fd26109331ee83b858a5335952b5754993b1922d29dc2ed7c38be4f98012dedeb9372926959ca82247784933badf7b94d308d96eb195c090ec47555616c3051b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403449e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6dc5eb29e28e7c54b269858b1f5b278b74eed3cbda1cf7dd506429d94f346ca9e740000000f09f909f4d696e656420627920636169726f6e670000000000000000000000000000000000000000002800000001b83af495000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88ac3d757a337f51482ded52a98d026b2aab20d4bd6bcedc3be5823471eada6e0300000000000631c3275dc3dcb07bcf550a77d5c63b29959d034536ab5afeac74c36c37727dcdce2b8079e87c60509d7ee92a0821d75800115f8877b5ab2a81a8b4400cf959cdcf457944488908b9f39527ac492dc490fab9b6548fb693ed38073466395fe9c659cbb38b6e245c52ea756e3d77514f23ea3e1ff4f16e0e4d9886ab3f3e1a0b0a47a0102b4ef760f0e7cbc4a53302c14d38704ee49b5fd0dfd17309ff97ba2a61729a8880632134ae072c6693b465b084086f4a2750bd86044814cb0a3fd5d12900000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f583718a099fd33ba7cbb8e3c233e86d76375c354fa3189e5df3203fbd4f4d417c280000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be415980b2b87463d388a3682b24d2172f71908de64e875867df17abbf42a225b24d922d27485556358c011ba66aad20`,
      `02016200427b118bc209c9ff10f50a25181410276720ba4bb2d6e001d2897671ebd3cfe43983c016d7643b77b2bab44314d6411c68634813c2ae1a2eb4894321c609e93cb7485556932f051b0000000002000000010000000000000000000000000000000000000000000000000000000000000000ffffffff5403449e0d2cfabe6d6dbaac4ffbf483b312f20c87896d4651b22b5da8ad1fae296b733926353e066ec201000000000000002fe585abe5ae9de6b1a0203862616f6368692e636f6d2f0100000076fc0f023d010000000000000110ae0f96000000001976a9149659e4bc4b884ae48b9e8e70e22b9b7dea9ef24788ac0000000002c4e323fc827d020a0d179b3d39489ce1d2c8391eaa715248a4f836fccea12107f3798f240748c042e9b6074526232c818a192df3016a2f8c04835c336db4335ffbf3c336ec1fe51ef9e6e60460c3902d84e3c672a91001d63aa2a22edb0485cca78d32071fabf1ebc844fb2c9f37630394ef405bcc4a9211170fd7db6ebf9069c4e1386a0c75901ffa5cfc53d5e02c843508586b38ee9ede0fea5379968b0418e30c2eda83fedb03c5d1f0485d301f34fe2740ec3106891fb8041abb85d73ff2e8a0855c3d58afc5f8f3aea6c176f960e7b08dab000627c5adc09e9169da742d6e799841f20c5bcd121c0df05bcf57ab79a77b181340a440292c66539fbebee30000000000000000000300000071fad47a6bcb4f483da2562d7e1afeb03bfa07a4540365fbf2ef3db5be415980daaadd9da1da6c858fdfd94c8e297f695a6c575b65e215a8888aa9ae6cb1352bb6485556358c011bfeffbb00`,
    ];
    const hashes = headers.map(utils.calcBlockSha256Hash);
    before(async () => {
      await initSuperblocks();
    });
    it('Initialize', async () => {
      superblock0 = initSuperblock;
      const best = await superblocks.getBestSuperblock();
      assert.equal(superblock0, best, 'Best superblock should match');
    });
    it('Propose', async () => {
      const accumulatedWork = headers.reduce((work, header) => work.plus(utils.getBlockDifficulty(header)), web3.toBigNumber(initAccumulatedWork));
      const timestamp = utils.getBlockTimestamp(headers[headers.length - 1]);
      const lastHash = hashes[hashes.length - 1];
      const parentHash = superblock0;
      const merkleRoot = utils.makeMerkle(hashes);
      const result = await claimManager.proposeSuperblock(merkleRoot, accumulatedWork, timestamp, lastHash, parentHash, { from: submitter });
      assert.equal(result.logs[1].event, 'SuperblockClaimCreated', 'New superblock proposed');
      superblock1 = result.logs[1].args.superblockId;
      claim1 = result.logs[1].args.claimId;
    });
    it('Challenge', async () => {
      const result = await claimManager.challengeSuperblock(superblock1, { from: challenger });
      assert.equal(result.logs[1].event, 'SuperblockClaimChallenged', 'Superblock challenged');
      assert.equal(claim1, result.logs[1].args.claimId);
    });
    it('Query hashes', async () => {
      let result;
      result = await claimManager.runNextBattleSession(claim1, { from: challenger });
      assert.equal(result.logs[0].event, 'NewSession', 'New battle session');
      session1 = result.logs[0].args.sessionId;
      assert.equal(result.logs[1].event, 'VerificationGameStarted', 'Battle started');
      const session = await claimManager.getSession(claim1, challenger);
      assert.equal(session, session1, 'Sessions should match');
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
    });
    it('Verify hashes', async () => {
      const data = utils.hashesToData(hashes);
      const result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
    });
    hashes.forEach((hash, idx) => {
      it(`Query blocks header ${hash.slice(0, 20)}..`, async () => {
        const result = await claimManager.query(session1, 1, hash, { from: challenger });
        assert.equal(result.logs[0].event, 'NewQuery', 'Query block header');
      });
      it(`Answer blocks header ${hash.slice(0, 20)}..`, async () => {
        const data = utils.headerToData(headers[idx]);
        const result = await claimManager.respond(session1, 1, data, { from: submitter });
        assert.equal(result.logs[0].event, 'NewResponse', 'Block header accepted');
      });
    });
    it('Verify superblock', async () => {
      const result = await claimManager.performVerification(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Superblock verified');
    });
    it('Accept superblock', async () => {
      const result = await claimManager.checkClaimFinished(claim1, { from: submitter });
      assert.equal(result.logs[1].event, 'SuperblockClaimSuccessful', 'Superblock accepted');
    });
  });
  describe('Challenge timeouts', () => {
    let superblock0;
    let superblock1;
    let superblock2;
    let claim1;
    let session1;
    const headers = [
      `03016200da16dd5b0168b4dc4301b0c3296b188fdb4b59099537776be21b5a53d65649a8ef7ee5829f401144e8dbd23e386597584558e1972a66e5a48a2b58cac629ee46f8455556481a041b0000000001000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6403439e0de4b883e5bda9e7a59ee4bb99e9b1bcfabe6d6d65fdfa97de61e7932a69b3fc70d71fc5fec14639f4d8d92d8da7574acff1c2cd40000000f09f909f4d696e65642062792061696c696e37363232320000000000000000000000000000000000002a0000000168794696000000001976a914aa3750aa18b8a0f3f0590731e1fab934856680cf88acc5d6f6323569d4c55c658997830bce8f904bf4cb74e63cfcc8e1037a5fab03000000000004f529ba9787936a281f792a15d03dc1c6d2a45e25666432bcbe4663ad193a7f15307380ab3ab6f115e796fe4cea3b297b3c22018edad8d3982cf89fe3102265061ae397c9c145539a1de3eddfeff6ba512096542e41498cade2b4986d43d497c74c10c869bc28e301b2d9e7558237b1655f699f93a9635938f58cf750b94d4e9a00000000062900000000000000000000000000000000000000000000000000000000000000463ceed131958d98aee29089d1cf38b9728b224512e51ca3a8b1189d5ed03d0709b68fd6e328528f2a29ec7fb077c834fbf0f14c371fafcfb27444017fbf5b26fdb884bed8ad6a4bded36fc89ed8b05a6c6c0ae1cfd5fe37eb3021b32a1e29042b7a2e142329e7d0d0bffcb5cc338621a576b49d4d32991000b8d4ac793bc1f50c27ad8b8e751d85f7e9dc7a5ff18c817a72cd9976063c6849d1538f6a662d342800000003000000c63abe4881f9c765925fffb15c88cdb861e86a32f4c493a36c3e29c54dc62cf45ba4401d07d6d760e3b84fb0b9222b855c3b7c04a174f17c6e7df07d472d0126fe455556358c011b6017f799`,
    ];
    const hashes = headers.map(utils.calcBlockSha256Hash);

    const beginNewChallenge = async () => {
      let result;
      await initSuperblocks();

      superblock0 = initSuperblock;

      // Propose
      const accumulatedWork = web3.toBigNumber(initAccumulatedWork).plus(utils.getBlockDifficulty(headers[0]));
      const timestamp = utils.getBlockTimestamp(headers[0]);
      const lastHash = hashes[0];
      const parentHash = superblock0;
      const merkleRoot = utils.makeMerkle(hashes);

      result = await claimManager.proposeSuperblock(merkleRoot, accumulatedWork, timestamp, lastHash, parentHash, { from: submitter });
      superblock1 = result.logs[1].args.superblockId;
      claim1 = result.logs[1].args.claimId;

      // Challenge
      result = await claimManager.challengeSuperblock(claim1, { from: challenger });
      result = await claimManager.runNextBattleSession(claim1, { from: challenger });
      session1 = result.logs[0].args.sessionId;
    };

    it('Timeout query hashes', async () => {
      let result;
      await beginNewChallenge();
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionError', 'Timeout too early');
      await utils.mineBlocks(web3, 5);
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Session decided');
      assert.equal(result.logs[1].event, 'ChallengerConvicted', 'Should convict challenger');
    });
    it('Timeout reply hashes', async () => {
      let result;
      await beginNewChallenge();
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      result = await claimManager.timeout(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionError', 'Timeout too early');
      await utils.mineBlocks(web3, 5);
      result = await claimManager.timeout(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Session decided');
      assert.equal(result.logs[1].event, 'ClaimantConvicted', 'Should convict claimant');
    });
    it('Timeout query block headers', async () => {
      let result;
      await beginNewChallenge();
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      const data = utils.hashesToData(hashes);
      result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionError', 'Timeout too early');
      await utils.mineBlocks(web3, 5);
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Session decided');
      assert.equal(result.logs[1].event, 'ChallengerConvicted', 'Should convict challenger');
    });
    it('Timeout reply block headers', async () => {
      let result;
      await beginNewChallenge();
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      const data = utils.hashesToData(hashes);
      result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
      result = await claimManager.query(session1, 1, hashes[0], { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query block header');
      result = await claimManager.timeout(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionError', 'Timeout too early');
      await utils.mineBlocks(web3, 5);
      result = await claimManager.timeout(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Session decided');
      assert.equal(result.logs[1].event, 'ClaimantConvicted', 'Should convict claimant');
    });
    it('Timeout verify superblock', async () => {
      let result;
      let data;
      await beginNewChallenge();
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      data = utils.hashesToData(hashes);
      result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
      result = await claimManager.query(session1, 1, hashes[0], { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query block header');
      data = utils.headerToData(headers[0]);
      result = await claimManager.respond(session1, 1, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Block header accepted');
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionError', 'Timeout too early');
      await utils.mineBlocks(web3, 5);
      result = await claimManager.timeout(session1, { from: submitter });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Session decided');
      assert.equal(result.logs[1].event, 'ChallengerConvicted', 'Should convict challenger');
    });
    it('Verify superblock', async () => {
      let result;
      let data;
      await beginNewChallenge();
      result = await claimManager.query(session1, 0, 0, { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query hashes');
      data = utils.hashesToData(hashes);
      result = await claimManager.respond(session1, 0, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Hashes accepted');
      result = await claimManager.query(session1, 1, hashes[0], { from: challenger });
      assert.equal(result.logs[0].event, 'NewQuery', 'Query block header');
      data = utils.headerToData(headers[0]);
      result = await claimManager.respond(session1, 1, data, { from: submitter });
      assert.equal(result.logs[0].event, 'NewResponse', 'Block header accepted');
      result = await claimManager.performVerification(session1, { from: challenger });
      assert.equal(result.logs[0].event, 'SessionDecided', 'Superblock verified');
      assert.equal(result.logs[1].event, 'ChallengerConvicted', 'Should convict challenger');
    });
  });
});