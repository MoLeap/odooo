import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class ProductCardTracking extends Interaction {
    static selector =
        "article.oe_product_cart[data-product-tracking-info], div.oe_product_cart[data-product-tracking-info]";
    dynamicContent = {
        _root: { "t-on-click": this.onSelectItem },
    };

    onSelectItem(event) {
        if (event.target.closest("button")) return;
        this._trackGa("event", "select_item", {
            items: [JSON.parse(this.el.dataset.productTrackingInfo)],
        });
    }

    _trackGa() {
        const websiteGA = window.gtag || (() => {});
        websiteGA.apply(this, arguments);
    }
}

registry
    .category("public.interactions")
    .add("website_sale.product_card_tracking", ProductCardTracking);
