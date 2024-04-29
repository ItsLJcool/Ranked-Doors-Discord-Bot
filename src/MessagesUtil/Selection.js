const {StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder} = require("discord.js");

const EventsHelper = require("../EventsHelper");

class Selection {

    dropdown;
    ActionRow;
    constructor(userID, id, placeholderText, options, callback) {
        let _options = [];
        for (let i=0; i < options.length; i++) {
            let o = options[i];
            let select_menu = new StringSelectMenuOptionBuilder()
            .setLabel(o.label)
            .setDescription(o.desc)
            .setValue(o.value);
            if (o.emoji != undefined) select_menu.setEmoji(o.emoji);
            if (o._default != undefined) select_menu.setDefault(o._default);
            _options.push(select_menu);
        }

        EventsHelper.addDropdownCallback(id, callback);

        this.dropdown = new StringSelectMenuBuilder()
			.setCustomId(id + `_${userID}`)
			.setPlaceholder(placeholderText)
		    .addOptions(_options);
        this.ActionRow = new ActionRowBuilder().addComponents(this.dropdown);
        return this;
    }
}

class SelectionItems {
    label = "Default Label";
    desc = "Default Description Text";
    value = "default_value";
    emoji = undefined;
    _default = false;

    constructor(label, desc, value, emoji, _default) {
        if (this.label != null) this.label = label;
        if (this.desc != null) this.desc = desc;
        if (this.value != null) this.value = value;
        if (this.emoji != null) this.emoji = emoji;
        if (this._default != null) this._default = _default;
    }
}

module.exports = {Selection, SelectionItems};