
const {AttachmentBuilder, ButtonBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder} = require("discord.js");
const fs = require('fs');
const path = require('path');
const EventsHelper = require("./EventsHelper");

const {PlayersManager} = require("./PlayerData");

const {ServerData, ServerSaveData} = require("./ServerData");

const {Selection, SelectionItems} = require("./MessagesUtil/Selection");

const {Button, ButtonItems} = require("./MessagesUtil/Button");
const {Pages, PagesEmbedData} = require("./MessagesUtil/Pages");

class RankedMatches {

    static ranked_matches = 0;

    static client = null;

    static PossibleRankedModes = [
        { name: 'Normal', value: 'Normal' },
        { name: 'SUPER HARD MODE', value: 'Hard' },
        { name: 'Modifiers', value: 'Modifiers' },
    ];
    static PossibleRankedFloors = [
        { name: 'Floor 1', value: 'Floor 1' },
        // { name: 'Floor 2', value: '2' },
        { name: 'Backdoor', value: 'Backdoor' },
    ];
    static PossibleRankedRunTypes = [
        { name: 'No Shop', value: 'No Shop' },
        { name: 'Shop', value: 'Shop' },
    ];

    static CurrentMatches = [];

    static AddChoices(option, arry) {
        for (let i=0; i < arry.length; i++) option.addChoices(arry[i]);
    }

