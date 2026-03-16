import { Component, onWillStart } from "@odoo/owl";
import { CartLine } from "./cart_line/cart_line";
import { CartAccessories } from "./cart_accessories/cart_accessories";
import wishlistUtils from "@website_sale/js/wishlist_utils";
import { formatCurrency } from "@web/core/currency";
import { rpc } from "@web/core/network/rpc";
import { useService, useBus } from "@web/core/utils/hooks";
import { useState, useSubEnv } from "@web/owl2/utils";

export class CartLines extends Component {
    static template = "website_sale.CartLines";
    static props = { templateData: Object };
    static components = { CartLine, CartAccessories };

    setup() {
        this.cartService = useService("cart");
        this.state = useState({
            shopWarning: "",
            currencyId: null,
            cartLines: [],
            isQuantityViewActive: false,
            isWishlistViewActive: false,
            isUomFeatureEnabled: false,
            isAccessoriesViewActive: false,
        });

        onWillStart(async () => {
            await this.updateLines();
        });

        useBus(this.cartService.bus, "cart_update", async () => {
            await this.updateLines();
        });

        useSubEnv({
            updateLine: this.updateLine.bind(this),
            addToWishlist: this.addToWishlist.bind(this),
            formatPrice: this.formatPrice.bind(this),
        });
    }

    async updateLines() {
        const data = await rpc("/shop/cart/lines");
        this.state.cartLines = data["cart_lines"];
        this.state.accessories = data["accessories"];
        this.state.shopWarning = data["shop_warning"];
        this.state.isQuantityViewActive = data["is_quantity_view_active"];
        this.state.isWishlistViewActive = data["is_wishlist_view_active"];
        this.state.isUomFeatureEnabled = data["is_uom_feature_enabled"];
        this.state.isAccessoriesViewActive = data["is_accessories_view_active"];
        this.state.currencyId = data["currency_id"];
    }

    async updateLine(lineId, productId, quantity) {
        await this.cartService.update(lineId, productId, quantity, true);
    }

    async addToWishlist(lineId, productId) {
        await rpc("/shop/wishlist/add", { product_id: productId });
        wishlistUtils.addWishlistProduct(productId);
        wishlistUtils.updateWishlistNavBar();
        await this.updateLine(lineId, productId, 0);
    }

    formatPrice(price) {
        return formatCurrency(price, this.state.currencyId);
    }

    get commonLineProps() {
        return {
            currencyId: this.state.currencyId,
            isQuantityViewActive: this.state.isQuantityViewActive,
            isAccessoriesViewActive: this.state.isAccessoriesViewActive,
        };
    }

    get accessoriesProps() {
        return {
            ...this.commonLineProps,
            accessories: this.state.accessories,
        };
    }

    getCartLineProps(line) {
        return {
            ...this.commonLineProps,
            id: line.id,
            websiteUrl: line.website_url,
            isCombo: line.is_combo,
            isSellable: line.is_sellable,
            productType: line.product_type,
            productId: line.product_id,
            imageUri: line.image_uri,
            nameShort: line.name_short,
            headerName: line.header_name,
            combinationName: line.combination_name,
            hasMultipleUoms: line.has_multiple_uoms,
            uomName: line.uom_name,
            shouldShowStrikethroughPrice: line.should_show_strikethrough_price,
            displayedQuantity: line.displayed_quantity,
            displayedUnitPrice: line.displayed_unit_price,
            productPrice: line.product_price,
            baseUnitPrice: line.base_unit_price,
            productUomQty: line.product_uom_qty,
            productBaseUnitPrice: line.product_base_unit_price,
            descriptionLines: line.description_lines,
            shopWarning: line.shop_warning,
            comboItemLines: line.combo_item_lines,
            templateData: this.props.templateData,
        };
    }
}
