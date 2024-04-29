class EloRankHelper {

    static kFactor = 40;
    static eloTest(playerData, matchID) {

        let PlayerHasMatchData = false;
        for (let i=0; i < playerData.MatchesData.length; i++) {
            if (matchID !== MatchID) continue;
            PlayerHasMatchData = true;
            break;
        }
        if (!PlayerHasMatchData) return false;
        let newRate = [];
        for (let i = 0; i < rate.length; i++) {
            let nr = 0;
            for (let j=0; j < rate.length; j++) {
                if (i === j) continue;
                let score = 0;
                let w = 1/(10 ** ((playerData[j].Elo - playerData[i].Elo)/400) + 1);
                if (playerData[i].rank < playerData[j].rank) score = 1;
                else if (playerData[i].rank === playerData[j].rank) score = 0.5;
                nr += this.kFactor * (score - w);
            }
            newRate.push(Math.round(playerData[i].elo + nr));
        }
        return newRate;
    }

}

module.exports = EloRankHelper;