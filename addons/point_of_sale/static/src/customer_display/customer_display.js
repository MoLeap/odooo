import { useLayoutEffect, useRef } from "@web/owl2/utils";
import { Component, whenReady, useState } from "@odoo/owl";
import { OdooLogo } from "@point_of_sale/app/components/odoo_logo/odoo_logo";
import { useSingleDialog } from "@point_of_sale/customer_display/utils";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { session } from "@web/session";
import { useService } from "@web/core/utils/hooks";
import { mountComponent } from "@web/env";
import { BadgeTag } from "@web/core/tags_list/badge_tag";
import { QRPopup } from "@point_of_sale/app/components/popups/qr_code_popup/qr_code_popup";
import { useTime } from "@point_of_sale/app/hooks/time_hook";

export class CustomerDisplay extends Component {
    static template = "point_of_sale.CustomerDisplay";
    static components = { OdooLogo, MainComponentsContainer, BadgeTag };
    static props = [];

    setup() {
        this.session = session;

        this.customerDisplayService = useService("customer_display_service");
        this.customerDisplayService.initReceiver(this.session.identifier);
        this.order = useState(this.customerDisplayService.data);

        window.posmodel = this.customerDisplayService;

        this.time = useTime();
        const singleDialog = useSingleDialog();

        this.scrollableRef = useRef("scrollable");
        useLayoutEffect(() => {
            this.scrollableRef.el
                ?.querySelector(".orderline.selected")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        useLayoutEffect(
            (qrPaymentData) => {
                if (!qrPaymentData || qrPaymentData.qrCode !== this.order.prevQrCode) {
                    singleDialog.close();
                }
                if (qrPaymentData?.qrCode) {
                    singleDialog.open(QRPopup, qrPaymentData);
                }

                this.order.prevQrCode = qrPaymentData?.qrCode || null;
            },
            () => [this.order.qrPaymentData]
        );
    }

    parseInternalNotes(noteStr) {
        if (!noteStr || typeof noteStr !== "string") {
            return [];
        }
        return JSON.parse(noteStr);
    }

    get configLogoSrc() {
        return `/web/image/pos.config/${this.session.config_id}/logo`;
    }
}

whenReady(() => mountComponent(CustomerDisplay, document.body));
