
const fs = require('fs');
const path = require('path');

const EventsHelper = require("./EventsHelper");
const {EmbedBuilder, TextInputStyle} = require("discord.js");

const {ModalUtil, TextInputItems} = require("./MessagesUtil/ModalUtil");
const {Pages, PagesEmbedData} = require("./MessagesUtil/Pages");

class ServerData {
    static server_info;
    static isInit = false;
    static init() {
        this.isInit = false;
        this.server_info = new ServerSaveData();
        this.OpenedSettings = [];
        const dir = path.join(__dirname, 'ServerData');
        fs.readdir(dir, (err, files) => {
            if (err) {
                console.error('Error reading folder:', err);
                return;
            }
            const save = path.join(dir, "ServerSave.json");
            try {
                fs.accessSync(save, fs.constants.F_OK);
            } catch (err) {
                return;
            }
            const fileData = fs.readFileSync(save, 'utf8');
            this.server_info.setup(JSON.parse(fileData));
            this.isInit = true;
        });

        const ljYapps = "You can use the subcommands to set the settings directly. Example: `/settings reviewchannelid";
        const pages = [
            {
                author: { name: `{globalName} - VC Settings` },
                title: "Voice Chat Settings",
                desc: `${ljYapps}\nFor Matches and Queue channels.`
            }, {
                author: { name: `{globalName} - Other Setting(s)` },
                title: "Other Settings",
                desc: `${ljYapps}\nMisc items for now`
            }
        ];

        EventsHelper.addCommand("settings", "Edit Bot Settings for the Server", (command) => {
            command.addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View all the settings currently set in the server')
                    .addBooleanOption(option =>
                        option.setName('hidden')
                            .setDescription('Hides the message to only you can see it')
                    )
            );
            const json = this.server_info;
            Object.keys(this.server_info).forEach((key, value) => {
                command.addSubcommand(subcommand => {
                    subcommand.setName(key.toString().toLowerCase());
                    subcommand.setDescription(json[key].subcmd.desc);
                    if (typeof json[key].subcmd.command === "function") json[key].subcmd.command(subcommand);
                    return subcommand;
                });
            });
        },
        async (interaction) => {
            let hide = (interaction.options.getBoolean("hidden") != undefined) ? interaction.options.getBoolean("hidden") : false;
            for (let i=0; i < this.OpenedSettings.length; i++) {
                if (this.OpenedSettings[i].member.user.id !== interaction.member.user.id) continue;
                this.OpenedSettings[i].deleteReply();
                if (interaction.options._hoistedOptions[0].name !== "view") hide = (this.OpenedSettings[i].options.getBoolean("hidden") != undefined) ? this.OpenedSettings[i].options.getBoolean("hidden") : hide;
                this.OpenedSettings.splice(i, 1);
                break;
            }
            this.OpenedSettings.push(interaction);

            Object.keys(this.server_info).forEach((key, value) => {
                if (key.toLowerCase() !== interaction.options.getSubcommand()) return;
                this.server_info[key].subcmd.onValueChange(OptionResolve.resolve(interaction.options._hoistedOptions[0].name, interaction));
            });

            const pageFields = this.server_info.toPageFields();
            let pagesData = [];
            for (let i=0; i < pages.length; i++) {
                if (pageFields[i] == undefined) continue;
                const pageData = pages[i];
                pagesData.push(new PagesEmbedData({name: pageData.author.name.replace("{globalName}", interaction.member.user.globalName)}, pageData.title,  pageData.desc, null, pageFields[i], null, true));
            }

            const settingPage = new Pages(interaction, "settings-page", pagesData, hide);
            settingPage.reply(interaction);
            if (interaction.options._hoistedOptions[0] != undefined) {
                if (interaction.options._hoistedOptions[0].name !== "view") this.SaveServerData();
            }
        });
    }

    OpenedSettings = [];

    static async SaveServerData() {
        const json = this.server_info.toJson();

        const serverDataPath = path.join(__dirname, 'ServerData');
        const file = path.join(serverDataPath, `ServerSave.json`);
        
        await fs.mkdir(serverDataPath, { recursive: true }, (err) => {
            if (err) {
                console.error('File does not exist');
                // Handle the case where the file doesn't exist
                return;
            }

            fs.writeFile(file, JSON.stringify(json), (err) => {
                if (err) {
                    console.error('Error writing to file:', err);
                    return;
                }
            });
        });
    }
}

