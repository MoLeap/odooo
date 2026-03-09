import { PaymentInterface } from "@point_of_sale/app/utils/payment/payment_interface";
import { CashmaticService } from "@pos_cashmatic/cashmatic_service";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

export class PaymentCashmatic extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.dialog = this.env.services.dialog;
        this.cashmaticService = new CashmaticService();
        this.cashmaticService.connect(
            this.payment_method_id.cashmatic_ip,
            this.payment_method_id.cashmatic_username,
            this.payment_method_id.cashmatic_password,
            this.payment_method_id.cashmatic_use_lna,
        );
    }

    get paymentLine() {
        const order = this.pos.getOrder();
        if (!order) {
            return null;
        }

        const cashmaticPaymentLines = order.payment_ids.filter(
            (line) => line.payment_method_id === this.payment_method_id
        );

        return cashmaticPaymentLines.find((line) =>
            ["waiting", "waitingCancel"].includes(line.payment_status)
        );
    }

    async sendPaymentRequest() {
        if (!this.paymentLine) {
            return false;
        }

        const amountInCents = Math.round(
            this.paymentLine.amount * Math.pow(10, this.pos.currency.decimal_places)
        );
        const notDispensed =  await this.cashmaticService
            .sendPaymentRequest(amountInCents).catch((error) => {
                this.showError(_t("Cashmatic payment failed: %s", error.message));
            });

        if (!notDispensed) {
            return false;
        }
        if (notDispensed > 0) {
            this.showError(
                _t("The cash machine could not dispense %s. Please give the remaining amount to the customer manually.",
                    this.env.utils.formatCurrency(notDispensed / 100)
                )
            );
        }
        return true;
    }

    async sendPaymentCancel() {
        await this.cashmaticService.cancelCurrentPayment().catch((error) => {
            this.showError(_t("Cashmatic cancellation failed: %s", error.message));
            return false;
        });
        return true;
    }

    get amountInserted() {
        return this.cashmaticService.state.amountInserted/100;
    }

    get amountDispensed() {
        return this.cashmaticService.state.amountDispensed/100;
    }

    showError(message) {
        this.dialog.add(AlertDialog, {
            title: _t("Cash Machine Error"),
            body: message,
        });
    }
}
