import { ExtendedNodeStats } from "ExtendedNodeStats.js"

/******************************************************************************
 * 								HacknetManager.js
 * 
 * Continously tries to buy new hacknet nodes or upgrade existing ones.
 * Currently buys the cheapest node/upgrade, and uses up to 1/10 of player's
 * money on one purchase.
 * 
 * Script can be run by itself or by importing HacknetManager and calling
 * buyNodesOrUpgrades(ns) from other script.
 * 
 * TODO: Getting a bit long. Probably a lot of useless stuff here, or things
 * 		 could be shortened a lot.
 * 	 TODO: Move payback calculations to ExtendedNodeStats? That would even out
 * 		   the length of both files.
 * TODO: Do we actually need ExtendedNodeStats class?
 * TODO: Rename maxPercentageMoneySpent to something better.
 * TODO: Don't start from index 0 if we have already upgraded some early nodes
 * 		 to max. No point in going through maxed nodes, as they cannot be sold.
 * TODO: Buy nodes/upgrades with shortest payback times instead.
 *   TODO: Actually check for payback time when buying.
 * 	 TODO: Actually check that calculating payback time works.
 *   TODO: Calculate payback times for upgrades and new nodes also WITHOUT
 *         Formulas.exe?
 * 	 TODO: Make note of each income increase when starting without Formula.exe. 
 * 		   Use that data to calculate payback time for other upgrades?
 * 	 	TODO: Save this info to a text file? Can be read on next reset.
 * TODO: Also handle hacknet servers when we unlock them.
 * 
 * Last updated: 2022/04/26
 *****************************************************************************/

/** 
 * Starts the buy/upgrade loop when the script is run.
 * @param {import(".").NS } ns	This is for VSCode.
 * @param {ns} ns 				This is for Bitburner editor.
 * */
export async function main(ns) 
{
	ns.disableLog("ALL");

	let hacknetManager = new HacknetManager(ns);

	await hacknetManager.buyNodesOrUpgrades(ns);
}

/**
 * The types of upgrades we can do to Hacknet. Enum but not really.
 */
const UpgradeTypes = Object.freeze(
{
	LEVEL: "Level",
	RAM: "Ram",
	CORE: "Core",
	NODE: "Node"
});

    /**************************************************************************
	 * 
	 * 				 			Actual class.
	 * 
	 *************************************************************************/

/**
 * TODO: Support Hacknet servers.
 * TODO: If we do not have Formulas.exe, make note of each upgrade cost and income 
 * 		 increase so we can calculate them better before we get the program.
 */
export class HacknetManager
{
	/**
	 * Holds Bitburner's NodeStats and adds properties and methods 
 	 * related to profitability and payback times.
	 */
	#_nodes = [];

	#_numberOfNodes;
	#_maxPercentageMoneySpent = 0.1;
	#_maxPaybackTime = 60000;
	#_hacknetMultipliers;

	#_fastestPaybackTime = Infinity;
	#_cheapestUpgradeNodeIndex = -1;
	#_cheapestUpgradeType = null;
	#_cheapestUpgradePrice = Infinity;

	#_availableBudget = 0;

	// Booleans.
	#_boughtSomething = false;
	#_formulasExeBought = false;

	#_maxLevel = 200;
	#_maxRam = 64;
	#_maxCores = 16;

	/**
	 * Creates a new Hacknet node manager class.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 * @param {number} maxPaybackTime The maximum amount of time the upgrade needs to run 
	 * 								  to pay back it's price. In seconds.
	 * @param {number} maxPercentageMoneySpent Multiplier of current money which the script 
	 * 										   is allowed to spend on one buy. Between 0 and 1.
	 */
	constructor(ns, maxPaybackTime = 60000, maxPercentageMoneySpent = 0.1)
	{
		this.#_numberOfNodes = ns.hacknet.numNodes();
		this.#_maxPaybackTime = maxPaybackTime;
		this.#_maxPercentageMoneySpent = maxPercentageMoneySpent;
		// TODO: Does this need formulas.exe?
		this.#_hacknetMultipliers = ns.getHacknetMultipliers();

		// Loop through nodes and create ExtendedNodeStats objects to hold
		// more data about profitability and payback times.
		for (let nodeIndex = 0; nodeIndex < this.#_numberOfNodes; nodeIndex++)
		{
			this.#_nodes.push(
				new ExtendedNodeStats(
					ns, 
					ns.hacknet.getNodeStats(nodeIndex), 
					nodeIndex));
		}	
	}

