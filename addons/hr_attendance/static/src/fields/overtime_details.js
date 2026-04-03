import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { _t } from "@web/core/l10n/translation";

import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { BadgeTag } from "@web/core/tags_list/badge_tag";

import { Record } from "@web/model/record";
import { Field } from "@web/views/fields/field";

import {
    onWillStart,
    Component,
    useState,
    useRef,
    useEffect,
} from "@odoo/owl";

import { serializeDateTime } from "@web/core/l10n/dates";
import { formatFloatTime } from "@web/views/fields/formatters";

// ---------------------------------------------------------------------
// POPOVER
// ---------------------------------------------------------------------

export class OvertimeDetailsPopover extends Component {
    static template = "hr_attendance.OvertimeDetailsPopover";
    static components = { BadgeTag, Record, Field };

    static props = {
        formattedData: Array,
        recordProps: Function,
        close: Function,
        isReadonly: Boolean,
        save: Function,
    };

    async onClose() {
        try {
            await this.props.save();
        } finally {
            this.props.close();
        }
    }
}

// ---------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------

export class OvertimeDetails extends Component {
    static template = "hr_attendance.OvertimeDetails";
    static components = { BadgeTag, Record, Field };
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.orm = useService("orm");
        this.popover = usePopover(OvertimeDetailsPopover);
        this.state = useState({
            formattedData: [],
        });
        this.widgetRef = useRef("overtimeDetails");
        this.loadRequestId = 0;
        this.initialDataSnapshot = null;
        this.isSaving = false;

        onWillStart(this.willStart);

        useEffect(
            () => {
                this.loadDataFromServer();
            },
            () => [
                this.props.record.data.check_in,
                this.props.record.data.check_out,
            ]
        );
    }

    // ---------------------------------------------------------------------
    // LIFECYCLE
    // ---------------------------------------------------------------------

    async willStart() {
        await this.loadDataFromServer();
    }

    // ---------------------------------------------------------------------
    // DATA LOADING
    // ---------------------------------------------------------------------

    fetchPlansArgs(props) {
        const record = props.record;
        const args = {};

        if (record.data.employee_id) {
            args.employee_id = record.data.employee_id.id;
        }

        if (record.data.check_in) {
            args.check_in = serializeDateTime(record.data.check_in);
        }

        return args;
    }

    async loadDataFromServer(props = this.props) {
        const requestId = ++this.loadRequestId;
        const args = this.fetchPlansArgs(props);

        if (!args.employee_id || !args.check_in) {
            this.state.formattedData = [];
            return;
        }

        const domain = [
            ["employee_id", "=", args.employee_id],
            ["time_start", "=", args.check_in],
        ];
        const fields = [
            "rule_ids",
            "duration",
            "manual_duration",
            "amount_rate",
        ];
        const records = await this.orm.searchRead(
            "hr.attendance.overtime.line",
            domain,
            fields
        );

        if (requestId !== this.loadRequestId) return;

        const ruleIds = [...new Set(records.flatMap((r) => r.rule_ids || []))];
        let rules = [];
        if (ruleIds.length) {
            rules = await this.orm.read(
                "hr.attendance.overtime.rule",
                ruleIds,
                ["name"]
            );
        }

        const ruleMap = {};
        for (const r of rules) {
            ruleMap[r.id] = r.name;
        }

        const formatted = records.map((rec) => ({
            id: rec.id,
            duration: rec.duration,
            manual_duration: rec.manual_duration,
            amount_rate: rec.amount_rate * 100,
            rule_ids: (rec.rule_ids || []).map((id) => ({
                id,
                display_name: ruleMap[id],
            })),
        }));
        this.state.formattedData = formatted;
        this.initialDataSnapshot = JSON.stringify(formatted);
    }

    // ---------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------

    async _onOpenPopover() {
        await this.loadDataFromServer();

        this.popover.open(this.widgetRef.el, {
            formattedData: this.state.formattedData,
            recordProps: this.recordProps.bind(this),
            isReadonly: this.isOvertimeReadonly,
            save: this.save.bind(this),
        });
    }

    formatDurationOvertime() {
        const total = this.state.formattedData.reduce(
            (sum, line) => sum + (line.manual_duration || 0),
            0
        );
        return formatFloatTime(total);
    }

    // ---------------------------------------------------------------------
    // RECORD PROPS
    // ---------------------------------------------------------------------

    recordProps(line) {
        const overtimeRuleFields = {
            id: { type: "int" },
            display_name: { type: "char" },
        };

        const fields = {
            rule_ids: {
                string: _t("Overtime Rule"),
                type: "many2many",
                relation: "hr.attendance.overtime.rule",
                related: {
                    fields: overtimeRuleFields,
                    activeFields: overtimeRuleFields,
                },
            },
            manual_duration: {
                string: _t("Manual Duration"),
                type: "float_time",
            },
            amount_rate: {
                string: _t("Rate"),
                type: "float",
            },
        };
        const values = {
            rule_ids: line.rule_ids || [],
            manual_duration: line.manual_duration,
            amount_rate: line.amount_rate,
        };
        return {
            fields,
            values,
            activeFields: fields,
            resModel: "hr.attendance.overtime.line",
            hooks: {
                onRecordChanged: (record, changes) =>
                    this.lineChanged(record, changes, line),
            },
        };
    }

    // ---------------------------------------------------------------------
    // EDITING
    // ---------------------------------------------------------------------

    lineChanged(record, changes, line) {
        const index = this.state.formattedData.findIndex(
            (l) => l.id === line.id
        );
        if (index === -1) return;

        const updated = { ...this.state.formattedData[index] };

        if ("duration" in changes) {
            updated.duration = record.data.duration;
        }

        if ("manual_duration" in changes) {
            updated.manual_duration = record.data.manual_duration;
        }

        this.state.formattedData[index] = updated;
        this.state.formattedData = [...this.state.formattedData];
    }

    // ---------------------------------------------------------------------
    // SAVE
    // ---------------------------------------------------------------------

    async save() {
        if (this.isOvertimeReadonly || this.isSaving) return;
        if (
            JSON.stringify(this.state.formattedData) ===
            this.initialDataSnapshot
        ) {
            return;
        }
        this.isSaving = true;
        try {
            const updates = [];
            for (const line of this.state.formattedData) {
                if (!line.id) continue;
                updates.push(
                    this.orm.write("hr.attendance.overtime.line", [line.id], {
                        duration: line.duration,
                        manual_duration:
                            line.manual_duration ?? line.duration,
                        amount_rate: line.amount_rate / 100,
                    })
                );
            }
            await Promise.all(updates);
            await this.props.record.load();
            // refresh snapshot
            this.initialDataSnapshot = JSON.stringify(
                this.state.formattedData
            );
        } finally {
            this.isSaving = false;
        }
    }

    // ---------------------------------------------------------------------
    // READONLY
    // ---------------------------------------------------------------------

    get isOvertimeReadonly() {
        const status = this.props.record.data.overtime_status;
        return (
            this.props.readonly ||
            status === "approved" ||
            status === "refused"
        );
    }
}

// ---------------------------------------------------------------------

export const overtimeDetails = {
    component: OvertimeDetails,
    supportedTypes: ["float"],
};

registry.category("fields").add("overtime_details", overtimeDetails);
