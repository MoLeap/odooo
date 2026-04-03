import { user } from "@web/core/user";

export async function baseExportCogDisplayCondition({ config, searchModel, isSmall }) {
    const baseOk = (
        !isSmall &&
        searchModel.resModel === "hr.employee" &&
        config.actionType === "ir.actions.act_window" &&
        ["gantt", "calendar", "list", "pivot", "form"].includes(config.viewType)
    );
    if (!baseOk) {
        return false;
    }

    const userCompany = await searchModel.orm.read(
        "res.company",
        [user.activeCompany.id],
        ["country_code"]
    );
    return userCompany[0]?.country_code === "BE";
}