    static init(_client) {
        this.client = _client;
        this.ModifiersText = new ModifiersTypes().toSelectionItems();
        this.MatchesToBeReviewed = new Map();

        fs.readdir(this.matchDir, (err, files) => {
            if (err) {
                console.error('Error reading folder:', err);
                return;
            }
            const jsonFiles = files.filter((file) => {
                const filePath = path.join(this.matchDir, file);
                const fileStat = fs.statSync(filePath);
                return fileStat.isFile() && path.extname(filePath).toLowerCase() === '.json';
            });
            this.ranked_matches = jsonFiles.length;
        });
        EventsHelper.addCommand("matchmake", "Start A New Ranked Match", (command) => {
            command.addStringOption((option) => {
                option.setName("mode")
                .setDescription("Display to others what mode this will be in")
                .setRequired((this.PossibleRankedModes.length > 1));
                this.AddChoices(option, this.PossibleRankedModes);
                return option;
            }).addStringOption(option => {
                option.setName("floor")
                .setDescription("What floor you want to play ranked on")
                .setRequired((this.PossibleRankedFloors.length > 1));
                this.AddChoices(option, this.PossibleRankedFloors);
                return option;
            }).addStringOption(option => {
                option.setName("run")
                .setDescription("What Run Type it is")
                .setRequired((this.PossibleRankedRunTypes.length > 1));
                this.AddChoices(option, this.PossibleRankedRunTypes);
                return option;
            });
        },
        async (interaction) => {
            await interaction.deferReply({content: `Setting Up`, ephemeral: true});

            const mode = interaction.options.getString("mode");
            let floor = interaction.options.getString("floor");
            let runType = interaction.options.getString("run");

            if (runType == undefined) floor = "No Shop";
            if (floor == undefined) floor = "Floor 1";

            if (mode.toLowerCase() === "hard" && floor.toLowerCase() !== "floor 1") {
                interaction.editReply({content: "SUPER HARD MODE is only a Floor 1 modifier.", ephemeral: true});
                return;
            }

            for (let i=0; i < this.CurrentMatches.length; i++) {
                if (this.CurrentMatches[i].createdUserID !== interaction.member.user.id) continue;
                interaction.editReply({content: "You have a match open already!", ephemeral: true});
                return;
            }
            
            let match = this.NewMatch();
            match.FloorInfo.VisitedFloors = [floor];
            match.FloorInfo.ValidData = true;

            match.ModeInfo.Mode = mode;
            match.ModeInfo.RunType = "No Shop";

            switch(mode.toLowerCase()) {
                case "modifiers":
                    match.ModeInfo.Modifiers = await this._ModifiersAddon(interaction);
                    break;
                case "hard":
                    match.ModeInfo.Mode = "SUPER HARD MODE";
                    match.ModeInfo.RunType = "Shop";
                    match.FloorInfo.VisitedFloors = ["Floor 1"];
                    break;
            }
            await this.UpdateMatchSave(match);
            await interaction.deleteReply();
                
            const userName = (interaction.member.nickname == undefined) ?  interaction.member.user.globalName : interaction.member.nickname;

            const MatchMake_Embed = new EmbedBuilder()
            .setAuthor({
              name: `Match ID - ${match.MatchID}`,
            })
            .setTitle(`Ranked Match - ${match.ModeInfo.Mode} (${match.ModeInfo.RunType}) || Host: ${userName}`)
            .setColor("#00b0f4")
            .setTimestamp();
            
            let hasAttachment = {
                attachment: null,
                valid: false
            };
            let footer = {
                text: `Match ID - ${match.MatchID}`
            };
            let fields = [{ name: "People In Queue (0 / 12)", value: " ", inline: true }];
            if (match.ModeInfo.Modifiers.length >= 1) {
                let valuesCool = "";
                for (let i=0; i < match.ModeInfo.Modifiers.length; i++) {
                    const modifiersLol = match.ModeInfo.Modifiers[i];
                    let _modifiersLol = modifiersLol.replace(/([A-Z])/g, ' $1').trim();
                    if (modifiersLol === "MAXIMUMOVERDRIVE") _modifiersLol = "MAXIMUM OVERDRIVE";
                    valuesCool += `${_modifiersLol}\n`;
                }
                fields.push({ name: "Modifiers", value: valuesCool, inline: true });
                const attachment = new AttachmentBuilder('./src/Images/Modifier2.webp', { name: 'Modifier2.webp' });
                MatchMake_Embed.setThumbnail(`attachment://${attachment.name}`);
                footer.iconURL = `attachment://${attachment.name}`;
                footer.text = `Modifiers: ${match.ModeInfo.Modifiers.length} | ${footer.text}`;
                hasAttachment = {
                    attachment: attachment,
                    valid: true
                };
            }

            MatchMake_Embed.addFields(fields).setFooter(footer);
            
            const sendThing = {embeds: [MatchMake_Embed], ephemeral: false};
            if (hasAttachment.valid) sendThing.files = [hasAttachment.attachment];
            const message = await interaction.channel.send(sendThing);
            const button = new Button(interaction.member.user.id, [
                new ButtonItems("start match", "Start Match (HOST)", ButtonStyle.Primary, null, null, false),
                new ButtonItems("end match", "End Match (HOST)", ButtonStyle.Danger, null, null, true)
            ], async (id, buttonInteraction) => {
                const _userId = id.split("_");
                if (_userId[1] != buttonInteraction.member.user.id) {
                    buttonInteraction.reply({content: "You are not the host of this match!", ephemeral: true});
                    return;
                }

                switch(_userId[0].toLowerCase()) {
                    case "start match":
                        for (let i=0; i < this.CurrentMatches.length; i++) {
                            const matchThingy = this.CurrentMatches[i];
                            if (matchThingy.createdUserID != buttonInteraction.member.user.id) continue;
                            if (matchThingy.channel.members.size < 2) {
                                // buttonInteraction.reply({content: "There isn't enough players to start!", ephemeral: true});
                                // return;
                            }
                            matchThingy.ongoingMatch.MatchInfo.ModeInfo.Players = matchThingy.channel.members.size;
                            matchThingy.channel.permissionOverwrites.set([
                                {
                                    id: matchThingy.channel.guild.id,
                                    deny: [PermissionFlagsBits.Connect],
                                }
                            ]);
                            button.ActionRow.components[0].data.disabled = true;
                            button.ActionRow.components[1].data.disabled = false;
                            
                            await message.edit({components: [button.ActionRow]});

                            buttonInteraction.reply({content: "Match Started!\nWhen the game is over, make sure to click the End Match button!", ephemeral: true});
                            return;
                        }
                        break;
                    case "end match":
                        for (let i=0; i < this.CurrentMatches.length; i++) {
                            const matchThingy = this.CurrentMatches[i];
                            if (matchThingy.createdUserID != buttonInteraction.member.user.id) continue;
                            EventsHelper.removeVC_Callback(matchThingy.channel.id);
                            await EventsHelper.addVC_Callback(matchThingy.channel.id, (oldState, newState, type) => {
                                if (matchThingy.channel.members.size <= 0) {
                                    EventsHelper.removeVC_Callback(matchThingy.channel.id);
                                    matchThingy.channel.delete();
                                }
                            });
                            await matchThingy.ongoingMatch.Players.forEach(async (player) => this.OnMatchEnd(player, matchThingy));
                            await this.CurrentMatches.splice(i, 1);
                            message.delete();
                            return;
                        }
                        break;
                }
                buttonInteraction.reply({content: "Uh Oh, something bad happened... This got past a switch case...", ephemeral: true});
            });
            message.edit({components: [button.ActionRow]});
            interaction.guild.channels.create({userLimit: 12, parent: ServerData.server_info.VC_CategoryID.value,
                name: `${match.ModeInfo.Mode} (${match.ModeInfo.RunType})`, type: ChannelType.GuildVoice, reason: `New Rank Match Setup - ${match.ModeInfo.Mode} (${match.ModeInfo.RunType})` })
                .then(channel => {
                    let ongoingMatch = new OngoingMatchData();
                    ongoingMatch.Channel = channel;
                    ongoingMatch.MatchInfo = match;
                    ongoingMatch.Players = [];
                    this.CurrentMatches.push({matchCommandChannel: interaction.channel, createdUserID: interaction.member.user.id, channel: channel, ongoingMatch: ongoingMatch});
                    EventsHelper.addVC_Callback(channel.id, (oldState, newState, type) => {
                        let isInArray = false;
                        for (let i=0; i < ongoingMatch.Players.length; i++) {
                            if (ongoingMatch.Players[i].user.id !== newState.id) continue;
                            ongoingMatch.Players.splice(i, 1);
                            isInArray = true;
                            break;
                        }
                        if (!isInArray) ongoingMatch.Players.push(newState.member);

                        let fieldString = "";
                        for (let i=0; i < ongoingMatch.Players.length; i++) { fieldString += `${ongoingMatch.Players[i].user.globalName}\n`; }

                        MatchMake_Embed.data.fields[0].name = `People In Queue (${ongoingMatch.Players.length} / 12)`;
                        MatchMake_Embed.data.fields[0].value = fieldString;
                        message.edit({embeds: [MatchMake_Embed]});
                    });
                })
                .catch(console.error);
        });
        
        /**
         * Issue with this, It doesn't send the message in the guild, so we would have to manage what server the command was sent in.
         */
        EventsHelper.addCommand("submit", "Submit Files to the moderators to review and validate matches", (command) => {
            command.addIntegerOption(option => 
                option.setName("match-id").setDescription("The Match ID you are submiting for.").setRequired(true)
            ).addAttachmentOption(option =>
                option.setName("pre-run").setDescription("The Screenshot of the Pre-run shop.").setRequired(true)
            ).addAttachmentOption(option =>
                option.setName("death").setDescription("The Screenshot of your death, or win screen.").setRequired(true)
            ).addAttachmentOption(option =>
                option.setName("players").setDescription("The Screenshot of all the players in the game.").setRequired(true)
            );
        }, async (interaction) => {
            await interaction.deferReply();

            const _user = (interaction.member == undefined) ? interaction.user : interaction.member.user;
            const matchInput = interaction.options.getInteger("match-id");
            const files = [interaction.options.getAttachment("pre-run"), interaction.options.getAttachment("death"), interaction.options.getAttachment("players")];

            const player_data = PlayersManager.GetPlayerData(_user.id);
            if (player_data == -1) {
                interaction.editReply({ content: "You need to make an account to be able to submit matches!\nPlease use `/register` with your Roblox ID to make an account!", ephemeral: true });
                return;
            }
            let hasMatchID = false;
            if (player_data.MatchesData != undefined) {
                for (let i=0; i < player_data.MatchesData.length; i++) {
                    if (player_data.MatchesData[i].MatchID != matchInput) continue;
                    hasMatchID = true;
                    break;
                }
            }

            if (!hasMatchID) {
                interaction.reply({ content: "You have not played this match!\n Please provide a Match you have played!", ephemeral: true });
                return;
            }

            let fields = [
                {
                  name: "Pre-Run Shop Attachment",
                  value: "This is what the reviewers will see when looking for Pre-Run Shop Attachment",
                  inline: false
                },
                {
                  name: "Overview Screen Attachment",
                  value: "This is what the reviewers will see when looking for Overview Attachment",
                  inline: false
                },
                {
                  name: "Player List Screen Attachment",
                  value: "This is what the reviewers will see when looking for Player List Attachment",
                  inline: false
                },
            ];
            
            let pagesData = [];
            for (let i=0; i < files.length; i++) {
                pagesData.push(new PagesEmbedData(null,
                `Match #${matchInput} - Submition Confromation`,
                "Please make sure the images are correct before submiting the data!", "#00b0f4", fields[i], null, true));
            }

            let embedPage = new Pages(interaction, "submition", pagesData, false);
            for (let i=0; i < embedPage.pages_embeds.length; i++) embedPage.pages_embeds[i].setImage(files[i].attachment);
            await interaction.editReply({ephemeral: embedPage.isEphemeral, embeds: [embedPage.pages_embeds[embedPage.curPage]], components: [embedPage.page_buttons.ActionRow]});
            
            const button = new Button(interaction.user.id, [
                new ButtonItems("final-submit", "Submit Information", ButtonStyle.Primary, null, null, false)
            ], async (id, buttonInteraction) => {
                if (ServerData.server_info.ReviewChannelID.value == undefined || ServerData.server_info.ReviewChannelID.value == "" || ServerData.server_info.ReviewChannelID.value == " ") {
                    buttonInteraction.reply(`Uh oh! Please Ping a Moderator and let them know they haven't properly set-up a channel for reviewing!`);
                    return;
                }
                await buttonInteraction.reply(`Sent Data to the moderators!`);
                let review_channel = await this.client.channels.fetch(ServerData.server_info.ReviewChannelID.value);
                review_channel.send("Yipee! Data send here");
            });
            interaction.followUp({content: "Once you have verified the data, please click the submit button. Otherwise use the `/submit` command again!", components: [button.ActionRow]});
        });
    }

