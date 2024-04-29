const fs = require('fs');
const path = require('path');

class PlayersManager {
    static cached_PlayerInformation = [];

    static init() {
        const dir = path.join(__dirname, 'PlayerData');
    
        // Read the contents of the 'mods' directory
        fs.readdir(dir, (err, files) => {
            if (err) {
                console.error('Error reading folder:', err);
                return;
            }
            const jsonFiles = files.filter((file) => {
                const filePath = path.join(dir, file);
                const fileStat = fs.statSync(filePath);
                return fileStat.isFile() && path.extname(filePath).toLowerCase() === '.json';
            });
            
            for (let i=0; i < jsonFiles.length; i++) {
                const json = jsonFiles[i];
                const filePath = path.join(dir, json);
                const fileData = fs.readFileSync(filePath, 'utf8');
                try {
                    // Parse the file contents as JSON
                    const jsonObject = JSON.parse(fileData);
                    PlayersManager.cached_PlayerInformation.push(jsonObject);
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }
            }
        });
    }

    // returns true if the player is in the database, false if player exists already.
    static SetUpPlayer(member, robloxID) {
        const discordID = parseInt(member.user.id);
        robloxID = parseInt(robloxID);
        if (isNaN(discordID) || isNaN(robloxID)) return [false, null];
        for (let i=0; i < this.cached_PlayerInformation.length; i++) {
            const player = this.cached_PlayerInformation[i];
            
            if (player.RobloxID === robloxID || player.DiscordID === discordID) return [false, null];
        }
        let newPlayer = new PlayerData();
        newPlayer.RobloxID = robloxID;
        newPlayer.DiscordID = discordID;
        newPlayer.DiscordName = member.user.globalName;
        newPlayer.DiscordNickname = member.nickname;
        newPlayer.RankJoinTime = Math.floor(Date.now() / 1000);

        newPlayer.ValidData = true;
        this.AddNewPlayerData(newPlayer);
        return [true, newPlayer];
    }

    static UpdateStoredData() {
        const playerData = path.join(__dirname, 'PlayerData');
        for (let i=0; i < this.cached_PlayerInformation.length; i++) {
            const player = this.cached_PlayerInformation[i];
            if (!player.ValidData) continue; // why save data that isn't valid?
            const pathLocation = path.join(__dirname, 'PlayerData');
            const file = path.join(playerData, `${player.DiscordID.toString()}.json`);
            
            fs.mkdir(pathLocation, { recursive: true }, (err) => {
                if (err) {
                    console.error('File does not exist');
                    return;
                }
            
                fs.writeFile(file, JSON.stringify(player), (err) => {
                    if (err) {
                        console.error('Error writing to file:', err);
                        return;
                    }
                });
            });
        }
    }

    static GetPlayerData(discordID) {
        for (let i=0; i < this.cached_PlayerInformation.length; i++) {
            const player = this.cached_PlayerInformation[i];
            
            if (player.DiscordID == discordID) return player;
        }
        return -1;
    }

    static AddNewPlayerMatch(discordID, match) {
        for (let i=0; i < this.cached_PlayerInformation.length; i++) {
            const player = this.cached_PlayerInformation[i];
            if (player.DiscordID != discordID) continue;
            this.cached_PlayerInformation[i].MatchesData.push(match);
            this.UpdateStoredData();
            return true;
        }
        return false;
    }

    static AddNewPlayerData(player) {
        const playerJson = JSON.parse(player.toJson());
        this.cached_PlayerInformation.push(playerJson);
        this.UpdateStoredData();
    }

    static PlayerName(player) {
        return (player.DiscordNickname != null) ? player.DiscordNickname : player.DiscordName;
    }
    
}

class PlayerData {
    ValidData = false;

    DiscordName = "Placeholder";
    DiscordNickname = "Nickname Placeholder";
    RobloxID = -1;
    DiscordID = -1;
    Elo = 1500; // everyone starts with 1500 Elo
    MatchesData = [ // An array of MatchData
    ];
    RankJoinTime = -1; // Unix Time for when the Player joined the Ranked Discord Bot Manager
    KnobsSpent = 0; // Cool data to track I Guess
    KnobsEarned = 0; // KnobsSpend / Earned is based on their join time.
    Deaths = 0; // How many times player has died in Matches

    AddMatchData(data) {
        MatchesData.push(data);
    }

    toJson = function() { return JSON.stringify(this); }
};
module.exports = {PlayersManager, PlayerData}