import { useState } from "@web/owl2/utils";
import { Component } from "@odoo/owl";

export class OrderNotePopup extends Component {
    static template = "pos_self_order.OrderNotePopup";
    static props = {
        close: Function,
        getPayload: Function,
        note: { type: String, optional: true },
    };

    setup() {
        this.state = useState({ note: this.props.note || "" });
    }

    confirm() {
        this.props.getPayload(this.state.note);
        this.props.close();
    }
}