    static async OnMatchEnd(player, matchThingy) {
        player.voice.setChannel(ServerData.server_info.QueueVC_ID.value); // QUEUE CHANNEL ID
        if (ServerData.server_info.QueueVC_ID.value == undefined || ServerData.server_info.QueueVC_ID.value == "" || ServerData.server_info.QueueVC_ID.value == " ") {
            player.voice.disconnect();
        }

        const playerData = PlayersManager.GetPlayerData(player.user.id);
        if (playerData === -1) {
            player.send("Hey! You played a match! Congrats on the game.\nIt seems you haven't made an 'account' yet!\n\nPlease Register in the Discord with `/register` so you can have your data saved!!");
            // SEND DATA TO MODS SAYING THIS USER SHOULD BE CROSSED OFF FROM THE LIST, AND THEY ARE NOT ELEGABLE FOR THE MATCH DATA!!
            return;
        }

        const fileSubmitCMDname = "/submit";
        const forgorCMDname = "/placeholder command !!";

        let ongoingMatch = matchThingy.ongoingMatch.clone();
        const matchID = ongoingMatch.MatchInfo.MatchID;
        
        let fieldString = "";
        for (let i=0; i < ongoingMatch.Players.length; i++) { fieldString += `${ongoingMatch.Players[i].user.globalName}\n`; }
        let fields = [
            {
                name: "Players Versed Against",
                value: fieldString,
                inline: true
            },
            {
                name: "Current Elo Rank",
                value: `${playerData.Elo}`,
                inline: true
            },
        ];

        let footer = {text: `Match #${matchID}`};

        let modifierString = "";
        if (ongoingMatch.MatchInfo.Modifiers != undefined) {
            if (ongoingMatch.MatchInfo.Modifiers.length > 1) {
                for (let i=0; i < ongoingMatch.MatchInfo.Modifiers.length; i++) { modifierString += `${ongoingMatch.MatchInfo.Modifiers[i]}` }
                fields.push({ name: "Modifiers", value: modifierString,  inline: true });
                footer.text = `Modifiers - ${ongoingMatch.MatchInfo.Modifiers.length} | ${footer.text}`;
            }
        }

        
        const embed = new EmbedBuilder()
        .setAuthor({
          name: `Ranked Doors - Match #${matchID}`,
        })
        .setTitle(`Submit Screenshots of Match #${matchID}`)
        .setDescription("Nice Game!\n\nTo *calculate* your new **Elo Rating**, please submit your screenshots you took in-game\nUse the `" + fileSubmitCMDname + "` to submit your files.\n\nIf you forgot to take a screenshot, or just didn't take any. Please use `" + forgorCMDname + "` to let the moderators know you don't have the screenshots.\n\n**It is possible to have a valid match when doing this.**\nIt will take a bit longer to verify but please make sure you do save your screenshots.\n\n**Don't know how to submit a screenshot?**\nIn Roblox, using `PrintScreen` will take a screenshot of roblox automatically, and you can view them at any time in `.png` format!")
        .addFields(fields)
        .setColor("#00b0f4")
        .setFooter(footer)
        .setTimestamp();

        PlayersManager.AddNewPlayerMatch(player.user.id, ongoingMatch.MatchInfo);
        // player.send({embeds: [embed]});
                            
        const newThread = await matchThingy.matchCommandChannel.threads.create({
            name: `${player.user.globalName} - ${ongoingMatch.MatchInfo.ModeInfo.Mode} (${ongoingMatch.MatchInfo.ModeInfo.RunType})`,
            autoArchiveDuration: 1440,
            type: ChannelType.PrivateThread,
            reason: `Ranked Match ${ongoingMatch.MatchInfo.ModeInfo.Mode} (${ongoingMatch.MatchInfo.ModeInfo.RunType}) - Completed | Needs Submission By User and Review`,
        });
        newThread.members.add(player.user.id);
        newThread.send({embeds: [embed]});
    }

