import { _t } from "@web/core/l10n/translation";
import { browser } from "@web/core/browser/browser";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { Interaction } from "@web/public/interaction";

export class PaymentPostProcessing extends Interaction {
    static selector = "div[name='o_payment_status']";

    setup() {
        // Create a bus listener to trigger post processing
        this.notificationType = "PAYMENT_TRIGGER_POST_PROCESSING";
        this.notificationChannel = this.el.dataset.notificationChannel;
        debugger;
        this.triggerPostProcessingBind = this.triggerPostProcessing.bind(this);
        this.busService = this.services.bus_service;
        this.busService.addChannel(this.notificationChannel);
        this.busService.subscribe(this.notificationType, this.triggerPostProcessing.bind(this));

        this.landingRoute = this.el.dataset.landingRoute;

        // TODO: temp location for this initial safety net call
        rpc("/payment/post_process", { csrf_token: odoo.csrf_token })
            .then(this.handlePostProcessingResult);

        // Redirect automatically after 5 seconds
        // this.redirectTimeout = this.waitForTimeout(() => {
        //     this.redirectToLandingRoute();
        //     this.destroyNotificationListener();
        // }, 5000);

        // Make sure bus listener is disposed properly when interaction is destroyed
        this.registerCleanup(this.destroyNotificationListener);
    }

    triggerPostProcessing() {
        clearTimeout(this.redirectTimeout);
        debugger;
        rpc("/payment/post_process", { csrf_token: odoo.csrf_token })
            .then(this.handlePostProcessingResult);
        this.redirectToLandingRoute();
    }

    handlePostProcessingResult(postProcessingData) {
        this.landingRoute = postProcessingData.landing_route;
    }

    redirectToLandingRoute() {
        if (this.landingRoute) {
            window.location = this.landingRoute;
        }
    }

    destroyNotificationListener() {
        this.busService.unsubscribe(this.notificationType, this.triggerPostProcessingBind);
        this.busService.deleteChannel(this.notificationChannel);
    }
}

registry
    .category("public.interactions")
    .add("payment.payment_post_processing", PaymentPostProcessing);
