import { Component, onWillStart } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { rpc } from "@web/core/network/rpc";
import { useBus, useService } from "@web/core/utils/hooks";
import { useState } from "@web/owl2/utils";

export class CartAccessories extends Component {
    static template = "website_sale.CartAccessories";
    static props = {};

    setup() {
        this.cartService = useService("cart");
        this.state = useState({
            accessories: [],
        });

        onWillStart(async () => {
            await this.updateAccessories();
        });

        useBus(this.cartService.bus, "update_accessories", async () => {
            await this.updateAccessories();
        });
    }

    async updateAccessories() {
        this.state.accessories = await rpc("shop/cart/accessories");
    }

    formatPrice(price) {
        return formatCurrency(price, this.props.currencyId);
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
                showQuantity: this.env.isQuantityViewActive,
            }
        );
    }
}
