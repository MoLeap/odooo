import { AvatarCard } from "@mail/core/web/avatar_card/avatar_card";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { onWillStart, useState } from "@odoo/owl";

patch(AvatarCard.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.state = useState({
            leaveSummary: null,
        });

        onWillStart(async () => {
            await this._fetchTimeOffSummary(this.props.id);
        });
    },

    async _fetchTimeOffSummary(employeeId) {
        try {
            const summary = await this.orm.call("hr.employee", "get_avatar_leave_summary", [
                employeeId,
            ]);
            this.state.leaveSummary = summary;
            this.state.lastFetchedId = employeeId;
        } catch {
            this.state.leaveSummary = null;
        }
    },

    async onTimeOffClick() {
        if (!this.employee?.id) {
            return;
        }
        const action = await this.orm.call("hr.employee", "action_time_off_dashboard", [
            [this.employee.id],
        ]);
        if (action) {
            await this.actionService.doAction(action);
        }
    },

    /** @override */
    get hasFooter() {
        return this.state.leaveSummary || super.hasFooter;
    },
});
