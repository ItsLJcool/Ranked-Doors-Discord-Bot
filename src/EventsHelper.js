//a
const {Events, SlashCommandBuilder} = require("discord.js");
class EventsHelper {
    static prefix = "r?";

    static commands;
    static chatInputs;
    static client;
    
    static buttonCallbacks;
    static dropdownCallbacks;

    static modalCallbacks;

    static voiceChannelCallbacks;
    
    static AddChoices(option, arry) {
        for (let i=0; i < arry.length; i++) option.addChoices(arry[i]);
    }
    
    static init(_client) {
        this.client = _client;
        this.commands = new Map();
        this.chatInputs = new Map();

        this.buttonCallbacks = new Map();
        this.dropdownCallbacks = new Map();

        this.modalCallbacks = new Map();
        
        this.voiceChannelCallbacks = new Map();

        this.client.on(Events.InteractionCreate, (interaction) => {
            // this.client.application.commands.set([]);
            // console.log(ServerData.isInit);

            if (interaction.isModalSubmit()) {
                this.modalCallbacks.forEach((func, value) => {
                    if (value !== interaction.customId) return;
                    let fields = [];
                    interaction.fields.fields.forEach((key, value) => { fields.push(interaction.fields.getField(value)); });
                    func(fields, interaction);
                });
                return;
            }

            if (interaction.isStringSelectMenu()) {
                this.dropdownCallbacks.forEach((func, value) => {
                    if ((value + `_${interaction.member.user.id}`) !== interaction.customId) return;
                    func(interaction.customId, interaction);
                });
                return;
            }

            if (interaction.isButton()) {
                this.buttonCallbacks.forEach((func, value) => {
                    if (value !== interaction.customId) return;
                    func(interaction.customId, interaction);
                });
                return;
            }
            if (interaction.isChatInputCommand()) {
                this.commands.forEach((func, value) => {
                    if (value !== interaction.commandName) return;
                    func(interaction);
                });
                return;
            }
        });

        this.client.on(Events.MessageCreate, (interaction) => {
            this.chatInputs.forEach((data, value) => {
                if (data.prefix == value) {
                    data.func(interaction);
                    return;
                }
                const pre = (data.prefix == undefined) ? this.prefix : data.prefix;
                if ((pre + value) !== interaction.content) return;
                data.func(interaction);
            });
        });

        this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
            this.voiceChannelCallbacks.forEach((func, value) => {
                if (value !== newState.channelId && value !== oldState.channelId) return;
                let type = "moved";
                if (newState.channelId === null) type = "left";
                else if(oldState.channelId === null) type = "join";
                func(oldState, newState, type);
            });
        });
    }

    /**
     * @param name Name of the command
     * @param desc Description of command
     * @param optionFunc [Not Required] Returns the `SlashCommandBulder` item to addon to
     * @param commandFunc Function to run when command is called
    */
    static addCommand(name, desc, optionFunc, commandFunc) {
        name = name.toLowerCase();
        if (typeof commandFunc !== "function") {
            console.log("Command doesn't have a function");
            return;
        }
        const newCommand = new SlashCommandBuilder().setName(name).setDescription(desc).setDMPermission(false);
        if (typeof optionFunc === "function") optionFunc(newCommand);

        this.client.application.commands.create(newCommand);
        this.commands.set(name, commandFunc);
    }
    // SlashCommandBuilder Functions
    /*
        | addBooleanOption | addUserOption | addChannelOption | addRoleOption |
        addAttachmentOption | addMentionableOption | addStringOption | addIntegerOption | addNumberOption |
        
        | setName | setDescription | setRequired |
    */
   
    static addChatCommand(name, prefix, commandFunc) {
        if (typeof commandFunc !== "function") {
            console.log("Command doesn't have a function");
            return;
        }
        this.chatInputs.set(name, {prefix: prefix, func: commandFunc});
    }
    
    static removeChatCommand(name) {
        return this.voiceChannelCallbacks.delete(name);
    }

    static addButtonCallback(buttonID, callback) {
        if (typeof callback !== "function") {
            console.log("Button doesn't have a function");
            return;
        }
        this.buttonCallbacks.set(buttonID, callback);
    }

    static addDropdownCallback(dropdownID, callback) {
        if (typeof callback !== "function") {
            console.log("Dropdown doesn't have a function");
            return;
        }
        this.dropdownCallbacks.set(dropdownID, callback);
    }
    
    static addModalCallback(modalID, callback) {
        if (typeof callback !== "function") {
            console.log("Modal doesn't have a function");
            return;
        }
        this.modalCallbacks.set(modalID, callback);
    }

    static addVC_Callback(channelID, callback) {
        if (typeof callback !== "function") {
            console.log("Callback doesn't have a function");
            return;
        }
        
        this.voiceChannelCallbacks.set(channelID, callback);
    }
    /**
     * Returns `true` if removed anything from the map, else false if nothing removed
    */
    static removeVC_Callback(channelID) {
        return this.voiceChannelCallbacks.delete(channelID);
    }
}

module.exports = EventsHelper;