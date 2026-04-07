import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
import { Many2One } from "@web/views/fields/many2one/many2one";
import { Many2OneField, buildM2OFieldDescription } from "@web/views/fields/many2one/many2one_field";

export class Many2XAccountAccountTags extends Many2XAutocomplete {
    async loadOptionsSource(request) {
        const options = await super.loadOptionsSource(request);
        const hasSearchMore = options.some((o) =>
            (o.cssClass || "").includes("o_m2o_dropdown_option_search_more")
        );
        if (!hasSearchMore) {
            options.push({
                label: this.SearchMoreButtonLabel || _t("Search more..."),
                onSelect: this.onSearchMore.bind(this, request),
                cssClass: "o_m2o_dropdown_option o_m2o_dropdown_option_search_more",
            });
        }
        return options;
    }

    async onSearchMore(request) {
        const { getDomain, context, fieldString } = this.props;
        let dynamicFilters = [];
        if (request.length) {
            dynamicFilters = [
                {
                    description: _t("Quick search: %s", request),
                    domain: [["name", "ilike", request]],
                },
            ];
        }
        const title = _t("Search: %s", fieldString);
        this.selectCreate({
            domain: getDomain(),
            context,
            filters: dynamicFilters,
            title,
        });
    }
}

export class Many2OneAccountAccount extends Many2One {
    static components = {
        ...Many2One.components,
        Many2XAutocomplete: Many2XAccountAccountTags,
    };
}

export class Many2OneFieldAccountAccount extends Many2OneField {
    static components = {
        ...Many2OneField.components,
        Many2One: Many2OneAccountAccount,
    };
}

registry.category("fields").add("many2one_account_account_tag", {
    ...buildM2OFieldDescription(Many2OneFieldAccountAccount),
    additionalClasses: ["o_field_many2one"],
});
