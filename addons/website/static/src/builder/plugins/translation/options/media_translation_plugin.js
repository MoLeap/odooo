import { BuilderAction } from "@html_builder/core/builder_action";
import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

export class MediaTranslationPlugin extends Plugin {
    static id = "mediaTranslation";
    static dependencies = ["imagePostProcess", "translation"];
    /** @type {import("plugins").WebsiteResources} */
    resources = {
        builder_actions: {
            TranslateMediaSrcAction,
        },
        on_will_save_media_image_overrides: async (editingElement, newImgEl) => {
            // Replicate all attributes from the new image to the current
            // element, so that the translations are linked to the original
            // element on save.
            for (const attr of editingElement.attributes) {
                editingElement.removeAttribute(attr.localName);
            }
            for (const attr of newImgEl.attributes) {
                editingElement.setAttribute(attr.localName, attr.value);
            }
            const updateImageAttributes = await this.dependencies.imagePostProcess.processImage({
                img: editingElement,
                newDataset: { ...newImgEl.dataset },
            });
            updateImageAttributes();
            return true;
        },
    };
}

registry.category("translation-plugins").add(MediaTranslationPlugin.id, MediaTranslationPlugin);

export class TranslateMediaSrcAction extends BuilderAction {
    static id = "translateMediaSrc";
    static dependencies = ["media"];

    setup() {
        this.savingMap = {
            images: this.saveImage.bind(this),
        };
    }

    async apply({ editingElement, params: { mainParam: mediaType } }) {
        await new Promise((resolve) => {
            const onClose = this.dependencies.media.openMediaDialog({
                onlyImages: mediaType === "images",
                noImages: mediaType !== "images",
                visibleTabs: [mediaType.toUpperCase()],
                node: editingElement,
                // TODO @image-translate: this is a one-to-one "translation" of
                // the image. We bring back from the original image all the
                // manipulations that have been done: shape, resizing, filters..
                // But if the image is different, those options should also be
                // adaptable. We should have translation options to handle the
                // new image exactly like what is possible in the builder.
                copiedDataAttributes:
                    mediaType === "images" ? ["oeTranslationState", "resizeWidth", "glFilter"] : [],
                save: async (newMediaEl) => {
                    await this.savingMap[mediaType](editingElement, newMediaEl);
                },
            });
            onClose.then(resolve);
        });
    }
    /**
     * @param {HTMLElement} el - element whose attribute is translated
     * @param {string} translation - new translation
     * @param {string} originalText - text before the new translation
     * @param {string} attribute - attribute to update in the translation map
     */
    handleTranslationMapHistory(el, translation, originalText, attribute) {
        const updateTranslationMap = this.dependencies.translation.updateTranslationMap;
        this.dependencies.history.applyCustomMutation({
            apply: () => {
                updateTranslationMap(el, translation, attribute);
            },
            revert: () => {
                updateTranslationMap(el, originalText, attribute);
            },
        });
    }

    async saveImage(editingElement) {
        const elTranslationInfo = this.dependencies.translation.getTranslationInfo(editingElement);
        const originalSrc = elTranslationInfo.src.translation;
        const originalSrcset = elTranslationInfo.srcset?.translation;
        const translatedSrc = editingElement.getAttribute("src");
        this.handleTranslationMapHistory(editingElement, translatedSrc, originalSrc, "src");
        if (originalSrcset) {
            // Hack: we don't have the new srcset yet (it's computed on save).
            // Instead, register a dummy change (empty string) to update its
            // translation later on save.
            this.handleTranslationMapHistory(editingElement, "", originalSrcset, "srcset");
        }
        editingElement.classList.add("oe_translated");
        this.trigger("on_media_replaced_handlers", { newMediaEl: editingElement });
    }
}