    static matchDir = path.join(__dirname, 'MatchesData');
    static NewMatch() {
        let matchSave = new MatchData();
        matchSave.MatchID = this.ranked_matches;
        this.ranked_matches++;
        return matchSave;
    }

    static async UpdateMatchSave(match) {
        await fs.mkdir(this.matchDir, { recursive: true }, async (err) => {
            if (err) {
                console.error('File does not exist');
                _failed = true;
                return;
            }
            const fileName = path.join(this.matchDir, `${match.MatchID}.json`);
            await fs.writeFile(fileName, JSON.stringify(match), (err) => {
                if (err) {
                    console.error('Error writing to file:', err);
                    _failed = true;
                    return;
                }
            });
        });
    }

    static async GetAllMatches() {
        let jsonFiles = [];
        await fs.readdir(this.matchDir, async (err, files) => {
            if (err) {
                console.error('Error reading folder:', err);
                return;
            }
            jsonFiles = files.filter((file) => {
                const filePath = path.join(dir, file);
                const fileStat = fs.statSync(filePath);
                return fileStat.isFile() && path.extname(filePath).toLowerCase() === '.json';
            });
            console.log("Finished Getting Files");
        });
        console.log(jsonFiles);
    }
    

    static ModifiersText;
    static async _ModifiersAddon(interaction, match) {

        let ModifiersSelected = [];

        const button = new Button(interaction.member.user.id, [
            new ButtonItems("select", "Submit Modifiers", ButtonStyle.Primary, null, null, false)
        ]);

        let prevInteraction;

        const _selData = {id: "modifier", desc: "Click On A Modifier To Add"};
        const dropdownFunc = async (idx, id, interaction) => {
            const comp = interaction.message.components[idx].components[0].data.options;
            const value = interaction.values[0];
            let newComp = [];
            for (let i = 0; i < comp.length; i++) {
                if (comp[i].value === value) {
                    ModifiersSelected.push(value);
                    continue;
                }
                let o = new SelectionItems(comp[i].label, comp[i].description, comp[i].value);
                let select_menu = new StringSelectMenuOptionBuilder()
                    .setLabel(o.label)
                    .setDescription(o.desc)
                    .setValue(o.value);
                    if (o.emoji != undefined) select_menu.setEmoji(o.emoji);
                    if (o._default != undefined) select_menu.setDefault(o._default);
                newComp.push(select_menu);
            }
            if (newComp.length === 0) {
                prevInteraction.editReply({content: `Select A Modifier in the Dropbox\n${ModifiersSelected}`, ephemeral: true,
                    components: [button.ActionRow]});
                return;
            }
            const stringBuilder = new StringSelectMenuBuilder()
                .setCustomId(id)
                .setPlaceholder(_selData.desc)
                .addOptions(newComp);

            const bruh = new ActionRowBuilder().addComponents(stringBuilder);
            let theComps = [];
            for (let i=0; i < interaction.message.components.length; i++) {
                if (idx === i) {
                    theComps.push(bruh);
                    continue;
                }
                theComps.push(interaction.message.components[i]);
            }

            if (prevInteraction != undefined)
                prevInteraction.editReply({content: `Select A Modifier in the Dropbox\n${ModifiersSelected}`, ephemeral: true,
                    components: theComps});

            await interaction.deferReply({content: "dont mind this", ephemeral: true});
            interaction.deleteReply();
        };

        const items = this.chunkArray(this.ModifiersText, 25);
        let comps = [];
        for (let i=0; i < items.length; i++) {
            const sel = items[i];
            let drop = new Selection(interaction.member.user.id, `${i}-${_selData.id}`, _selData.desc, sel, (id, interaction) => dropdownFunc(i, id, interaction));
            comps.push(drop.ActionRow);
        }
        comps.push(button.ActionRow);

        const collectorFilter = i => {
            i.deferUpdate();
            return i.user.id === interaction.user.id;
        };
        let huh = await interaction.editReply({fetchReply: true, content: `Select A Modifier in the Dropbox\n${ModifiersSelected}`, ephemeral: true, components: comps});
        prevInteraction = interaction;
        await huh.awaitMessageComponent({ filter: collectorFilter, componentType: ComponentType.Button });
        return ModifiersSelected;
    }

