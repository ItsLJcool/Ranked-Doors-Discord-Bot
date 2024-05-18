
const {TextInputBuilder, AttachmentBuilder, ButtonBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder} = require("discord.js");
const fs = require('fs');
const path = require('path');
const EventsHelper = require("./EventsHelper");

const {PlayersManager} = require("./PlayerData");

const {ServerData, ServerSaveData} = require("./ServerData");

const {Selection, SelectionItems} = require("./MessagesUtil/Selection");

const {Button, ButtonItems} = require("./MessagesUtil/Button");
const {Pages, PagesEmbedData} = require("./MessagesUtil/Pages");
const EloRankHelper = require("./EloRankHelper");

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

    static init(_client) {
        this.client = _client;
        this.ModifiersText = new ModifiersTypes().toSelectionItems();
        this.MatchesToBeReviewed = new Map();
        

        fs.readdir(this.matchDir, async (err, files) => {
            if (err) {
                console.error('Error reading folder:', err);
                return;
            }
            const jsonFiles = files.filter((file) => {
                const filePath = path.join(this.matchDir, file);
                const fileStat = fs.statSync(filePath);
                return fileStat.isFile() && path.extname(filePath).toLowerCase() === '.json';
            });
            let matchesPlayed = files.filter((file) => {
                const filePath = path.join(this.matchDir, file);
                const fileStat = fs.statSync(filePath);
                return fileStat.isFile() && path.extname(filePath).toLowerCase() === '.match';
            });

            if (matchesPlayed.length == 0) { // means the file doesn't exist...
                matchesPlayed = ['0.match'];
                await fs.writeFile(path.join(this.matchDir, "0.match"), "", async (err) => {
                    if (err) {
                        console.error('Error writing to file:', err);
                        return;
                    }
                });
            }
            matchesPlayed = parseInt(matchesPlayed[0].substring(0, matchesPlayed[0].lastIndexOf('.')));
            this.ranked_matches = matchesPlayed;
        });

        EventsHelper.addCommand("verify", "(ROLE SPECIFIC) | Verify Match Data", (command) => {
            command.addSubcommand(subcommand =>
                subcommand.setName('user').setDescription("Verify a User's Specific MatchData")
                    .addIntegerOption(option =>
                        option.setName("match-id").setDescription("The Match ID you are going to verify").setRequired(true)
                    ).addUserOption(option =>
                        option.setName("user").setDescription("The User's data to verify").setRequired(true)
                    )
            ).addSubcommand(subcommand =>
                subcommand.setName('match').setDescription("Verify a Match's Data")
                    .addIntegerOption(option =>
                        option.setName("match-id").setDescription("The Match ID you are going to verify").setRequired(true)
                    )
            );
        }, async (interaction) => {
            if (!interaction.member.roles.cache.has(ServerData.server_info.ReviewRoleID.value)) {
                interaction.reply({ephemeral: true, content: `You do not have the <@&${ServerData.server_info.ReviewRoleID.value}> Role!`});
                return;
            }
            await interaction.deferReply();

            switch (interaction.options.getSubcommand().toLowerCase()) {
                case "user":
                    await this.VerifyUserMatch(interaction);
                    break;
                case "match":
                    await this.VerifyMatch(interaction);
                    break;
            }
        });

        EventsHelper.addCommand("matchmake", "Start A New Ranked Match", (command) => {
            command.addStringOption((option) => {
                option.setName("mode")
                .setDescription("Display to others what mode this will be in")
                .setRequired((this.PossibleRankedModes.length > 1));
                EventsHelper.AddChoices(option, this.PossibleRankedModes);
                return option;
            }).addStringOption(option => {
                option.setName("floor")
                .setDescription("What floor you want to play ranked on")
                .setRequired((this.PossibleRankedFloors.length > 1));
                EventsHelper.AddChoices(option, this.PossibleRankedFloors);
                return option;
            }).addStringOption(option => {
                option.setName("run")
                .setDescription("What Run Type it is")
                .setRequired((this.PossibleRankedRunTypes.length > 1));
                EventsHelper.AddChoices(option, this.PossibleRankedRunTypes);
                return option;
            });
        },
        async (interaction) => {
            if (ServerData.server_info.MatchmakingChannel.value != undefined || ServerData.server_info.MatchmakingChannel.value == "" || ServerData.server_info.MatchmakingChannel.value == " ") {
                if (interaction.channelId != ServerData.server_info.MatchmakingChannel.value) {
                    interaction.reply({content: `You can only use this command in the <#${ServerData.server_info.MatchmakingChannel.value}> channel!`, ephemeral: true});
                    return;
                }
            }

            if (PlayersManager.GetPlayerData(interaction.user.id) == -1) {
                interaction.reply({content: "You need to create a profile first!\nPlease do `/register`!", ephemeral: true});
                return;
            }
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
                new ButtonItems("end match", "End Match (HOST)", ButtonStyle.Danger, null, null, true),
                new ButtonItems("cancel match", "Cancel Match (HOST)", ButtonStyle.Danger, null, null, true)
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
                                // Start Match - Player Minimum
                                buttonInteraction.reply({content: "There isn't enough players to start!", ephemeral: true});
                                return;
                            }
                            EventsHelper.removeVC_Callback(matchThingy.channel.id);
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

                            matchThingy.ongoingMatch.MatchInfo.DiscordInfo.PlayerDiscordIDs = [...matchThingy.channel.members.keys()];
                            buttonInteraction.reply({content: "Match Started!\nWhen the game is over, make sure to click the End Match button!", ephemeral: true});
                            return;
                        }
                        break;
                    case "end match":
                        for (let i=0; i < this.CurrentMatches.length; i++) {
                            const matchThingy = this.CurrentMatches[i];
                            if (matchThingy.createdUserID != buttonInteraction.member.user.id) continue;
                            EventsHelper.addVC_Callback(matchThingy.channel.id, (oldState, newState, type) => {
                                if (matchThingy.channel.members.size <= 0) {
                                    EventsHelper.removeVC_Callback(matchThingy.channel.id);
                                    matchThingy.channel.delete();
                                }
                            });
                            matchThingy.ongoingMatch.MatchInfo.ReviewInfo.TimeEnded = Math.floor(Date.now() / 1000);
                            await this.UpdateMatchSave(matchThingy.ongoingMatch.MatchInfo);
                            await matchThingy.ongoingMatch.Players.forEach(async (player) => this.OnMatchEnd(player, matchThingy));
                            this.CurrentMatches.splice(i, 1);
                            message.delete();
                            return;
                        }
                        break;
                    case "cancel match":
                        console.log("cancel match");
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
                        if (type == "moved" && newState.channelId == oldState.channelId) return;
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
                        message.edit({embeds: [MatchMake_Embed], components: message.components});
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
            const matchInput = interaction.options.getInteger("match-id");
            let match_data = await this.GetMatchData(matchInput);
            if (match_data == -1) {
                interaction.reply({ephemeral: true, content: "This match doesn't exist!"});
                return;
            }
            let review_channel = await this.client.channels.fetch(ServerData.server_info.ReviewChannelID.value);
            const reviewThread = await review_channel.threads.fetch(match_data.ReviewInfo.ThreadID);
            if (reviewThread.archived) {
                interaction.reply({ephemeral: true, content: "This match has been reviewed and Submitted! You can no longer edit the changes of this match submition."});
                return;
            }
            const channelMatchmaking = await EventsHelper.client.channels.cache.filter(x => (x.isThread() && x.parentId == ServerData.server_info.MatchmakingChannel.value));
            let inThreadedChannel = false;
            for (const id of channelMatchmaking.keys()) {
                if (id == interaction.channelId) {
                    inThreadedChannel = true;
                    break;
                }
            }
            if (!inThreadedChannel) {
                interaction.reply({ content: `You must use this command in the <#${ServerData.server_info.MatchmakingChannel.value}> threads only!!`, ephemeral: true });
                return;
            }
            await interaction.deferReply({content: "Getting the bot ready..."});

            const _user = (interaction.member == undefined) ? interaction.user : interaction.member.user;
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
                interaction.editReply({ content: "You have not played this match!\n Please provide a Match you have played!", ephemeral: true });
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
                `Match #${matchInput} - Submition Confirm`,
                "Please make sure the images are correct before submiting the data!", "#00b0f4", fields[i], null, true));
            }

            let embedPage = new Pages(interaction, "submition", pagesData, false);
            for (let i=0; i < embedPage.pages_embeds.length; i++) embedPage.pages_embeds[i].setImage(files[i].attachment);
            await interaction.editReply({ephemeral: embedPage.isEphemeral, embeds: [embedPage.pages_embeds[embedPage.curPage]], components: [embedPage.page_buttons.ActionRow]});
            
            let followUpReply = null;
            const button = new Button(interaction.user.id, [
                new ButtonItems("final-submit", "Submit Information", ButtonStyle.Primary, null, null, false)
            ], async (id, buttonInteraction) => {
                if (followUpReply != undefined) await followUpReply.delete();
                await buttonInteraction.deferReply({content: "Saving pictures, and sending them to moderators!"});
                if (ServerData.server_info.ReviewChannelID.value == undefined || ServerData.server_info.ReviewChannelID.value == "" || ServerData.server_info.ReviewChannelID.value == " ") {
                    buttonInteraction.editReply(`Uh oh! Please Ping a Moderator and let them know they haven't properly set-up a channel for reviewing!`);
                    return;
                }

                for (let i=0; i < files.length; i++) {
                    if (!files[i].contentType.includes("image/")) {
                        buttonInteraction.editReply(`Uh oh! You uploaded a non-picture to the bot! Please make sure you upload a picture and not a video or a gif.\n**IT MUST BE A .PNG!!!**\nThis is because the picture you take in-game will always be a .png!!`);
                        return;
                    }
                }

                match_data.DiscordInfo.Attachments[buttonInteraction.user.id] = files;

                let review_channel = await this.client.channels.fetch(ServerData.server_info.ReviewChannelID.value);
                if (match_data.ReviewInfo.ThreadID == -1) {
                    const newReviewThread = await review_channel.threads.create({
                        name: `Match #${matchInput}`,
                        autoArchiveDuration: 1440,
                        type: ChannelType.PublicThread,
                        reason: `Review Channel for Match #${matchInput}`,
                    });
                    match_data.ReviewInfo.ThreadID = newReviewThread.id;
                }
                const reviewThread = await review_channel.threads.fetch(match_data.ReviewInfo.ThreadID);

                await this.UpdateMatchSave(match_data);

                let changeData = false;
                let test = await reviewThread.messages.fetch();
                test.forEach(x => {
                    if (x.content.split(": ")[1] == buttonInteraction.user.id) {
                        changeData = true;
                        x.edit({content: x.content, files: files});
                    }
                });

                if (changeData) await buttonInteraction.editReply(`Data Edited! Reflected to moderators`);
                else {
                    await reviewThread.send({content: `User's Global Name - ${buttonInteraction.user.globalName} | User ID: ${buttonInteraction.user.id}`, files: files});
                    buttonInteraction.editReply(`Sent Data to the moderators!`);
                }

            });
            followUpReply = await interaction.followUp({fetchReply: true, content: "Once you have verified the data, please click the submit button. Otherwise use the `/submit` command again!", components: [button.ActionRow]});
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

        let ongoingMatch = matchThingy.ongoingMatch;
        const matchID = ongoingMatch.MatchInfo.MatchID;
        
        let fieldString = "";
        for (let i=0; i < ongoingMatch.Players.length; i++) { fieldString += `${ongoingMatch.Players[i].user.globalName}\n`; }
        let fields = [
            {
                name: "Players Versed Against",
                value: fieldString,
                inline: true
            },
        ];
        fields = fields.concat(Object.entries(playerData.Elo).map(([name, value]) => ({ name: `${name} Elo:`, value: `${value}`, inline: true })));

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
        .setDescription("Nice Game!\n\nTo *calculate* your new **Elo Rating**, please submit your screenshots you took in-game\nUse the `" + fileSubmitCMDname + "` to submit your files.\n\nIf you forgot to take a screenshot, or just didn't take any. Please use let the moderators know you don't have the screenshots.\n\n**It is possible to have a valid match when doing this.**\nIt will take a bit longer to verify but please make sure you do save your screenshots.\n\n**Don't know how to submit a screenshot?**\nIn Roblox, using `PrintScreen` will take a screenshot of roblox automatically, and you can view them at any time in your file system.\n\nWhats a Match ID? Well when you see something like 'Match #12', the Number will the the 'ID' Of the match.")
        .addFields(fields)
        .setColor("#00b0f4")
        .setFooter(footer)
        .setTimestamp();

        let player_matchData = new PlayerMatchData();
        player_matchData.MatchID = matchID;
        PlayersManager.AddNewPlayerMatch(player.user.id, player_matchData);
                            
        const newThread = await matchThingy.matchCommandChannel.threads.create({
            name: `${player.user.globalName} - Match #${matchID} | ${ongoingMatch.MatchInfo.ModeInfo.Mode} (${ongoingMatch.MatchInfo.ModeInfo.RunType})`,
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
        const matchPlayesFilePath = path.join(this.matchDir, `${this.ranked_matches}.match`);
        this.ranked_matches++;
        const NEWmatchPlayesFilePath = path.join(this.matchDir, `${this.ranked_matches}.match`);
        fs.rename(matchPlayesFilePath, NEWmatchPlayesFilePath, (err) => {
            if (err) console.log(err);
        });
        return matchSave;
    }

    static async UpdateMatchSave(match) {
        if (match == undefined) {
            console.error("Undefined Match Data");
            return;
        }
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
        return jsonFiles;
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

    /**
     * This will return if the inputed MatchID has all of the User's MatchData Verified, and the MatchData itself
     */
    static async CheckMatchDataReviewed(matchID) {

        const matchData = await this.GetMatchData(matchID);
        if (matchData == -1) return {players: false, check: false, reason: "Match ID Doesn't exist"}; // no match was found
        const playerIDs = matchData.DiscordInfo.PlayerDiscordIDs;
        
        // Now we loop though all the items in the array, and check if their data has been validated
        for (let i=0; i < playerIDs.length; i++) {
            const playerData = await PlayersManager.GetPlayerData(playerIDs[i]);
            const playerMatch = await PlayersManager.GetPlayerMatchData(playerData, matchID);
            if (playerData == -1) return {players: false, check: false, reason: `Player with ID: ${playerIDs[i]} doesnt exist...? what?`};
            if (playerMatch == -1) return {players: false, check: false, reason: `Player with ID: ${playerIDs[i]} does not have the Data for this match.... huh?`}; // a player doesn't have data for this match... somehow?
            if (!playerMatch.ValidData) return {players: false, check: false, reason: `Player with ID: ${playerIDs[i]} does not have Valid MatchData. Please use /verify user to verify their data`};
        }
        if (!matchData.ValidData) return {players: true, check: false, reason: "MatchData hasn't been Verified yet. Please use /verify match to verify the data."};
        return {players: true, check: true};
    }

    static async AllDataVerified(match_data) {
        
        let review_channel = await this.client.channels.fetch(ServerData.server_info.ReviewChannelID.value);
        const reviewThread = await review_channel.threads.fetch(match_data.ReviewInfo.ThreadID);
        if (reviewThread.archived || reviewThread.hasMore == false) return;

        await reviewThread.send(`# This match has been validated by: <@${match_data.ReviewInfo.Reviewer}> | Other Reviewers can change the data, but only if needed.`);
        await reviewThread.setLocked(true);
        await reviewThread.setArchived(true);

        let playerRankingDoors = new Map();
        let playerEloRound = new Map();
        for (let i=0; i < match_data.DiscordInfo.PlayerDiscordIDs.length; i++) {
            const playerID = match_data.DiscordInfo.PlayerDiscordIDs[i];
            const playerData = PlayersManager.GetPlayerData(playerID);
            const curMatch = PlayersManager.GetPlayerMatchData(playerData, match_data.MatchID);
            playerRankingDoors.set(playerID, curMatch.DeathInfo.Door);
            playerEloRound.set(playerID, playerData.Elo[match_data.ModeInfo.Mode]);
            curMatch.EloStats = {};
            curMatch.EloStats.PrevElo = {};
            curMatch.EloStats.NewElo = {};

            Object.keys(playerData.Elo).forEach((key) => { curMatch.EloStats.PrevElo[key] = playerData.Elo[key]; });
            PlayersManager.UpdateStoredData();
        }

        const rankMap = EloRankHelper.DoorNumberToRanking(playerRankingDoors);
        const newThing = EloRankHelper.eloMapTest(playerEloRound, rankMap);

        newThing.forEach((value, key) => {
            console.log(key, value);
            let playerData = PlayersManager.GetPlayerData(key);
            let curMatch = PlayersManager.GetPlayerMatchData(playerData, match_data.MatchID);
            playerData.Elo[match_data.ModeInfo.Mode] = value;
            curMatch.Rank = rankMap.get(key);

            if (curMatch.DeathInfo.Died) playerData.Deaths = parseInt(playerData.Deaths) + 1; // ensuring its 100% an int
            if (curMatch.GameInfo.KnobsSpent != "N / A" && !isNaN(parseInt(curMatch.GameInfo.KnobsSpent))) playerData.KnobsSpent += parseInt(curMatch.GameInfo.KnobsSpent);
            if (curMatch.GameInfo.KnobsGained != "N / A" && !isNaN(parseInt(curMatch.GameInfo.KnobsGained))) playerData.KnobsEarned += parseInt(curMatch.GameInfo.KnobsGained);

            Object.keys(playerData.Elo).forEach((key) => { curMatch.EloStats.NewElo[key] = playerData.Elo[key]; });
            PlayersManager.UpdateStoredData();
        });
    }


    static GetMatchData(matchID) {
        try {
            // Parse the file contents as JSON
            const jsonContent = JSON.parse(fs.readFileSync(`${this.matchDir}/${matchID}.json`, 'utf8'));
            return jsonContent;
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return -1;
        }
    }

    // Verification functions
    static async VerifyUserMatch(interaction) {
        const userInput = interaction.options.getUser("user");
        const matchInput = interaction.options.getInteger("match-id");

        let playerInfo = PlayersManager.GetPlayerData(userInput.id);
        
        if (playerInfo == -1) {
            interaction.editReply({ephemeral: true, content: `This User does **NOT** Have a Ranked Account!`});
            return;
        }

        let hasMatch = false;
        let player_matchData = -1;
        let player_matchIDX = -1;
        for (let i=0; i < playerInfo.MatchesData.length; i++) {
            if (playerInfo.MatchesData[i].MatchID == matchInput) {
                hasMatch = true;
                player_matchData = playerInfo.MatchesData[i];
                player_matchIDX = i;
                break;
            }
        }

        if (!hasMatch || player_matchData === -1 || player_matchIDX === -1) {
            interaction.editReply({ephemeral: true, content: "User had **NOT** Played this match! Please Provide a match they have played!"});
            return;
        }

        let can_submitData = {
            valid: true,
            reason: "N / A"
        };

        const checkValueNaN = (value, error) => {
            if (value == "N / A") return "N / A";
            const int_value = parseInt(value);
            if (isNaN(int_value)) {
                can_submitData.valid = false;
                can_submitData.reason = `Invalid Integer Value in **${error}**`;
            }
            else value = int_value;
            return value;
        }

        let pageFields = [
        [
        {name: "Reached Door #", inline: true, value: `${player_matchData.DeathInfo.Door}`, setFunc: (value) => {
            player_matchData.DeathInfo.Door = (value = checkValueNaN(value, "Door # | Please make sure its an Integer! If it uses something like A-1000, it will automatically update once verified"));; }},

        {name: "Player Died In Run?", inline: true, value: `${player_matchData.DeathInfo.Died}`, setFunc: (value) => {
            if (value == "true") value = true;
            else if (value == "false") value = false;
            else {
                can_submitData.valid = false;
                can_submitData.reason = "Invalid Boolean: **Player Died In Run?**"
            }
            player_matchData.DeathInfo.Died = value; }},

        {name: "Cause of Death?", inline: true, value: `${player_matchData.DeathInfo.Cause}`, setFunc: (value) => {
            player_matchData.DeathInfo.Cause = value; }},
        ],[
        {name: "Knobs Spent", inline: true, value: `${player_matchData.GameInfo.KnobsSpent}`, setFunc: (value) => {
            player_matchData.GameInfo.KnobsSpent = (value = checkValueNaN(value, "Knobs Spent")); }},

        {name: "Knobs Gained", inline: true, value: `${player_matchData.GameInfo.KnobsGained}`, setFunc: (value) => {
            player_matchData.GameInfo.KnobsGained = (value = checkValueNaN(value, "Knobs Gained")); }},

        {name: "Gold Found", inline: true, value: `${player_matchData.GameInfo.GoldFound}`, setFunc: (value) => {
            player_matchData.GameInfo.GoldFound = (value = checkValueNaN(value, "Gold Found")); }},

        {name: "Friends Bonus", inline: true, value: `${player_matchData.GameInfo.FriendsBonus}`, setFunc: (value) => {
            player_matchData.GameInfo.FriendsBonus = (value = checkValueNaN(value, "Friends Bonus")); }},

        {name: "Multiplier", inline: true, value: `${player_matchData.GameInfo.Multiplier}`, setFunc: (value) => {
            player_matchData.GameInfo.Multiplier = (value = checkValueNaN(value, "Multiplier")); }},
        ]
        ];
        
        let pagesData = [];
        for (let i=0; i < pageFields.length; i++) {
            pagesData.push(new PagesEmbedData({name: `${interaction.user.globalName}`}, `Match #${matchInput} - Verifying Information`,
            "Use the dropdown box to select a property to edit, please ensure the information is accurate as possible\n"+
            `If the user doesn't have the proper information, join their thread with the match ID in the <#${ServerData.server_info.MatchmakingChannel.value}> and inform them about what information they need to provide`, "#00b0f4",
            pageFields[i], null, true));
        }
        
        let dropboxSelection = [];
        for (let i=0; i < pageFields.length; i++) {
            let pushArry = [];
            for (let j=0; j < pageFields[i].length; j++) pushArry.push(new SelectionItems(pageFields[i][j].name, `${pageFields[i][j].value}`, `${i}_${j}`));
            dropboxSelection.push(pushArry);
        }

        const button = new Button(interaction.user.id, [
            new ButtonItems("review-submit", "Submit Review", ButtonStyle.Danger, null, null, false)
        ], async (id, buttonInteraction) => {
            if (buttonInteraction.user.id != interaction.user.id) {
                buttonInteraction.reply({content: "You can't use this button!", ephemeral: true});
                return;
            }
            await buttonInteraction.deferReply({ephemeral: true});

            for (let i=0; i < pageFields.length; i++) {
                for (let j=0; j < pageFields[i].length; j++) {
                    pageFields[i][j].setFunc(pageFields[i][j].value);
                    if (!can_submitData.valid) break;
                }
            }
            if (!can_submitData.valid) {
                buttonInteraction.editReply({ephemeral: true,
                content: `Uh oh! It looks like you provided values that are not applicable to the data!\n\n${can_submitData.reason}`});
                return;
            }
            interaction.deleteReply();
            
            player_matchData.ValidData = true;
            player_matchData.DeathInfo.ValidData = true;
            player_matchData.GameInfo.ValidData = true;

            PlayersManager.UpdateStoredData();

            await buttonInteraction.editReply({content: "Data has been validated!", ephemeral: true});
        });

        let dropdown = null;
        let verifyPage = null;
        let dropdownCallbackVerify = async (id, dropInteraction) => {
            if (id.split("_")[1] != dropInteraction.user.id) {
                dropInteraction.reply({content: "You are not the person who used this command!", ephemeral: true});
                return;
            }
            
            await interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: []});

            let idxs = dropInteraction.values[0].split("_");
            idxs[0] = parseInt(idxs[0]); idxs[1] = parseInt(idxs[1]);

            let completeFunc = () => {
                can_submitData.valid = true;
                verifyPage.pages_embeds[idxs[0]].data.fields = pageFields[idxs[0]];

                interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
            }
            
            const cancelButton = new Button(dropInteraction.user.id, [
                new ButtonItems("cancel-review-edit", "Cancel", ButtonStyle.Danger, null, null, false)
            ], async (id, buttonInteraction) => {
                if (buttonInteraction.user.id != interaction.user.id) {
                    buttonInteraction.reply({content: "You are not the person who used this command!", ephemeral: true});
                    return;
                }
                dropInteraction.deleteReply();
                completeFunc();
            });

            await dropInteraction.reply({components: [cancelButton.ActionRow], content: `<@${dropInteraction.user.id}>\nReply to this message to set the information with what you reply with`});
            const idxThing = `verifyChat-${dropInteraction.user.id}`;
            EventsHelper.addChatCommand(idxThing, idxThing, async (messageInteraction) => {
                if (dropInteraction.user.id != messageInteraction.author.id) return;
                const value = await messageInteraction.content;
                messageInteraction.delete();
                try {
                    dropInteraction.deleteReply();
                    EventsHelper.removeChatCommand(idxThing);
                } catch(e) {
                    console.error(e);
                    EventsHelper.removeChatCommand(idxThing);
                    return dropInteraction.followUp("Sorry! Looks like an error occured.");
                }
                
                pageFields[idxs[0]][idxs[1]].value = value;
                
                dropboxSelection = [];
                for (let i=0; i < pageFields.length; i++) {
                    let pushArry = [];
                    for (let j=0; j < pageFields[i].length; j++) pushArry.push(new SelectionItems(pageFields[i][j].name, `${pageFields[i][j].value}`, `${i}_${j}`));
                    dropboxSelection.push(pushArry);
                }
                dropdown = new Selection(interaction.user.id, "verify-drop", placeholderText, dropboxSelection[verifyPage.curPage], dropdownCallbackVerify);
                completeFunc();
            });
        }

        const placeholderText = "Select Data To Edit";
        dropdown = new Selection(interaction.user.id, "verify-drop", placeholderText, dropboxSelection[0], dropdownCallbackVerify);

        verifyPage = new Pages(interaction, "verification", pagesData, false, async (id, pageInteraction) => {
            dropdown = new Selection(interaction.user.id, "verify-drop", placeholderText, dropboxSelection[verifyPage.curPage], dropdownCallbackVerify);
            await interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
        });

        let contentValue = (player_matchData.ValidData) ? "# This data has been validated by another member! If you think the values are incorrect, you may edit it!" : " ";
        await interaction.editReply({content: contentValue, embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
    }

    static async VerifyMatch(interaction) {
        const matchInput = interaction.options.getInteger("match-id");
        let match_data = this.GetMatchData(matchInput);
        if (match_data === -1) {
            interaction.editReply({ephemeral: true, content: `This match has NOT been played. Please enter a valid Match #`});
            return;
        }
        const playersValid = await this.CheckMatchDataReviewed(matchInput);
        if (!playersValid.players) {
            let playersToValidate = [];
            let players = "";
            const matchData = await this.GetMatchData(matchInput);
            if (matchData != -1) {
                const playerIDs = matchData.DiscordInfo.PlayerDiscordIDs;
                for (let i=0; i < playerIDs.length; i++) {
                    const playerData = await PlayersManager.GetPlayerData(playerIDs[i]);
                    const playerMatch = await PlayersManager.GetPlayerMatchData(playerData, matchInput);
                    if (playerMatch == -1 || playerData == -1 || playerMatch.ValidData) continue;
                    playersToValidate.push(playerData.DiscordName);
                }
                players = playersToValidate.join(", ");
            }
            await interaction.deleteReply();
            await interaction.followUp({fetchReply: true, ephemeral: true, content: '## Please verify all the users of this match before verifying this match data!\nWho Needs to be Verified:\n```' + players + '```'});
            return;
        }

        let can_submitData = {
            valid: true,
            reason: "N / A"
        };

        const checkValueNaN = (value, error) => {
            const int_value = parseInt(value);
            if (isNaN(int_value)) {
                can_submitData.valid = false;
                can_submitData.reason = `Invalid Integer Value in **${error}**`;
            }
            else value = int_value;
            return value;
        }

        const modifier_placeholder = (match_data.ModeInfo.Modifiers.length > 0) ? match_data.ModeInfo.Modifiers.join(",") : "N / A";

        let pageFields = [
        [
        {name: "Invalidate Match", inline: true, value: `${match_data.Invalid}`, setFunc: (value) => {
            if (value === "true") value = true;
            else value = false;
            match_data.Invalid = value; }},
        {name: "Accept Match", inline: true, value: `${match_data.ReviewInfo.Accepted}`, setFunc: (value) => {
            if (value === "true") value = true;
            else value = false;
            match_data.ReviewInfo.Accepted = value; }},
        {name: "Visited Floors (Array)", inline: true, value: `${match_data.FloorInfo.VisitedFloors.join(", ")}`, setFunc: (value) => {
            let arryValue = "";
            if (can_submitData.valid) {
                arryValue = value.split(",").map(item => item.trim());
                for (let i=0; i < arryValue.length; i++) {
                    if (!can_submitData.valid) break;
                    for (let j=0; j < this.PossibleRankedFloors.length; j++) {
                        if (this.PossibleRankedFloors[j].name === arryValue[i]) {
                            can_submitData.valid = true;
                            break;
                        }
                        can_submitData.valid = false;
                        can_submitData.reason = `# Error: Visited Floors\n**${arryValue[i]}** needs to be a value of one of these:\n${this.PossibleRankedFloors.map(item => item.name).join(", or ")}`;
                    }
                }
            }
            match_data.FloorInfo.VisitedFloors = arryValue; }},

        {name: "Mode (Shop / No Shop, etc.)", inline: true, value: `${match_data.ModeInfo.Mode}`, setFunc: (value) => {
            if (can_submitData.valid) {
                for (let i=0; i < this.PossibleRankedModes.length; i++) {
                    if (this.PossibleRankedModes[i].name === value) {
                        can_submitData.valid = true;
                        break;
                    }
                    can_submitData.valid = false;
                    can_submitData.reason = `# Error: Mode\n**${value}** needs to be a value of one of these:\n${this.PossibleRankedModes.map(item => item.name).join(", or ")}`;
                }
            }
            match_data.ModeInfo.Mode = value; }},
            
        {name: "Run Type (Normal, SUPER HARD MODE, etc.)", inline: true, value: `${match_data.ModeInfo.RunType}`, setFunc: (value) => {
            if (can_submitData.valid) {
                for (let i=0; i < this.PossibleRankedRunTypes.length; i++) {
                    if (this.PossibleRankedRunTypes[i].name === value) {
                        can_submitData.valid = true;
                        break;
                    }
                    can_submitData.valid = false;
                    can_submitData.reason = `# Error: Run Type\n**${value}** needs to be a value of one of these:\n${this.PossibleRankedRunTypes.map(item => item.name).join(", or ")}`;
                }
            }
            match_data.ModeInfo.RunType = value; }},
        ],[
        {name: "Players (In-game)", inline: true, value: `${match_data.ModeInfo.Players}`, setFunc: (value) => {
            match_data.ModeInfo.Players = (value = checkValueNaN(value, "Players")); }},

        {name: "Alive Players", inline: true, value: `${match_data.ModeInfo.AlivePlayers}`, setFunc: (value) => {
            match_data.ModeInfo.AlivePlayers = (value = checkValueNaN(value, "Alive Players")); }},

        {name: "Modifiers (If in Modifiers Run)", inline: true, value: `${modifier_placeholder}`, setFunc: (value) => {
            let arryValue = "";
            if (can_submitData.valid && match_data.ModeInfo.RunType == "Modifiers") {
                arryValue = value.split(",").map(item => item.trim());
                for (let i=0; i < arryValue.length; i++) {
                    if (!can_submitData.valid) break;
                    for (let j=0; j < this.ModifiersText.length; j++) {
                        if (this.ModifiersText[i].label == value) {
                            can_submitData.valid = true;
                            break;
                        }
                        can_submitData.valid = false;
                        can_submitData.reason = `# Error: Modifiers\n**${value}** needs to be a value of one of these:\n${this.ModifiersText.map(item => item.label).join(", ")}`;
                    }
                }
            }
            match_data.ModeInfo.Modifiers = arryValue; }},
        {name: "Feedback (Optional)", inline: true, value: `${match_data.ReviewInfo.Feedback}`, setFunc: (value) => {
            match_data.ReviewInfo.Feedback = value; }},
        ]
        ];
        
        let pagesData = [];
        for (let i=0; i < pageFields.length; i++) {
            pagesData.push(new PagesEmbedData({name: `${interaction.user.globalName}`}, `Match #${matchInput} - Verifying Information`,
            `Use the dropdown box to select a property to edit, please ensure the information is accurate as possible\nIf the users doesn't have the proper information, join their thread with the match ID in the <#${ServerData.server_info.MatchmakingChannel.value}> and inform them about what information they need to provide`,
            "#00b0f4", pageFields[i], null, true));
        }
        
        let dropboxSelection = [];
        for (let i=0; i < pageFields.length; i++) {
            let pushArry = [];
            for (let j=0; j < pageFields[i].length; j++) pushArry.push(new SelectionItems(pageFields[i][j].name, `${pageFields[i][j].value}`, `${i}_${j}`));
            dropboxSelection.push(pushArry);
        }

        const button = new Button(interaction.user.id, [
            new ButtonItems("review-submit", "Submit Review", ButtonStyle.Danger, null, null, false)
        ], async (id, buttonInteraction) => {
            if (buttonInteraction.user.id != interaction.user.id) {
                buttonInteraction.reply({ephemeral: true, content: "You can't use this button!"});
                return;
            }
            await buttonInteraction.deferReply({ephemeral: true});

            for (let i=0; i < pageFields.length; i++) {
                for (let j=0; j < pageFields[i].length; j++) {
                    pageFields[i][j].setFunc(pageFields[i][j].value);
                    if (!can_submitData.valid) break;
                }
            }
            if (!can_submitData.valid) {
                buttonInteraction.editReply({ephemeral: true,
            content: `Uh oh! It looks like you provided values that are not applicable to the data!\n\n${can_submitData.reason}`});
                return;
            }
            interaction.deleteReply();
            
            match_data.ReviewInfo.TimeReviewed = Math.floor(Date.now() / 1000);
            match_data.ReviewInfo.Reviewer = buttonInteraction.user.id;
            match_data.ValidData = true;
            match_data.FloorInfo.ValidData = true;
            match_data.ModeInfo.ValidData = true;
            match_data.ReviewInfo.ValidData = true;

            await this.UpdateMatchSave(match_data);

            await this.AllDataVerified(match_data);

            await buttonInteraction.editReply({content: "Data has been validated!", ephemeral: true});
        });

        let dropdown = null;
        let verifyPage = null;
        let dropdownCallbackVerify = async (id, dropInteraction) => {
            if (id.split("_")[1] != dropInteraction.user.id) {
                dropInteraction.reply({content: "You are not the person who used this command!", ephemeral: true});
                return;
            }
            
            await interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: []});

            let idxs = dropInteraction.values[0].split("_");
            idxs[0] = parseInt(idxs[0]); idxs[1] = parseInt(idxs[1]);

            let completeFunc = () => {
                can_submitData.valid = true;
                verifyPage.pages_embeds[idxs[0]].data.fields = pageFields[idxs[0]];

                interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
            }
            
            const cancelButton = new Button(dropInteraction.user.id, [
                new ButtonItems("cancel-review-edit", "Cancel", ButtonStyle.Danger, null, null, false)
            ], async (id, buttonInteraction) => {
                if (buttonInteraction.user.id != dropInteraction.user.id) {
                    buttonInteraction.reply({content: "You are not the person who used this command!", ephemeral: true});
                    return;
                }
                dropInteraction.deleteReply();
                completeFunc();
            });

            await dropInteraction.reply({components: [cancelButton.ActionRow], content: `<@${dropInteraction.user.id}>\nReply to this message to set the information with what you reply with`});
            const idxThing = `verifyChat-${dropInteraction.user.id}`;
            EventsHelper.addChatCommand(idxThing, idxThing, async (messageInteraction) => {
                if (dropInteraction.user.id != messageInteraction.author.id) return;
                const value = await messageInteraction.content;
                messageInteraction.delete();
                try {
                    dropInteraction.deleteReply();
                    EventsHelper.removeChatCommand(idxThing);
                } catch(e) {
                    console.error(e);
                    EventsHelper.removeChatCommand(idxThing);
                    return dropInteraction.followUp("Sorry! Looks like an error occured.");
                }
                
                pageFields[idxs[0]][idxs[1]].value = value;
                
                dropboxSelection = [];
                for (let i=0; i < pageFields.length; i++) {
                    let pushArry = [];
                    for (let j=0; j < pageFields[i].length; j++) pushArry.push(new SelectionItems(pageFields[i][j].name, `${pageFields[i][j].value}`, `${i}_${j}`));
                    dropboxSelection.push(pushArry);
                }
                dropdown = new Selection(interaction.user.id, "verify-drop-match", placeholderText, dropboxSelection[verifyPage.curPage], dropdownCallbackVerify);
                completeFunc();
            });
        }

        const placeholderText = "Select Data To Edit";
        dropdown = new Selection(interaction.user.id, "verify-drop-match", placeholderText, dropboxSelection[0], dropdownCallbackVerify);

        verifyPage = new Pages(interaction, "verification-match", pagesData, false, async (id, pageInteraction) => {
            dropdown = new Selection(interaction.user.id, "verify-drop-match", placeholderText, dropboxSelection[verifyPage.curPage], dropdownCallbackVerify);
            await interaction.editReply({embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
        });

        let contentValue = (match_data.ValidData) ? "# This data has been validated by another member! If you think the values are incorrect, you may edit it!" : " ";
        await interaction.editReply({content: contentValue, embeds: [verifyPage.pages_embeds[verifyPage.curPage]], components: [dropdown.ActionRow, verifyPage.page_buttons.ActionRow, button.ActionRow]});
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
    Invalid = false; // If the admins didn't validate a match after a period of time, then invalidate the match. It will sill be under the verified Player's data though.

    MatchID = -1; // the ID of the match

    ReviewInfo = new ReviewData();
    DiscordInfo = new DiscordData(); // btw, this data shouldn't be included for the bot to display.

    FloorInfo = new FloorData();
    ModeInfo = new ModeInfo();

    toJson() {
        return JSON.parse(JSON.stringify(this));
    }
}

class PlayerMatchData {
    ValidData = false;
    DeathInfo = new DeathData();
    GameInfo = new GameData();

    EloStats = {
        PrevElo: {},
        NewElo: {}
    };

    MatchID = -1;
    Rank = -1; // Placement Data of the Player's Match.
    
    toJson() {
        return JSON.parse(JSON.stringify(this));
    }
}

class ReviewData {
    ValidData = false;

    TimeEnded = -1; // Unix Time when Match Ended
    TimeReviewed = -1; // Unix Time when a Moderator started reviewing the match ID
    Accepted = false; // If the match was accepted by the moderator or not.

    Reviewer = "N / A"; // Discord Name + Discord @ ("PooPooFard (@JerrySmith)") of the Player reviewing data
    Feedback = "N / A"; // Mmoderator's feedback

    ThreadID = -1;
}

class DiscordData {
    Attachments = new Map(); // Array of URL attachment, for reviewing.
    PlayerDiscordIDs = [];
    constructor() {
        this.Attachments = new Map();
    }
}

class ModeInfo {
    ValidData = false; // If the data is just junk data or actually valid data.

    Mode = "???"; // For other types of modes like Modifiers, SUPER HARD MODE, etc.
    
    Players = 0; // How may players in the game
    AlivePlayers = 0; // How Many Players came out alive
    RunType = "???"; // No Shop, Shop, etc.
    Modifiers = []; // Array of string of modifier Names used (If Mode was Modifiers)
}

class FloorData {
    ValidData = false;

    VisitedFloors = ["Floor 1"];
}

class DeathData {
    ValidData = false; // If the data is just junk data or actually valid data.

    Died = false; // If the player Died that round
    Door = "???"; // Door Player made to
    Cause = "N / A";
}

class GameData {
    ValidData = false; // If the data is just junk data or actually valid data.

    KnobsSpent = "N / A"; // If played Shop, how much they spent in game
    KnobsGained = "N / A"; // How much Knobs the player gained that match
    GoldFound = "N / A"; // How much Gold the player gained that mach
    FriendsBonus = "N / A"; // If there was any friends playing with Player
    Multiplier = "N / A"; // Knob Multiplier
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

module.exports = {RankedMatches, MatchData, ReviewData, DiscordData, ModeInfo, FloorData, DeathData, GameData, PlayerMatchData};