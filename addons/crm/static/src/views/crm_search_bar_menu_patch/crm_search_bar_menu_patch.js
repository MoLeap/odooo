import { patch } from "@web/core/utils/patch";
import { SearchBarMenu } from "@web/search/search_bar_menu/search_bar_menu";

patch(SearchBarMenu.prototype, {
    get crmTeamFilterItem() {
        return this.filterItems.find(
            (item) =>
                item.name === "crm_sales_teams" && (item.type === "lazyParentFilter" || item.options)
        );
    }
});
