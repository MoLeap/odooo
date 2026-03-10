import { Component, useSubEnv, xml } from "@odoo/owl";
import { batched } from "@web/core/utils/timing";

export class ImgGroup extends Component {
    static template = xml`<t><t t-slot="default"/></t>`;
    static props = {
        slots: Object,
    };

    setup() {
        this.imgItems = [];
        this.loadImgs = batched(this._loadImgs.bind(this));

        useSubEnv({
            imgGroup: {
                addImgProm: (promise, onLoaded) => {
                    this.imgItems.push({ promise, onLoaded });
                    this.loadImgs();
                },
            },
        });
    }

    async _loadImgs() {
        const items = this.imgItems;
        this.imgItems = [];
        await Promise.all(items.map((item) => item.promise));
        for (const item of items) {
            item.onLoaded();
        }
        // If more items arrived while we were awaiting (next scroll batch),
        // trigger another _loadImgs run for them.
        if (this.imgItems.length) {
            this.loadImgs();
        }
    }
}