    /**************************************************************************
	 * 
	 * 				 	Asynchronous methods, loops.
	 * 
	 *************************************************************************/

	/**
	 * Tries to upgrade or buy new Hacknet nodes once per minute or faster.
	 * ASYNCHRONOUS. Must call with await.
	 * TODO: Handle finding the upgrade with fastest payback time WITHOUT Formulas.exe.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	async buyNodesOrUpgrades(ns)
	{
		while (true)
		{
			this.#_numberOfNodes = ns.hacknet.numNodes();

			this.findFastestOrCheapestUpgrade(ns);

			this.#_availableBudget = ns.getServerMoneyAvailable("home") * 
									 this.#_maxPercentageMoneySpent;

			// Buying a new node is cheaper than any upgrade.
			if (this.#_cheapestUpgradeType == UpgradeTypes.NODE)
			{
				this.tryToBuyNewNode(ns);
			}

			// Upgrading is cheaper than buying a new node.
			else
			{
				this.tryToBuyUpgrade(ns)
			}

			// If we didn't buy anything, wait a minute before trying again.
			await this.waitIfNeeded(ns);
		}
	} 

	/**
	 * Waits a bit if we failed to buy an upgrade and a lot less if we succeeded.
	 * ASYNCHRONOUS. Must call with await.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	async waitIfNeeded(ns)
	{
		// If we could not afford anything, wait a minute and check again.
		if (!this.#_boughtSomething)
		{
			// Check if we have acquired Formulas.exe for better tools.
			if (ns.fileExists("Formulas.exe"))
			{
				this.#_formulasExeBought = true;
			}

			this.#_boughtSomething = false;

			await ns.sleep("60000");
		}

		// Otherwise wait for a bit before trying to buy more.
		else
		{
			// Reset the cheapestUpgrade values, so that we actually find new one.
			this.#_cheapestUpgradeNodeIndex = -1;
			this.#_cheapestUpgradePrice = Infinity;
			this.#_cheapestUpgradeType = null;

			// TODO: What is the minimum amount of time we can safely sleep?
			await ns.sleep("50");
		}
	}

	/**************************************************************************
	 * 
	 * 				 Finding cheapest upgrades or fastest payback.
	 * 
	 *************************************************************************/

