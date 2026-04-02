import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { useDomState } from "@html_builder/core/utils";
import { registry } from "@web/core/registry";
import { TagsMany2Many } from "./tags_many2many";

export const PRODUCT_TEMPLATE_OPTION_SELECTOR = ".o_wsale_product_page:has(.variant_attribute)";

export class ProductTemplateOption extends BaseOptionComponent {
    static id = "product_template_option";
    static template = "website_sale.ProductTemplateOption";
    static components = { TagsMany2Many };

    setup() {
        super.setup();
        this.domState = useDomState(async (el) => {
            const productProduct = el.querySelector('[data-oe-model="product.product"]');
            const productTemplate = el.querySelector('[data-oe-model="product.template"]');
            const variantID = productProduct ? parseInt(productProduct.dataset.oeId) : null;
            const templateId = productTemplate ? parseInt(productTemplate.dataset.oeId) : null;

            return {
                variantID,
                templateId,
            };
        });
    }

    previewTags(oldTags, newTags) {
        const tagListEl = this.env.getEditingElement().querySelector(".o_product_tags");
        const addedTags = newTags.filter(
            (tag) => !oldTags.some((current) => current.id === tag.id)
        );
        const removedTags = oldTags.filter(
            (current) => !newTags.some((tag) => tag.id === current.id)
        );

        for (const tag of removedTags) {
            const tagEl = tagListEl.querySelector(
                `.o_wsale_product_tag[data-oe-id="${tag.id}"], .o_wsale_product_tag_image[data-oe-id="${tag.id}"]`
            );
            tagEl?.remove();
        }

        for (const tag of addedTags) {
            console.log("TAG:", tag);
            if (!tagListEl.children?.length) {
                tagListEl.className =
                    "o_product_tags o_field_tags d-flex flex-wrap align-items-center gap-2 mb-2 mt-1";
            }
            const newTagEl = document.createElement("span");
            newTagEl.className =
                "o_wsale_product_tag order-1 p-2 rounded lh-1 small text-nowrap o_savable";
            newTagEl.style = "background-color: #3C3C3C33; color: #3C3C3C;";
            newTagEl.dataset.oeId = tag.id;
            newTagEl.textContent = tag.name;
            tagListEl.appendChild(newTagEl);
        }
    }
}

registry.category("website-options").add(ProductTemplateOption.id, ProductTemplateOption);
