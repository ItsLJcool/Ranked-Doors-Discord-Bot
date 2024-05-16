// commands that just give info to users

const {ButtonStyle, EmbedBuilder} = require("discord.js");
const EventsHelper = require("./EventsHelper");
const {PlayersManager} = require("./PlayerData");

const {Button, ButtonItems} = require("./MessagesUtil/Button");
const {Selection, SelectionItems} = require("./MessagesUtil/Selection");
const {ModalUtil, TextInputItems} = require("./MessagesUtil/ModalUtil");
const {Pages, PagesEmbedData} = require("./MessagesUtil/Pages");

const {RankedMatches} = require("./RankedMatches");

class UserCommands {
    static client;
    static init(_client) {
        this.client = _client;
        
        const statTypes = [
            { name: 'Player Global Stats', value: 'player' },
            { name: 'Player Matches', value: 'matches' },
        ];
        EventsHelper.addCommand("stats", "check your current statistics.", (command) => {
            command.addStringOption(option => {
                option.setName("type").setDescription("See a specific type of stat").setRequired(true)
                EventsHelper.AddChoices(option, statTypes);
                return option;
            }
            ).addUserOption(option =>
                option.setName("user").setDescription("The user you wish to check the stats of").setRequired(false)
            );
        }, async (interaction) => {
            const typeInput = interaction.options.getString("type");
            let userInput = interaction.options.getUser("user");
            
            userInput = (userInput == undefined) ? interaction.user : userInput; // If doesn't input a user, do themself.
            
            await interaction.deferReply({ephemeral: true});
            const playerData = PlayersManager.GetPlayerData(userInput.id);
            if (playerData == -1) return interaction.editReply("You do not have an account! Please use `/register` to make a Ranked Account!"); // one-liner pog

            switch(typeInput) {
                case "player":
                    const embed = new EmbedBuilder()
                    .setTitle(`${userInput.globalName} - Ranked Doors Stats`)
                    .setDescription(`Here is the stats of ${userInput.globalName}`);
                    Object.keys(playerData.Elo).forEach((key) => {
                        embed.addFields({
                            name: `${key}`,
                            value: `${playerData.Elo[key]}`,
                            inline: true
                        });
                    });
                    embed.addFields( { name: " ", value: " ", inline: false } );
                    embed.addFields(
                    { name: "Knobs Spent", value: `${playerData.KnobsSpent}`, inline: true },
                    { name: "Knobs Earned", value: `${playerData.KnobsEarned}`, inline: true },

                    { name: " ", value: " ", inline: false },

                    { name: "Deaths", value: `${playerData.Deaths}`, inline: false },
                    { name: "Time of Ranked Doors Account Creation", value: `<t:${playerData.RankJoinTime}:F>`, inline: false },
                    ).setColor("#00b0f4").setFooter({text: `${interaction.user.globalName}`}).setTimestamp();
                    await interaction.followUp({ephemeral: false, embeds: [embed]});
                    break;
                case "matches":
                    const playerMatches = playerData.MatchesData;
                    if (playerMatches.length == 0) {
                        interaction.editReply("This player has not played any matches!");
                        return;
                    }
                    let pagesStuff = [];
                    for (let i=0; i < playerMatches.length; i++) {
                        const match = playerMatches[i];
                        if (!match.ValidData) continue;
                        let fields = [
                            { name: "Died", value: `${match.DeathInfo.Died}`, inline: true },
                            { name: "Died on Door #", value: `${match.DeathInfo.Door}`, inline: true },
                            { name: "Cause of Death", value: `${match.DeathInfo.Cause}`, inline: true },
                            { name: " ", value: ` `, inline: false },
                        ];
                        Object.entries(match.GameInfo).forEach((name, value) => {
                            if (name[1] != "N / A" && (name[1] != false && name[1] != true)) {
                                const _key = name[0].replace(/([A-Z])/g, ' $1').trim();
                                fields.push({ name: `${_key}`, value: `${match.GameInfo[name[0]]}`, inline: true })
                            }
                        });
                        const EloStatNames = [ "Previous Elo", "New Elo" ];
                        let idx = 0;
                        Object.entries(match.EloStats).forEach((key) => {
                            fields.push({name: EloStatNames[idx], value: ` `, inline: false });
                            Object.entries(match.EloStats[key[0]]).forEach((key) => {
                                fields.push({ name: `${key[0]}`, value: `${key[1]}`, inline: true});
                            });
                            idx++;
                        });
                        fields.push({ name: " ", value: ` `, inline: false });
                        const matchData = RankedMatches.GetMatchData(match.MatchID);

                        fields.push({name: "Time Match Ended", value: `<t:${matchData.ReviewInfo.TimeEnded}:F>`, inline: true });
                        fields.push({name: "Time Match Reviewed", value: `<t:${matchData.ReviewInfo.TimeReviewed}:F>`, inline: true });
                        fields.push({name: "Reviewer", value: `<@${matchData.ReviewInfo.Reviewer}>`, inline: true });
                        fields.push({name: "Feedback", value: `${matchData.ReviewInfo.Feedback}`, inline: true });
                        fields.push({name: "Rank (Placement)", value: `${match.Rank}`, inline: false });
                        
                        if (matchData.ModeInfo.Mode == "Modifiers") fields.push({name: "Modifiers", value: `${matchData.ModeInfo.Modifiers.join(", ")}`, inline: true });
                        pagesStuff.push(new PagesEmbedData({name: `${interaction.user.globalName}`}, `Match #${match.MatchID} | ${matchData.ModeInfo.Mode} (${matchData.ModeInfo.RunType})`, "Description", null, fields, null, true));
                    }
                    if (pagesStuff.length == 0) return interaction.editReply("This player does not have any matches verified yet!");
                    const matches = new Pages(interaction, "matches-stats", pagesStuff, false);
                    try {
                        await interaction.followUp({ephemeral: false, embeds: [matches.pages_embeds[matches.curPage]], components: [matches.page_buttons.ActionRow]});
                    } catch(e) {
                        console.log(e);
                    }
                    break;

            }

        });
    }
}


module.exports = UserCommands;