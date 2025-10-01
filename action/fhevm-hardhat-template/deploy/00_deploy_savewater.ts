import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const saveWater = await deploy("SaveWater", { from: deployer, log: true });
  log(`SaveWater deployed at ${saveWater.address}`);

  const badge = await deploy("SaveWaterBadge", {
    from: deployer,
    args: [saveWater.address],
    log: true,
  });
  log(`SaveWaterBadge deployed at ${badge.address}`);
};

export default func;
func.id = "deploy_savewater";
func.tags = ["SaveWater"];



