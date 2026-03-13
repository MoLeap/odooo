import { Component } from "@odoo/owl";

export class ProgressBar extends Component {
    static template = "point_of_sale.ProgressBar";
    static props = {
        currentValue: { type: Number, required: true },
        maxValue: { type: Number, required: true },
        addressNeeded: { type: Boolean, required: true },
    };

    remainingTime() {
        const minutes = this.props.currentValue;
        if (minutes >= 1440) {
            const days = Math.ceil(minutes / 1440);
            return days === 1 ? "1 day left" : `${days} days left`;
        }
        if (minutes >= 60) {
            const hours = Math.ceil(minutes / 60);
            return hours === 1 ? "1 hour left" : `${hours} hours left`;
        }
        return `${minutes} min. left`;
    }
}