    static chunkArray(array, chunkSize) {
        const result = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            result.push(array.slice(i, i + chunkSize));
        }
        return result;
    }
}

class OngoingMatchData {
    Channel = {};
    MatchInfo = new MatchData();
    
    /**
     * People in the VC
     */
    Players = [];

    constructor(Channel, MatchInfo, Players) {
        this.Channel = Channel;
        this.MatchInfo = MatchInfo;
        this.Players = Players;
    }

    clone() { return new OngoingMatchData(this.Channel, this.MatchInfo, this.Players); }
}

class MatchData {
    ValidData = false;
    Invalid = true; // If the admins didn't validate a match after a period of time, then invalidate the match. It will sill be under the verified Player's data though.

    MatchID = -1; // the ID of the match

    ReviewInfo = new ReviewData();
    DiscordInfo = new DiscordData(); // btw, this data shouldn't be included for the bot to display.
    Rank = 0; // Placement Data of the Player's Match.

    FloorInfo = new FloorData();
    ModeInfo = new ModeInfo();
    DeathInfo = new DeathData();
    GameInfo = new GameData();

    toJson() {
        return JSON.parse(JSON.stringify(this));
    }
}

class ReviewData {
    ValidData = false;

    TimeSubmitted = -1; // Unix Time when Player submitted the match data
    TimeReviewed = -1; // Unix Time when a Moderator started reviewing the match ID
    Accepted = false; // If the match was accepted by the moderator or not.

