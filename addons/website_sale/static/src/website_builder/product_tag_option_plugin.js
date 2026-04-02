import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { BuilderAction } from "@html_builder/core/builder_action";

export class ProductTagOptionPlugin extends Plugin {
    static id = "productTagOption";
    resources = {
        builder_actions: {
            ProductTagColorAction,
            ProductTagImageAction,
        },
    };
}

export class ProductTagColorAction extends BuilderAction {
    static id = "productTagColorAction";
    static dependencies = ["savePlugin"];

    setup() {
        this.reload = true;
    }

    getValue({ editingElement: el }) {
        return el.style.color;
    }

    async apply({ editingElement: el, value }) {
        const tag_id = parseInt(el.dataset.oeId);
        await rpc("/shop/config/tag", {
            tag_id: tag_id,
            color: value,
        });
        await this.dependencies.savePlugin.save();
        await this.config.reloadEditor();
    }
}

export class ProductTagImageAction extends BuilderAction {
    static id = "productTagImageAction";
    static dependencies = ["media"];

    async load({ editingElement: el }) {
        return new Promise((resolve) => {
            const onClose = this.dependencies.media.openMediaDialog({
                addFieldImage: true,
                multiImages: false,
                visibleTabs: ["IMAGES"],
                node: el,
                save: async (imgEl, selectedMedia) => {
                    if (selectedMedia.length) {
                        resolve({ imgEl, selectedMedia });
                    }
                },
            });
            onClose.then(resolve);
        });
    }

    async apply({ editingElement: el, loadResult }) {
        const tag_id = parseInt(el.dataset.oeId);
        const { imgEl, selectedMedia } = loadResult;

        this.setTagImage(el, imgEl.src);

        await rpc("/shop/config/tag", {
            tag_id: tag_id,
            image: selectedMedia[0]["id"],
        });
    }

    setTagImage(editingElement, imageUrl) {
        editingElement.innerHTML = "";
        editingElement.className = "order-0 o_wsale_product_tag_image o_savable";
        editingElement.dataset.oeType = "image";
        editingElement.dataset.oeModel = "product.tag";
        editingElement.dataset.oeExpression = "tag.image";
        editingElement.dataset.oeField = "image";
        editingElement.style = "";

        const img = document.createElement("img");
        img.src = imageUrl;
        img.className = "img img-fluid o_product_tag_img rounded";

        editingElement.appendChild(img);
    }
}

registry.category("website-plugins").add(ProductTagOptionPlugin.id, ProductTagOptionPlugin);
