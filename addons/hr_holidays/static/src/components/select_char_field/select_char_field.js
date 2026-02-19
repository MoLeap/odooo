/** @odoo-module **/

import { CharField, charField } from "@web/views/fields/char/char_field";
import { registry } from "@web/core/registry";
import { onMounted, useRef } from "@odoo/owl";

export class SelectCharField extends CharField {
    setup() {
        super.setup();
        const inputRef = useRef("input");

        onMounted(() => {
            if (inputRef.el) {
                inputRef.el.addEventListener("click", () => {
                    inputRef.el.select();
                });

                inputRef.el.addEventListener("focus", () => {
                    inputRef.el.select();
                });
            }
        });
    }
}

export const selectCharConfig = {
    ...charField,
    component: SelectCharField,
};

registry.category("fields").add("select_char", selectCharConfig);
