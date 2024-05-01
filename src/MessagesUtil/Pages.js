
const {ButtonStyle, EmbedBuilder} = require("discord.js");
const EventsHelper = require("../EventsHelper");

const {Button, ButtonItems} = require("../MessagesUtil/Button");

class Pages {
    pages_embeds = [];

    page_buttons;
    curPage = 0;
    isEphemeral = false;
    constructor(prevInteraction, pageID, pageEmbed_data, ephemeral, callback) {
        this.isEphemeral = ephemeral;
        const _user = (prevInteraction.member == undefined) ? prevInteraction.user.id : prevInteraction.member.user.id;
        for (let i=0; i < pageEmbed_data.length; i++) {
            const data = pageEmbed_data[i];
            
            const embed = new EmbedBuilder().setAuthor(data.Author).setTitle(data.Title).setDescription(data.Description).setColor(data.Color);
            if (data.Fields != undefined) embed.addFields(data.Fields);
            if (data.Timestamp) embed.setTimestamp();
            if (data.Footer != undefined) embed.setFooter(data.Footer)
            this.pages_embeds.push(embed);
        }

        this.page_buttons = new Button(_user, [
            new ButtonItems("prev_"+pageID, "Previous", ButtonStyle.Primary, null, null, true), // page is always indexed at one on new, so make it disabled ig
            new ButtonItems("next_"+pageID, "Next", ButtonStyle.Secondary, null, null, !(this.pages_embeds.length > 1))
        ], async (id, buttonInteraction) => {
            const _userButton = (buttonInteraction.member != undefined) ? buttonInteraction.member.user.id : buttonInteraction.user.id;
            const _userId = id.split("_");
            if (_userId[2] != _userButton) {
                buttonInteraction.reply({ephemeral: true, content: "You are not the user who used this command!"});
                return;
            }
            buttonInteraction.deferReply({ephemeral: true});
            if (_userId[0] == "prev") this.curPage--;
            else this.curPage++;

            this.page_buttons.ActionRow.components[0].data.disabled = false;
            this.page_buttons.ActionRow.components[1].data.disabled = false;

            if (this.curPage+1 >= this.pages_embeds.length) this.page_buttons.ActionRow.components[1].data.disabled = true;
            if (this.curPage-1 < 0) this.page_buttons.ActionRow.components[0].data.disabled = true;

            await prevInteraction.editReply({ephemeral: this.isEphemeral, embeds: [this.pages_embeds[this.curPage]], components: [this.page_buttons.ActionRow]});
            buttonInteraction.deleteReply();
            if (typeof callback === "function") callback(id, buttonInteraction);
        });
    }

    reply(interaction) { interaction.reply({ephemeral: this.isEphemeral, embeds: [this.pages_embeds[this.curPage]], components: [this.page_buttons.ActionRow]}); }
    editReply(interaction) { interaction.editReply({ephemeral: this.isEphemeral, embeds: [this.pages_embeds[this.curPage]], components: [this.page_buttons.ActionRow]}); }
}

class PagesEmbedData {
    Author = {
        name:  "Unassigned Author",
    };
    Title = "Untitled Page";
    Color = "#00b0f4";
    Fields = undefined;
    Footer = undefined;
    Description = "";
    Timestamp = true;

    constructor(Author, Title, Description, Color, Fields, Footer, Timestamp) {
        if (Author != undefined) this.Author = Author;
        if (Title != undefined) this.Title = Title;
        if (Description != undefined) this.Description = Description;
        if (Color != undefined) this.Color = Color;
        if (Footer != undefined) this.Footer = Footer;
        if (this.Footer == undefined) this.Footer = {text: this.Author.name};
        if (Fields != undefined) this.Fields = Fields;
        if (Timestamp != undefined) this.Timestamp = Timestamp;
    }
}

module.exports = {Pages, PagesEmbedData};