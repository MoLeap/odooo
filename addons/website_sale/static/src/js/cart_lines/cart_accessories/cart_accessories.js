import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class CartAccessories extends Component {
    static template = "website_sale.CartAccessories";
    static props = {
        accessories: Array,
        isAccessoriesViewActive: Boolean,
        isQuantityViewActive: Boolean,
        currencyId: Number,
    };

    setup() {
        this.cartService = useService("cart");
    }

    async addToCart(accessoryProduct) {
        await this.cartService.add(
            {
                productTemplateId: accessoryProduct.product_tmpl_id,
                productId: accessoryProduct.id,
                isCombo: accessoryProduct.type == "combo",
            },
            {
                isBuyNow: true,
                showQuantity: this.props.isQuantityViewActive,
            }
        );
    }
}