	/**
	 * Find upgrade with either fastest payback time or cheapest price, 
	 * depending whether we have Formulas.exe or not.
	 * TODO: Implement finding upgrades with fastest payback.
	 *   TODO: Try to calculate payback times without Formulas.exe?
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	findFastestOrCheapestUpgrade(ns)
	{
		// If we have Formulas.exe, find the upgrade with the fastest payback time.
		if (this.#_formulasExeBought)
		{
			this.findFastestPayback(ns);
		}

		// Otherwise find the chapest upgrade.
		else
		{
			this.findCheapestUpgrade(ns);
		}
	}

	/**
	 * Loops through all the nodes we own and finds the upgrade with fastest payback.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	findFastestPayback(ns)
	{
		this.#_fastestPaybackTime = Infinity;

		// Check if buying a new node has fastest payback.
		this.checkIfFastestPayback(ns, UpgradeTypes.NODE, ns.hacknet.getPurchaseNodeCost(), -1);

		// Loop through all of our nodes and check which upgrade has the fastest payback.
		for (let nodeIndex = 0; nodeIndex < this.#_numberOfNodes; nodeIndex++)
		{
			this.checkIfFastestPayback(ns, UpgradeTypes.LEVEL, ns.hacknet.getLevelUpgradeCost(nodeIndex), nodeIndex);
			this.checkIfFastestPayback(ns, UpgradeTypes.RAM, ns.hacknet.getRamUpgradeCost(nodeIndex), nodeIndex);
			this.checkIfFastestPayback(ns, UpgradeTypes.CORE, ns.hacknet.getCoreUpgradeCost(nodeIndex), nodeIndex);
		}
	} 

	/**
	 * Checks if the upgrade has faster payback than what we have found so far.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 * @param {object} upgradeType  The type of upgrade: new node, level, ram or core.
	 * @param {number} upgradeCost  The price of the upgrade.
	 * @param {number} nodeIndex	The index of the node this upgrade is checked in.
	 * @returns {boolean}			Whether the upgrade type is cheaper than previously
	 * 								checked upgrades or not.
	 */
	checkIfFastestPayback(ns, upgradeType, upgradeCost, nodeIndex)
	{
		let paybackTime = this.getPaybackTime(ns, upgradeType, upgradeCost, nodeIndex);

		// This is the upgrade with fastest payback we have found so far,
		// save the information to see if we can actually afford it.
		if (paybackTime < this.#_fastestPaybackTime) 
		{ 
			this.#_fastestPaybackTime = paybackTime;
			this.#_cheapestUpgradeType = upgradeType;
			this.#_cheapestUpgradePrice = upgradeCost;
			this.#_cheapestUpgradeNodeIndex = nodeIndex;

			return true;
		}

		else
		{
			return false;
		}
	}

	/**
	 * Calculates the payback time for an upgrade or new node and returns the
	 * time in seconds. 
	 * TODO: Actually test this.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 * @param {object} upgradeType	The upgrade type: new node, level, ram or core.
	 * @param {number} upgradeCost	The price of the upgrade.
	 * @param {number} nodeIndex	Index of the node the upgrade we check is in.
	 * @returns {number} Time for the upgrade to pay itself back in seconds.
	 */
	getPaybackTime(ns, upgradeType, upgradeCost, nodeIndex)
	{
		if (upgradeCost != Infinity)
		{
			// Checking new node type first, because we don't need the rest with it.
			if (upgradeType == UpgradeTypes.NODE)
			{
				return upgradeCost / ns.formulas.hacknetNodes.moneyGainRate(1, 1, 1, this.#_hacknetMultipliers.production);
			}
			
			// Get the nodes current upgrade levels.
			let nodeLevel = this.#_nodes[nodeIndex].basicNodeStats.level;
			let nodeRam = this.#_nodes[nodeIndex].basicNodeStats.level;
			let nodeCores = this.#_nodes[nodeIndex].basicNodeStats.level;

			// Fake upgrade the correct upgrade type by one level for the calculation done in moneyGainRate.
			if (upgradeType == UpgradeTypes.LEVEL) { nodeLevel++; }
			else if (upgradeType == UpgradeTypes.RAM) { nodeRam++; }
			else if (upgradeType == UpgradeTypes.CORE) { nodeCores++; }

			return upgradeCost / ns.formulas.hacknetNodes.moneyGainRate(
				nodeLevel, nodeRam, nodeCores, this.#_hacknetMultipliers.production);
		}
		
		// If the upgrade cost is Infinity, then then upgrade is already at maximul level.
		else
		{
			return Infinity;
		}
	}

	/**
	 * Finds the the index, price and type of the cheapest upgrade.
	 * TODO: Probably bad form to pass -1 as nodeIndex. Better solution?
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	findCheapestUpgrade(ns)
	{
		this.#_cheapestUpgradePrice = Infinity;
		let upgradeCost = ns.hacknet.getPurchaseNodeCost();

		// Check if buying a new node is cheaper than upgrading existing nodes.
		if (upgradeCost < this.#_cheapestUpgradePrice) 
		{
			this.#_cheapestUpgradeType = UpgradeTypes.NODE;
			this.#_cheapestUpgradePrice = upgradeCost;
			this.#_cheapestUpgradeNodeIndex = undefined;
		}

		// Loop through all of our nodes.
		// Check all upgrade types of the node and note if we find one that is 
		// cheaper than a previously checked upgrade.
		for (let nodeIndex = 0; nodeIndex < this.#_numberOfNodes; nodeIndex++)
		{
			upgradeCost = ns.hacknet.getLevelUpgradeCost(nodeIndex);
			if (upgradeCost < this.#_cheapestUpgradePrice)
			{
				this.#_cheapestUpgradePrice = upgradeCost;
				this.#_cheapestUpgradeType = UpgradeTypes.LEVEL;
				this.#_cheapestUpgradeNodeIndex = nodeIndex;
			}
			
			upgradeCost = ns.hacknet.getRamUpgradeCost(nodeIndex);
			if (upgradeCost < this.#_cheapestUpgradePrice)
			{
				this.#_cheapestUpgradePrice = upgradeCost;
				this.#_cheapestUpgradeType = UpgradeTypes.RAM;
				this.#_cheapestUpgradeNodeIndex = nodeIndex;
			}
			
			upgradeCost = ns.hacknet.getCoreUpgradeCost(nodeIndex);
			if (upgradeCost < this.#_cheapestUpgradePrice)
			{
				this.#_cheapestUpgradePrice = upgradeCost;
				this.#_cheapestUpgradeType = UpgradeTypes.CORE;
				this.#_cheapestUpgradeNodeIndex = nodeIndex;
			}
		}
	} // findCheapestUpgrade

	/**************************************************************************
	 * 
	 * 				 		Buying upgrades and nodes.
	 * 
	 *************************************************************************/

	/**
	 * Check if the suggested upgrade is within budget and possibly buy it.
	 * TODO: Update node data in ExtendedNodeStats since we bought an upgrade.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	tryToBuyUpgrade(ns)
	{
		if (this.#_cheapestUpgradePrice < this.#_availableBudget)
		{
			// We have the budget, buy the correct upgrade.
			if (this.#_cheapestUpgradeType == UpgradeTypes.LEVEL)
			{
				ns.hacknet.upgradeLevel(this.#_cheapestUpgradeNodeIndex, 1);
			}
			
			else if (this.#_cheapestUpgradeType == UpgradeTypes.RAM)
			{
				ns.hacknet.upgradeRam(this.#_cheapestUpgradeNodeIndex, 1);
			}

			else if (this.#_cheapestUpgradeType == UpgradeTypes.CORE)
			{
				ns.hacknet.upgradeCore(this.#_cheapestUpgradeNodeIndex, 1);
			}

			// We should never get here. Hopefully.
			else
			{
				ns.print("ERROR: Unexpected upgrade type in BuyHacknet.js.tryToBuyUpgrade " + 
						 "with value of " + this.#_cheapestUpgradeType) + 
						 ". Expected either Level, Ram or Core.";

				this.#_boughtSomething = false;

				return false;
			}

			this.#_boughtSomething = true;

			// TODO: Update node data in ExtendedNodeStats since we bought an upgrade.
			this.#_numberOfNodes = ns.hacknet.numNodes();
			this.#_nodes[this.#_cheapestUpgradeNodeIndex].updateNodeStats(ns);

			return true;
		}

		// We're over budget to buy an upgrade.
		else
		{
			this.#_boughtSomething = false;

			return false;
		}
	} // tryToBuyUpgrade(ns)

	/**
	 * Check if the price of new node is within budget and possibly buy it.
	 * TODO: Update node data in ExtendedNodeStats since we bought a new node.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	tryToBuyNewNode(ns)
	{
		// If we have enough money to buy a new node, buy one.
		if (ns.hacknet.getPurchaseNodeCost() < this.#_availableBudget)
		{
			ns.hacknet.purchaseNode();

			// TODO: Update node data in ExtendedNodeStats since we bought a new node.
			this.#_numberOfNodes = ns.hacknet.numNodes();
			this.#_nodes.push(
				new ExtendedNodeStats(
					ns, 
					ns.hacknet.getNodeStats(this.#_numberOfNodes - 1), 
					this.#_numberOfNodes - 1));

			this.#_boughtSomething = true;

			return true;
		}

		// Over budget.
		else
		{
			this.#_boughtSomething = false;

			return false;
		}
	}
}