const {ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle} = require("discord.js");

const EventsHelper = require("../EventsHelper");

class ModalUtil {

    inputs = [];
    ActionRows = [];
    modal;
    constructor(userID, modalID, modalTitle, inputItems, callback) {
        this.modal = new ModalBuilder()
			.setCustomId(modalID + `_${userID}`)
			.setTitle(modalTitle);

        for (let i=0; i < inputItems.length; i++) {
            const input = inputItems[i];
            const newInput = new TextInputBuilder()
			.setCustomId(input.id)
			.setLabel(input.label)
			.setStyle(input.style)
            .setMinLength(input.min)
            .setMaxLength(input.max)
            .setPlaceholder(input.placeholder)
            .setRequired(input.required);
            if (input.value !== undefined) newInput.setValue(input.value);
            this.inputs.push(newInput);
            this.ActionRows.push(new ActionRowBuilder().addComponents(newInput));
        }
        this.modal.addComponents(this.ActionRows);
        EventsHelper.addModalCallback(modalID + `_${userID}`, callback);
        return this.modal;
    }
}

class TextInputItems {
    id = "new_id";
    label = "Default Label";
    style = TextInputStyle.Short;
    max = 4000;
    min = 1;
    placeholder = "Text Placeholder";
    value = undefined;
    required = false;
    constructor(id, label, style, min, max, placeholder, value, required) {
        if (id != null) this.id = id;
        if (label != null) this.label = label;
        if (style != null) this.style = style;
        if (min != null) this.min = min;
        if (max != null) this.max = max;
        if (this.max > 4000) this.max = 4000;
        if (placeholder != null) this.placeholder = placeholder;
        if (value != null) this.value = value;
        if (required != null) this.required = required;
    }
}

module.exports = {ModalUtil, TextInputItems};