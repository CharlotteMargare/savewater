import { task } from "hardhat/config";

task("savewater:addresses", "Print deployed addresses").setAction(async (_, hre) => {
  const deployments = await hre.deployments.all();
  const saveWater = deployments["SaveWater"]?.address;
  const badge = deployments["SaveWaterBadge"]?.address;
  console.log(JSON.stringify({ SaveWater: saveWater, SaveWaterBadge: badge }, null, 2));
});



