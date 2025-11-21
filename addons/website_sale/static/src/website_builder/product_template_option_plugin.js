import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { PRODUCT_TEMPLATE_OPTION_SELECTOR } from "./product_template_option";

export class ProductTemplateOptionPlugin extends Plugin {
    static id = "productTemplateOptionPlugin";
    resources = {
        builder_actions: {},
        container_title: {
            selector: PRODUCT_TEMPLATE_OPTION_SELECTOR,
            getTitleExtraInfo: (el) => {
                const titleEl = el
                    .querySelector(".o_wsale_product_details_content_section_title")
                    ?.querySelector("h1");
                return titleEl ? titleEl.textContent : "";
            },
            editableOnly: false,
        },
        builder_options_render_context: {
            productTemplateOptionSelector: PRODUCT_TEMPLATE_OPTION_SELECTOR,
        },
    };
}

registry
    .category("website-plugins")
    .add(ProductTemplateOptionPlugin.id, ProductTemplateOptionPlugin);
