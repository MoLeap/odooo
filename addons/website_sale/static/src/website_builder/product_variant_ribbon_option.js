import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { useDomState } from "@html_builder/core/utils";
import { onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class ProductVariantRibbonOption extends BaseOptionComponent {
    static id = "product_variant_ribbon_option";
    static template = "website_sale.ProductVariantRibbonOptionPlugin";
    static dependencies = ["productVariantRibbonOptionPlugin"];

    setup() {
        super.setup();

        const { loadInfo, getCount } = this.dependencies.productVariantRibbonOptionPlugin;
        this.count = useState(getCount());

        this.state = useState({
            ribbons: [],
            ribbonEditMode: false,
        });

        this.domState = useDomState(async (el) => {
            const productTemplate = el.querySelector('[data-oe-model="product.template"]');
            const templateId = productTemplate ? parseInt(productTemplate.dataset.oeId) : null;
            const variantMode = el.querySelector(".variant_attribute") || !templateId;

            return {
                variantMode,
            };
        });

        onWillStart(async () => {
            this.state.ribbons = await loadInfo();
        });
    }
}

registry.category("website-options").add(ProductVariantRibbonOption.id, ProductVariantRibbonOption);
