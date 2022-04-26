/******************************************************************************
 * 								ExtendedNodeStats.js
 * 
 * Holds Bitburner's NodeStats and adds properties and methods for holding
 * and calculating profitability and payback times.
 * 
 * Used by HacknetManager.js.
 * 
 * TODO: Do we actually need this?
 * TODO: Calculate payback here instead of in HacknetManager? 
 * TODO: Error handling.
 * 
 * Last updated: 2022/04/26
 *****************************************************************************/

/**
 * Holds Bitburner's NodeStats and adds properties and methods 
 * related to profitability and payback times.
 */
export class ExtendedNodeStats
{
	#_nodeStats;
	#_index = undefined;

	#_levelPaybackTime = Infinity;
	#_ramPaybackTime = Infinity;
	#_corePaybackTime = Infinity;

	/** 
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 * @param {object} nodeStats Bitburner NodeStats object that holds 
	 * 							 information about a hacknet node.
	 * @param {number} nodeIndex Index number of the hacknet node.
	 */
	constructor(ns, nodeStats, nodeIndex)
	{
		this.#_nodeStats = nodeStats;
		this.#_index = nodeIndex;

		//this.#calculatePaybackTimes(ns);
	}

	/**
	 * Updates the node levels by checking the relevant Bitburner
	 * NodeStats node, and recalculates payback times for upgrades.
	 * @param {import(".").NS } ns	This is for VSCode.
 	 * @param {ns} ns 				This is for Bitburner editor.
	 */
	updateNodeStats(ns)
	{
		this.#_nodeStats = ns.hacknet.getNodeStats(this.#_index);
		//this.#calculatePaybackTimes(ns);
	}

	/**************************************************************************
	 * 
	 * 				 				Getters.
	 * 
	 *************************************************************************/	

	/**
	 * Returns the payback time of increasing level by one. In seconds.
	 * @returns {number} The payback time in seconds.
	 */
	get levelPaybackTime()
	{
		return this.#_levelPaybackTime;
	}

	/**
	 * Returns the payback time of increasing ram by one. In seconds.
	 * @returns {number} The payback time in seconds.
	 */
	get ramPaybackTime()
	{
		return this.#_ramPaybackTime;
	}

	/**
	 * Returns the payback time of increasing cores by one. In seconds.
	 * @returns {number} The payback time in seconds.
	 */
	get corePaybackTime()
	{
		return this.#_corePaybackTime;
	}

	/**
	 * Returns reference to the Bitburner NodeStats object.
	 * Holds all the basic information about a node.
	 * @returns {object} The NodeStats object.
	 */
	get basicNodeStats()
	{
		return this.#_nodeStats;
	}
}