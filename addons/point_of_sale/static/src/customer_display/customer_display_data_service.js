import { reactive } from "@web/owl2/utils";
import { registry } from "@web/core/registry";
import { session } from "@web/session";
import { logPosMessage } from "@point_of_sale/app/utils/pretty_console_log";

export const CONSOLE_COLOR = "#F5B427";

export const CustomerDisplayDataService = {
    dependencies: ["pos_webrtc"],
    async start(env, services) {
        return this.setup(...arguments);
    },

    async setup(env, { pos_webrtc }) {
        this.data = reactive({});
        this.posWebrtc = pos_webrtc;

        await this.initPosWebrtc();

        window.posmodel = this;
        return this.data;
    },

    async initPosWebrtc() {
        this.posWebrtc.addListener(this.onDataReceived.bind(this));
        this.posWebrtc.shouldInitiateOffer = true;
        await this.posWebrtc.init(session.device_uuid);
    },

    onDataReceived(rawData) {
        if (!rawData || typeof rawData !== "string") {
            return;
        }

        try {
            const parsedData = JSON.parse(rawData);
            Object.assign(this.data, parsedData);
        } catch (error) {
            logPosMessage(
                "CustomerDisplayDataService",
                "onDataReceived",
                "Failed to parse WebRTC message",
                CONSOLE_COLOR,
                [error]
            );
        }
    },
};

registry.category("services").add("customer_display_data", CustomerDisplayDataService);
