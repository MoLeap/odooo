import { patch } from "@web/core/utils/patch";
import { OvertimeDetails } from "@hr_attendance/fields/overtime_details";


patch(OvertimeDetails.prototype, {

    // Extend loadDataFromServer
    async loadDataFromServer(props = this.props) {
        await super.loadDataFromServer(...arguments);

        const args = this.fetchPlansArgs(props);
        if (!args.employee_id || !args.check_in) {
            return;
        }

        const domain = [
            ["employee_id", "=", args.employee_id],
            ["time_start", "=", args.check_in],
        ];

        const records = await this.orm.searchRead(
            "hr.attendance.overtime.line",
            domain,
            ["id", "compensable_as_leave"]
        );

        const map = {};
        for (const r of records) {
            map[r.id] = r.compensable_as_leave;
        }

        this.state.formattedData = this.state.formattedData.map(line => ({
            ...line,
            compensable_as_leave: map[line.id],
        }));
    },

    // Extend recordProps
    recordProps(line) {
        const result = super.recordProps(...arguments);

        result.fields.compensable_as_leave = {
            string: "Compensable as Time Off",
            type: "boolean",
        };

        result.values.compensable_as_leave =
            line.compensable_as_leave;

        result.activeFields.compensable_as_leave =
            result.fields.compensable_as_leave;

        return result;
    },

    // Extend lineChanged
    lineChanged(record, changes, line) {
        super.lineChanged(...arguments);

        if ("compensable_as_leave" in changes) {
            const index = this.state.formattedData.findIndex(
                (l) => l.id === line.id
            );
            if (index !== -1) {
                this.state.formattedData[index] = {
                    ...this.state.formattedData[index],
                    compensable_as_leave:
                        record.data.compensable_as_leave,
                };
            }
        }
    },

    // Extend save
    async save() {
        for (const line of this.state.formattedData) {
            if (!line.id) continue;

            await this.orm.write(
                "hr.attendance.overtime.line",
                [line.id],
                {
                    compensable_as_leave:
                        line.compensable_as_leave,
                }
            );
        }

        await super.save(...arguments);
    },
});
