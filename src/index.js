/*
    Welcome to my horrendus code time!
    This code is going to be making a Discord bot in Node.js, to upload to a server that has 99% Up-keep, to make Ranked Roblox: Doors easier to use
    and for mods to rate.
*/


require('dotenv').config();
const {Client, Events, GatewayIntentBits, EmbedBuilder, PermissionsBitField, PermissionFlagsBits, Permissions, ButtonStyle, TextInputStyle} = require("discord.js");
const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]});
const EloRankHelper = require("./EloRankHelper");

const {Button, ButtonItems} = require("./MessagesUtil/Button");
const {Selection, SelectionItems} = require("./MessagesUtil/Selection");
const {ModalUtil, TextInputItems} = require("./MessagesUtil/ModalUtil");
const {Pages, PagesEmbedData} = require("./MessagesUtil/Pages");

const UserCommands = require("./UserCommands");

const {ServerData, ServerSaveData} = require("./ServerData");

const EventsHelper = require("./EventsHelper");


const {PlayersManager} = require("./PlayerData");

const {RankedMatches} = require("./RankedMatches");

client.on(Events.GuildCreate, (guild) => {
    console.log(`Bot Added to a Guild | shardId: ${guild.shardId}`);
});

client.on(Events.ClientReady, async (x) => {

    EventsHelper.init(client);
    PlayersManager.init();

    RankedMatches.init(client);

    ServerData.init();
    
    UserCommands.init(client);

    console.log(`${x.user.tag} is ready!`);
    client.user.setActivity("Trying to understand how 2024 Discord bots work lol");

    // Embed showcase, and attachment showcase
    EventsHelper.addCommand("register", "Register an account to Ranked Doors Bot", (command) => {
    },
    async (interaction) => {
        if (PlayersManager.GetPlayerData(interaction.user.id) != -1) { return interaction.reply({ephemeral: true, content: "You already have an account!"}); }
        const discord = interaction;
        const returnType = PlayersManager.SetUpPlayer(discord);
        if (!returnType[0]) {
            await interaction.reply({content: "Uh Oh! Looks like your already signed up!", ephemeral: true});
            return;
        }
        const player = returnType[1];
        const embed = new EmbedBuilder()
        .setAuthor({
          name: "Ranked Doors - Discord Server",
        })
        .setTitle(`${PlayersManager.PlayerName(player)} - Signed up!`)
        .setDescription(`You have been signed up!\nPlease read the rules before playing Ranked Matches!\n\nYou can always do /stats to check your and other's stats!\nHave fun!`)
        .addFields(
          {
            name: "Ranked Doors - Account Name",
            value: `${PlayersManager.PlayerName(player)}`,
            inline: false
          },
          {
            name: "Elo Rating - How It Works",
            value: `Everyone starts off with ${PlayersManager.DefaultElo} Elo, and by winning and playing matches, you can increase your Elo higher.`,
            inline: false
          },
        )
        .setColor("#007bff")
        .setFooter({
          text: "Ranked Doors - Discord Server",
        })
        .setTimestamp();

        await interaction.reply({embeds: [embed]});
    });
    
    EventsHelper.addCommand("buttontest", "Testing out Button Util", null,
    async (interaction) => {
        
        const button = new Button(interaction.user.id, [
            new ButtonItems("testid", "Label String", ButtonStyle.Primary, null, null, false)
        ], (id, interaction) => {
            console.log(id);
            interaction.reply("Congrats on using a test command");
        });
        await interaction.reply({content: "Button Example:", components: [button.ActionRow]});
    });
    
    EventsHelper.addCommand("droptest", "Testing Out Selection Util", null,
    async (interaction) => {

        const dropdown = new Selection(interaction.member.user.id, "testdrop", "Placeholder Text Go Crazy", [
            new SelectionItems("label1", "uh description crazy", "0"),
            new SelectionItems("label2", "another one", "1"),
            new SelectionItems("label3", "moms spagatii", "2"),
        ], (id, interaction) => {
            console.log(id);
            interaction.reply("Congrats on using a test command");
        });
        await interaction.reply({content: "Dropdown Example:", components: [dropdown.ActionRow]});
    });
    
    EventsHelper.addCommand("modaltest", "Testing Out Modal Stuff", null,
    async (interaction) => {
        
        const modal = new ModalUtil(interaction.member.user.id, "modaltest", "Modal Title", [
            new TextInputItems("text1", "Lable Text", TextInputStyle.Short, 0, undefined, "Placeholder Text Yipee", undefined, true),
            new TextInputItems("text2", "Paragraph Lable Text", TextInputStyle.Paragraph, 0, 6500, "Loong ass Paragraph", undefined, false),
        ], (fields, interaction) => {
            console.log(`ModalID: ${fields}`);
            interaction.reply("Congrats on using a test command");
        });
        
        await interaction.showModal(modal);
    });

    EventsHelper.addCommand("pagestest", "Testing Out Custom Pages", null,
    async (interaction) => {
        const newPage = new Pages(interaction, "test-page", [
            new PagesEmbedData({name: `${interaction.member.user.globalName} - Page 1`}, "Page 1 - Test", "This is to display how pages work!", null, null, null, true),
            new PagesEmbedData({name: `${interaction.member.user.globalName} - Page 2`}, "Another Page Title!", "Wow! No way! Custom pages!!", null, null, null, true),
        ], false);
        newPage.reply(interaction);
    });
});


client.login(process.env.TOKEN);