const {ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");

const EventsHelper = require("../EventsHelper");

class Button {

    buttons = [];
    ActionRow;
    constructor(userID, buttonIDs, callback) {
        for (let i=0; i < buttonIDs.length; i++) {
            let buttonId = buttonIDs[i];
            buttonId.id += `_${userID}`;
            const button = new ButtonBuilder().setCustomId(buttonId.id).setLabel(buttonId.label).setStyle(buttonId.style).setDisabled(buttonId.disabled);
            if (buttonId.emoji !== undefined) button.setEmoji(buttonId.emoji);
            if (buttonId.url !== undefined) button.setURL(buttonId.url)
            this.buttons.push(button);
        
            EventsHelper.addButtonCallback(buttonId.id, callback);
        }
        this.ActionRow = new ActionRowBuilder().addComponents(this.buttons)
        return this;
    }
}

class ButtonItems {
    id = "new_id";
    label = "This Is a Label";
    style = ButtonStyle.Primary;
    emoji = undefined;
    url = undefined;
    disabled = true;

    constructor(id, label, style, emoji, url, disabled) {
        if (id != null) this.id = id;
        if (label != null) this.label = label;
        if (style != null) this.style = style;
        if (emoji != null) this.emoji = emoji;
        if (url != null) this.url = url;
        if (disabled != null) this.disabled = disabled;
    }
}

module.exports = {Button, ButtonItems};