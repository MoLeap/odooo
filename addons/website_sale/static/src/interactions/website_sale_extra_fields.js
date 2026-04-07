import { patch } from "@web/core/utils/patch";
import { ProductPage } from "@website_sale/interactions/product_page";

patch(ProductPage.prototype, {
    async _onChangeCombination(ev, parent, combination) {
        await super._onChangeCombination(ev, parent, combination);
        if (combination.extra_fields_html) {
            const specSection = document.querySelector("#product_full_spec");
            if (specSection) {
                specSection.outerHTML = combination.extra_fields_html;
            }
        }
    },
});
