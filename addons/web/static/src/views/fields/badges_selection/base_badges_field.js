import { Component } from "@odoo/owl";
import { SelectMenu } from "@web/core/select_menu/select_menu";
import { hasTouch } from "@web/core/browser/feature_detection";
import { standardFieldProps } from "../standard_field_props";

export class BaseBadgesField extends Component {
    static template = "web.BaseBadgesField";
    static props = {
        ...standardFieldProps,
        badgeLimit: { type: Number, optional: true },
        placeholder: { type: String, optional: true },
        options: { type: Array },
        string: { type: String },
        value: [String, Number, Boolean, { value: null }],
        onChange: { type: Function },
        canDeselect: { type: Boolean, optional: true },
    };
    static components = {
        SelectMenu,
    };

    /**
     * Computes the ordered list of options. If the selected value is
     * beyond the limit, it is moved into the visible "unfolded" range.
     */
    get optionsDict() {
        const { options, badgeLimit, value } = this.props;
        const displayOptions = [...options];

        if (this.hasMoreThanMax) {
            const index = displayOptions.findIndex((opt) => opt[0] === value);

            // If selected value is in the "More" dropdown, move it to the visible limit
            if (index >= badgeLimit) {
                const [selectedOption] = displayOptions.splice(index, 1);
                displayOptions.splice(badgeLimit - 1, 0, selectedOption);
            }
        }

        return {
            unfolded: badgeLimit ? displayOptions.slice(0, badgeLimit) : displayOptions,
            folded: badgeLimit ? displayOptions.slice(badgeLimit) : [],
        };
    }

    get badgesOptions() {
        return this.optionsDict.unfolded;
    }

    get selectOptions() {
        return this.optionsDict.folded.map(([value, label, icon]) => ({
            value,
            label,
            icon,
        }));
    }

    get placeholder() {
        const hiddenCount = this.props.options.length - this.props.badgeLimit;
        return `+${hiddenCount}`;
    }

    get hasMoreThanMax() {
        return this.props.badgeLimit && this.props.options.length > this.props.badgeLimit;
    }

    get string() {
        return this.props.string;
    }

    get value() {
        return this.props.value;
    }

    get isBottomSheet() {
        return this.env.isSmall && hasTouch();
    }

    stringify(value) {
        return JSON.stringify(value);
    }

    onChange(value) {
        if (value === this.value && this.props.canDeselect) {
            this.props.onChange(false);
        } else {
            this.props.onChange(value);
        }
    }

    getBadgeClassNames(option = false) {
        return this.props.readonly ? "" : { active: this.value === option[0] };
    }
}

export const extractStandardFieldProps = (props = {}) => ({
    id: props.id,
    name: props.name,
    readonly: props.readonly,
    record: props.record,
});