class OptionResolve {
    static resolve(name, interaction) {
        // console.log(interaction);
        switch(name.toLowerCase()) {
            case "channel":
            case "category":
            case "voice-chat":
                return interaction.options.getChannel(name.toLowerCase());
            case "role":
                return interaction.options.getRole(name.toLowerCase());
            case "hours":
                return interaction.options.getInteger(name.toLowerCase());
            default:
                console.log(`No Resolve for ${name.toLowerCase()}!!!`);
                break;
        }
    }
}

class ServerSaveData {
    /**
     * ChannelID that sends the Review chats / commands in
     */
    ReviewChannelID = {
        value: "",
        default: "",
        inline: true,
        page: 0,
        subcmd: { // items in a cmd is always required to set the value to
            desc: "The channel that sends the Review chats / commands in",
            command: (command) => {
                command.addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('The Channel to set the value to')
                        .setRequired(true)
                );
            },
            onValueChange: (value) => { this.ReviewChannelID.value = value.id; },
        },
    };
    /**
     * RoleID That is allowed to use the commands for Reviewing Matches
     */
    ReviewRoleID = {
        value: "",
        default: "",
        inline: true,
        page: 0,
        subcmd: { // items in a cmd is always required to set the value to
            desc: "The role that is allowed to use the commands for Reviewing Matches",
            command: (command) => {
                command.addRoleOption(option => 
                    option.setName('role')
                        .setDescription('The Role to set the value to')
                        .setRequired(true)
                );
            },
            onValueChange: (value) => { this.ReviewRoleID.value = value.id; },
        },
    };

    /**
     * CategoryID For New VC Matches to be created.
     */
    VC_CategoryID = {
        value: "",
        default: "",
        inline: true,
        page: 0,
        subcmd: { // items in a cmd is always required to set the value to
            desc: "The Category for new Voice Chats to be created for Ranked Matches",
            command: (command) => {
                command.addChannelOption(option =>
                    option.setName('category')
                        .setDescription('The Category to set the value to')
                        .setRequired(true)
                );
            },
            onValueChange: (value) => { this.VC_CategoryID.value = value.id; },
        },
    };

    QueueVC_ID = {
        value: "",
        default: "",
        inline: true,
        page: 0,
        subcmd: { // items in a cmd is always required to set the value to
            desc: "The Voice Chat that puts Users into after a match has concluced.",
            command: (command) => {
                command.addChannelOption(option =>
                    option.setName('voice-chat')
                        .setDescription('The Voice Chat to set the value to')
                        .setRequired(true)
                );
            },
            onValueChange: (value) => { this.QueueVC_ID.value = value.id; },
        },
    };

    /**
     * Time until users who haven't submitted their screenshots will be considered a loss, and will still lose Elo
     */
    MatchReview_TimeOut = {
        value: 24,
        default: 24,
        inline: true,
        page: 1,
        subcmd: { // items in a cmd is always required to set the value to
            desc: "Integer value (In hours) until the match 'expires' after a while.",
            command: (command) => {
                command.addIntegerOption(option =>
                    option.setName('hours')
                        .setDescription('The number of hours until expiring')
                        .setRequired(true)
                );
            },
            onValueChange: (value) => { this.MatchReview_TimeOut.value = value; },
        },
    };

    constructor() { return this; }

    toJson() {
        let json = JSON.parse(JSON.stringify(this));
        
        Object.keys(json).forEach((key, value) => { delete json[key].subcmd; });
        return json;
    }

    toPageFields() {
        const json = this.toJson();
        let selectionData = [];
        Object.keys(json).forEach((key, value) => {
            if (selectionData[json[key].page] == undefined) selectionData[json[key].page] = [];
            const settinVal = (json[key].value == "" || json[key].value == " " || json[key].value == undefined) ? "(No Value)" : json[key].value;
            const defaultVal = (json[key].default == "" || json[key].default == " " || json[key].default == undefined) ? "(No Value)" : json[key].default;
            selectionData[json[key].page].push({
                name: key,
                value: `Setting Value: ${settinVal} | Default: ${defaultVal}`,
                inline: json[key].inline,
                page:  json[key].page,
            });
        });
        return selectionData;
    }

    setup(json) {
        Object.keys(json).forEach((key, value) => {
            this[key].value = json[key].value;
            this[key].default = json[key].default;
            this[key].inline = json[key].inline;
        });
    }
}

module.exports = {ServerData, ServerSaveData};