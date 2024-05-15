class EloRankHelper {
    static kFactor = 40;

    // This Elo test is with arrays only
    static eloTest(playerElos, playerRanks) {
        let newRate = [];
        for (let i = 0; i < playerElos.length; i++) {
            let nr = 0;
            for (let j=0; j < playerElos.length; j++) {
                if (i === j) continue;
                let score = 0;
                let w = 1/(10 ** ((playerElos[j] - playerElos[i])/400) + 1);
                if (playerRanks[i] < playerRanks[j]) score = 1;
                else if (playerRanks[i] === playerRanks[j]) score = 0.5;
                nr += this.kFactor * (score - w);
            }
            newRate.push(Math.round(playerElos[i] + nr));
        }
        console.log(`Prev Elo Rates: ${playerElos}`, `\nNew Elo Rates: ${newRate}`);
        return newRate;
    }

    static eloMapTest(playerElos, playerRanks) {
        // Step 1: Extract player IDs and their current Elo ratings
        let playerIDs = Array.from(playerElos.keys());
        let playerElosArray = Array.from(playerElos.values());

        // Step 2: Extract player ranks
        let playerRanksArray = playerIDs.map(id => playerRanks.get(id));
        console.log(playerElosArray, playerRanksArray);

        let newRate = [];
        for (let i = 0; i < playerElosArray.length; i++) {
            let nr = 0;
            for (let j = 0; j < playerElosArray.length; j++) {
                if (i === j) continue;
                let score = 0;
                let w = 1 / (10 ** ((playerElosArray[j] - playerElosArray[i]) / 400) + 1);
                if (playerRanksArray[i] < playerRanksArray[j]) score = 1;
                else if (playerRanksArray[i] === playerRanksArray[j]) score = 0.5;
                nr += this.kFactor * (score - w);
            }
            newRate.push(Math.round(playerElosArray[i] + nr));
        }

        // Step 3: Create a new Map for updated Elo ratings
        let updatedPlayerMap = new Map();
        for (let i = 0; i < playerIDs.length; i++) { updatedPlayerMap.set(playerIDs[i], newRate[i]); }
        
        return updatedPlayerMap;
    }

    static DoorNumberToRanking(doorNumbs) {
        // Step 1: Create an array of objects with key and value
        let valueWithKey = [];
        doorNumbs.forEach((value, key) => {
          valueWithKey.push({ key, value });
        });
      
        // Step 2: Sort the array by value in descending order
        valueWithKey.sort((a, b) => b.value - a.value);
      
        // Step 3: Create a new Map to store the ranks
        let rankedMap = new Map();
      
        // Fill the rankedMap with ranks based on the sorted array
        valueWithKey.forEach((item, rank) => {
          rankedMap.set(item.key, rank + 1); // rank + 1 because ranks start from 1
        });
      
        return rankedMap;
    }

}

module.exports = EloRankHelper;