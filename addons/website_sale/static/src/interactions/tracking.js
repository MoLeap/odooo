import { Interaction } from '@web/public/interaction';
import { registry } from '@web/core/registry';

export class Tracking extends Interaction {
    static selector = '.oe_website_sale';
    dynamicContent = {
        'a[href^="/shop/checkout"]': { 't-on-click': this.onCheckoutStart },
        'a[href^="/web/login?redirect"][href*="/shop/checkout"]': {
            't-on-click': this.onCustomerSignin,
        },
        'a[href="/shop/payment"]': { 't-on-click': this.onOrder },
        'button[name="o_payment_submit_button"]': { 't-on-click': this.onOrderPayment },
        _root: {
            't-on-view_item_event': (ev) => this.onViewItem(ev),
            't-on-add_to_cart_event': (ev) => this.onAddToCart(ev),
            't-on-update_cart_event': (ev) => this.onUpdateCart(ev),
            't-on-add_shipping_info_event': (ev) => this.onAddShippingInfo(ev),
        },
    };

    setup() {
        const confirmation = this.el.querySelector('div[name="order_confirmation"]');
        if (confirmation) {
            this._vpv('/stats/ecom/order_confirmed/' + confirmation.dataset.orderId);
            this._trackGa('event', 'purchase', JSON.parse(confirmation.dataset.orderTrackingInfo));
        }

        const cartTrackingEl = this.el.querySelector("#cart_tracking_info");
        if (cartTrackingEl?.dataset?.cartTrackingInfo) {
            this._trackGa(
                "event",
                "view_cart",
                JSON.parse(cartTrackingEl.dataset.cartTrackingInfo),
            );
        }
    }

    /**
     * @private
     */
    _trackGa() {
        const websiteGA = window.gtag || (() => {});
        websiteGA.apply(this, arguments);
    }

    /**
     * Virtual page view
     *
     * @private
     */
    _vpv(page) {
        this._trackGa('event', 'page_view', { 'page_path': page });
    }

    onViewItem(event) {
        const productTrackingInfo = event.detail;
        const trackingInfo = {
            'currency': productTrackingInfo['currency'],
            'value': productTrackingInfo['price'],
            'items': [productTrackingInfo],
        };
        this._trackGa('event', 'view_item', trackingInfo);
    }

    _trackCartEvent(eventName, items) {
        this._trackGa('event', eventName, {
            currency: items[0].currency,
            value: items.reduce((acc, item) => acc + item.price * item.quantity, 0),
            items: items
        });
    }

    onAddToCart(event) {
        const items = event.detail;
        if (!items?.length) return;
        this._trackCartEvent(
            'add_to_cart',
            items.map(({ delta_quantity, ...item }) => item),
        );
    }

    onUpdateCart(event) {
        const items = event.detail;
        if (!items?.length) return;

        const addedItems = items
            .filter(i => i.delta_quantity > 0)
            .map(({ delta_quantity, ...item }) => item);

        const removedItems = items
            .filter(i => i.delta_quantity < 0)
            .map(({ delta_quantity, ...item }) => item);

        if (addedItems.length) this._trackCartEvent('add_to_cart', addedItems);
        if (removedItems.length) this._trackCartEvent('remove_from_cart', removedItems);
    }

    onCheckoutStart() {
        this._vpv('/stats/ecom/customer_checkout');
        const cartTrackingEl = this.el.querySelector('#cart_tracking_info');
        if (!cartTrackingEl?.dataset?.cartTrackingInfo) return;
        this._trackGa('event', 'begin_checkout',
            JSON.parse(cartTrackingEl.dataset.cartTrackingInfo)
        );
    }

    onCustomerSignin() {
        this._vpv('/stats/ecom/customer_signin');
    }

    onOrder() {
        if (document.querySelector('header#top [href="/web/login"]')) {
            this._vpv('/stats/ecom/customer_signup');
        }
        this._vpv('/stats/ecom/order_checkout');
    }

    onOrderPayment() {
        const paymentMethod = this.el.querySelector(
            '#payment_method input[name="o_payment_radio"]:checked'
        )?.parentElement?.querySelector('.o_payment_option_label')?.textContent;
        this._vpv('/stats/ecom/order_payment/' + paymentMethod);

        const paymentTrackingElement = this.el.querySelector('#payment_tracking_info');
        const trackingInfo = paymentTrackingElement?.dataset?.paymentTrackingInfo
            ? JSON.parse(paymentTrackingElement.dataset.paymentTrackingInfo)
            : {};

        this._trackGa('event', 'add_payment_info', {
            ...trackingInfo,
            payment_type: paymentMethod,
        });
    }
    onAddShippingInfo(event) {
        const shippingInfo = event.detail;
        if (!shippingInfo) return;
        this._trackGa('event', 'add_shipping_info', shippingInfo);
    }
}

registry
    .category('public.interactions')
    .add('website_sale.tracking', Tracking);
