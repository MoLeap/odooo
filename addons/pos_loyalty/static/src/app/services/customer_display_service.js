import { patch } from "@web/core/utils/patch";
import { CustomerDisplayService } from "@point_of_sale/customer_display/customer_display_service";

patch(CustomerDisplayService.prototype, {
    _buildDisplayPayload(order) {
        const orderData = super._buildDisplayPayload(order);
        orderData.loyaltyData = order?.getLoyaltyPoints() || [];
        return orderData;
    },
});
