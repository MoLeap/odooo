import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";
import { CartLines as CartLinesComponent } from "@website_sale/js/cart_lines/cart_lines";

export class CartLine extends Interaction {
    static selector = "#cart_products";
    dynamicContent = {
        _root: {
            "t-component": (el) => [
                CartLinesComponent,
                {
                    templateData: {
                        removeButtonText: el.parentElement.querySelector(
                            "#cart_products_edit_mode .cart_remove"
                        ).textContent,
                        wishlistButtonText: el.parentElement.querySelector(
                            "#cart_products_edit_mode .cart_wishlist"
                        ).textContent,
                        qtyMinusButtonText: el.parentElement.querySelector(
                            "#cart_products_edit_mode .cart_quantity_minus"
                        ).textContent,
                        qtyPlusButtonText: el.parentElement.querySelector(
                            "#cart_products_edit_mode .cart_quantity_plus"
                        ).textContent,
                    },
                },
            ],
        },
    };
}

registry.category("public.interactions").add("website_sale.cart_line", CartLine);
