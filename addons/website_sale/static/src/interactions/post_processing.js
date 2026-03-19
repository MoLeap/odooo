import { patch } from "@web/core/utils/patch";

import { PaymentPostProcessing } from "@payment/interactions/post_processing";

patch(PaymentPostProcessing.prototype, {

    handlePostProcessingResult(postProcessingData) {
        debugger;
        super.handlePostProcessingResult()
        const { state, state_message } = postProcessingData;
        if (["cancel", "error"].includes(state)) {
            const defaultErrorMessage = _t("Payment was not successful, please try again.");
            this.landingRoute += `?payment_error=${state_message || defaultErrorMessage}`;
        }
    },
});
