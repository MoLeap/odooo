import { FontPlugin } from "@html_editor/main/font/font_plugin";
import { registry } from "@web/core/registry";

const excludedFontItems = ["h5", "h6"];

export class MassMailingFontPlugin extends FontPlugin {
    resources = {
        ...this.resources,
        font_items: this.resources.font_items.filter(
            (item) => !excludedFontItems.includes(item.object.tagName)
        ),
    };
}

registry.category("mass_mailing-plugins").add(MassMailingFontPlugin.id, MassMailingFontPlugin);