    Reviewer = "N / A"; // Discord Name + Discord @ ("PooPooFard (@JerrySmith)") of the Player reviewing data
    Feedback = ""; // Mmoderator's feedback
}

class DiscordData {
    Attachments = []; // Array of URL attachment, for reviewing.
}

class ModeInfo {
    DataValid = false; // If the data is just junk data or actually valid data.

    Mode = "Normal"; // For other types of modes like Modifiers, SUPER HARD MODE, etc.
    
    Players = 0; // How may players in the game
    AlivePlayers = 0; // How Many Players came out alive
    RunType = "No Shop"; // No Shop, Shop, etc.
    Modifiers = []; // Array of string of modifier Names used (If Mode was Modifiers)
}

class FloorData {
    ValidData = false;

    VisitedFloors = ["Floor 1"];
}

class DeathData {
    DataValid = false; // If the data is just junk data or actually valid data.

    Died = false; // If the player Died that round
    Door = 0; // Door Player made to
    Cause = "N / A";
}

class GameData {
    DataValid = false; // If the data is just junk data or actually valid data.

    KnobsSpent = 0; // If played Shop, how much they spent in game
    KnobsGained = 0; // How much Knobs the player gained that match
    GoldFound = 0; // How much Gold the player gained that mach
    FriendsBonus = 0; // If there was any friends playing with Player
    Multiplier = 1; // Knob Multiplier
}



class ModifiersTypes {
    // -- Gameplay -- 
    // Random Modifiers
    UhOh = "Activates a random modifier.";
    HowUnfortunate = "Activates 3 random modifiers.";
    ChaosChaos = "Activates 5 random modifiers.";

    // Lighting
    LightsOn = "Less rooms will be dark.";
    ElectricalWork = "Lights will never flicker or break. Includes entity warnings.";
    BadElectricalWork = "More rooms will be dark. Lights will occasionally flicker and break.";
    PowerShortage = "Most rooms will be dark, even during attacks. Light flicker and break.";
    LightsOut = "All rooms will be completely dark. Have fun!";

    // Gold
    ElGoblinoOnBreak = "More gold can be found.";
    ElGoblinoWasHere = "Less gold can be found.";
    ElGoblinosPayday = "No gold can be found.";

    // Items
    MoreStuff = "More items can be found.";
    LessStuff = "Less items can be found.";
    WearAndTear = "Items have significantly less durability and/or uses.";
    OutOfStuff = "Non-essential items and pickups cannot be found.";

    // Guiding Light
    GoneFishing = "Most glowing hints are disabled.";
    Soundproofing = "Keys, books and other similar pickups no longer emit a shimmering noise.";

    // Hotel
    WetFloor = "The floor is slippery.";
    BadVentilation = "Adds fog, significantly limiting vision.";
    LockedAndLoaded = "Increases chance of locked rooms. Has a chance to lock normal rooms.";
    KeyKeyKeyKey = "Almost all rooms are locked.";

    // Hiding
    NowhereToHide = "Hiding spots are no longer guaranteed for everyone.";

    // Audio
    Jammin = "Plays some music to soothe the nerves. All other audio is muffled.";

    // Health
    Tripped = "Enter with 50% health. It can be healed back.";
    TrippedAndFell = "Enter with 10% health. It can be healed back.";
    LastFewBreaths = "Enter with 50% MAX health.";
    LastBreath = "All damage (except for non-fatal) results in an immediate death.";

    // Movement Speed
    DidntSkipLegDay = "Movement speed is faster.";
    FasterFasterFaster = "Movement speed is significantly faster.";
    MAXIMUMOVERDRIVE = "Movement speed is incredibly fast.";
    MyKneesAreKillingMe = "Crouching is significantly slower.";
    MyLegsAreKillingMe = "Movement speed is significantly slower.";
    Injuries = "Missing health will also reduce speed.";

    // Entity Spawning
    GoodTime = "Most entities will attack less often.";
    BadTime = "Most entities will attack more often.";
    ReallyBadTime = "Most entities will attack much more often.";
    WorstTimeEver = "Entities will unfairly attack constantly.";

    // -- Entities --
    // Rush
    RushHour = "Rush will attack more often.";
    ImRunninHere = "Rush will move quicker.";
    ImTipToeinHere = "Rush will emit no sound.";

    // Dupe
    WrongNumber = "Dupe will spawn more and increase in difficulty.";
    BattleOfWits = "Dupe will almost always spawn and is set to maximum difficulty.";

    // Screech
    ImEverywhere = "Screech can attack in any room.";
    ThinkFast = "Screech will attack more and give less time to react.";
    ThinkFaster = "Screech will attack much more and give even less time to react.";

    // Timmothy
    BugSpray = "Timothy is nowhere to be found :(";
    Itchy = "Timothy will attack more often. Its bite can be fatal.";

    // Eyes
    Nosey = "Eyes will spawn more.";
    AlwaysWatching = "Eyes will always spawn.";
    SeeingDouble = "Two sets of Eyes will always spawn.";
    FourEyes = "Four sets of Eyes will always spawn.";

    // Figure
    ComeBackHere = "Figure is faster.";

    // Seek
    ItCanRunToo = "Seek runs unfairly fast.";

    // Ambush
    BackForSeconds = "Ambush will attack more.";
    AgainAndAgainAndAgain = "Ambush will endlessly attack.";
    Afterimage = "Ambush will attack faster.";

    // Hide
    RentsDue = "Hide will attack as fast as possible.";

    // Hault
    Roundabout = "Halt is guaranteed to attack, and is significantly more difficult.";

    // Snare
    WatchYourStep = "Snare occasionally spawns throughout the floor.";
    AreThosePancakes = "Snare spawns in multiples throughout the floor.";
    ILovePancakes = "There are too many Snares. Its attack can now be fatal.";
    // -- Misc --
    VoiceActing = "Replicates the April Fools 2024 voicelines.";

    // -- The Rooms --
    StopRightThere = "A-90 from The Rooms has a chance to attack.";
    RoomForMore = "All entities from The Rooms have a chance to attack.";

    // Soon
    // Backdoor = "Timer Levers and Haste are implemented in The Hotel."

    toSelectionItems() {
        const json = JSON.parse(JSON.stringify(this));
        let selectionData = [];
        Object.keys(json).forEach((key) => {
            let _key = key.replace(/([A-Z])/g, ' $1').trim();
            if (key === "MAXIMUMOVERDRIVE") _key = "MAXIMUM OVERDRIVE";
            selectionData.push(new SelectionItems(_key, json[key], key));
        });
        return selectionData;
    }
}

module.exports = {RankedMatches, MatchData, ReviewData, DiscordData, ModeInfo, FloorData, DeathData, GameData};