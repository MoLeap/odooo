import { BuilderAction } from "@html_builder/core/builder_action";
import { BaseOptionComponent, useDomState } from "@html_builder/core/utils";
import { SNIPPET_SPECIFIC, SNIPPET_SPECIFIC_END } from "@html_builder/utils/option_sequence";
import { Plugin } from "@html_editor/plugin";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

export const POPUP = SNIPPET_SPECIFIC;
export const COOKIES_BAR = SNIPPET_SPECIFIC_END;

const SHARED_POPUPS_CONTAINER_SELECTOR = "#o_shared_blocks";
const PRODUCT_SHARED_BLOCKS_SELECTOR =
    "[id^='oe_structure_website_sale_product_'].oe_structure_not_nearest";
const PAGE_SPECIFIC_POPUPS_CONTAINER_SELECTOR = "main .oe_structure.o_savable";
const SHOW_ON_CURRENT_PAGE_VALUE = "currentPage";
const SHOW_ON_ALL_PAGES_VALUE = "allPages";
const SHOW_ON_ALL_PRODUCTS_VALUE = "allProducts";

export class PopupOption extends BaseOptionComponent {
    static template = "website.PopupOption";
    static selector = ".s_popup";
    static exclude = "#website_cookies_bar";
    static applyTo = ".modal";

    getPopupElement() {
        const editingElement = this.env.getEditingElement?.();
        return editingElement?.closest(".s_popup");
    }

    setup() {
        super.setup();
        this.showOnOptions = this.getResource("popup_show_on_options");
        this.domState = useDomState((editingElement) => {
            const popupEl = editingElement?.closest(".s_popup");
            const showOn = popupEl?.dataset.showOn || "";
            const hasMatch = this.showOnOptions.some((option) => option.value === showOn);
            const isUnavailableShowOn = !!showOn && !hasMatch;
            return { showOn, isUnavailableShowOn };
        });
        this.unavailableShowOnWarningMessage = _t(
            "The selected visibility target is unavailable (module uninstalled). Choose one of the available values."
        );
    }

    isShowOnOptionUnavailable() {
        if ("isUnavailableShowOn" in this.domState) {
            return this.domState.isUnavailableShowOn;
        }
        const popupEl = this.getPopupElement();
        const showOn = popupEl?.dataset.showOn;
        const hasMatch = this.showOnOptions.some((option) => option.value === showOn);
        const isUnavailable = !!showOn && !hasMatch;
        return isUnavailable;
    }

    get unavailableShowOnValue() {
        if ("showOn" in this.domState) {
            return this.domState.showOn;
        }
        const value = this.getPopupElement()?.dataset.showOn || "";
        return value;
    }
}

export class PopupCookiesOption extends BaseOptionComponent {
    static template = "website.PopupCookiesOption";
    static selector = ".s_popup#website_cookies_bar";
    static applyTo = ".modal";
}

function getPopupContainerFromSelectors(editable, selectors) {
    for (const selector of selectors) {
        const containerEl = editable.querySelector(selector);
        if (containerEl) {
            return containerEl;
        }
    }
    return null;
}

class PopupOptionPlugin extends Plugin {
    static id = "PopupOption";
    static dependencies = ["anchor", "visibility", "history", "popupVisibilityPlugin"];

    /** @type {import("plugins").WebsiteResources} */
    resources = {
        builder_options: [
            withSequence(POPUP, PopupOption),
            withSequence(COOKIES_BAR, PopupCookiesOption),
        ],
        dropzone_selector: {
            selector: ".s_popup",
            exclude: "#website_cookies_bar",
            excludeAncestor: ".s_popup, .s_table_of_content, .s_tabs, .s_tabs_images",
            dropIn: ":not(p).oe_structure:not(.oe_structure_solo):not([data-snippet] *), :not(.o_mega_menu):not(p)[data-oe-type=html]:not([data-snippet] *)",
        },
        builder_actions: {
            // Moves the snippet in #o_shared_blocks to be common to all pages
            // or inside the first editable oe_structure in the main to be on
            // current page only.
            MoveBlockAction,
            SetBackdropAction,
            CopyAnchorAction,
            SetPopupDelayAction,
        },
        is_node_empty_predicates: (el) => {
            if (!el.matches?.(".s_popup")) {
                return;
            }
            const popupModalChildrenEls = [...(el.querySelector(".modal-content")?.children ?? [])];
            return popupModalChildrenEls.every((child) => child.matches(".s_popup_close"));
        },
        on_cloned_handlers: this.onCloned.bind(this),
        on_snippet_dropped_handlers: withSequence(0, this.onSnippetDropped.bind(this)),
        // TODO remove when popup dragging from the page is disabled.
        on_element_dropped_handlers: withSequence(0, this.onElementDropped.bind(this)),
        on_will_remove_handlers: this.onWillRemove.bind(this),
        no_parent_containers: ".s_popup",
        popup_container_selectors: withSequence(10, PAGE_SPECIFIC_POPUPS_CONTAINER_SELECTOR),
        popup_show_on_options: [
            withSequence(10, {
                value: SHOW_ON_CURRENT_PAGE_VALUE,
                label: _t("This page"),
                pageSelector: null,
            }),
            withSequence(20, {
                value: SHOW_ON_ALL_PAGES_VALUE,
                label: _t("All pages"),
                pageSelector: null,
            }),
        ],
    };

    onCloned({ cloneEl }) {
        if (cloneEl.matches(".s_popup")) {
            this.assignUniqueID(cloneEl);
        }
    }

    onSnippetDropped({ snippetEl }) {
        if (snippetEl.matches(".s_popup")) {
            this.relocatePopup(snippetEl);
            if (!snippetEl.dataset.showOn) {
                snippetEl.dataset.showOn = SHOW_ON_CURRENT_PAGE_VALUE;
            }
            this.assignUniqueID(snippetEl);
            this.dependencies.history.addCustomMutation({
                apply: () => {
                    this.dependencies.visibility.toggleTargetVisibility(snippetEl, true);
                },
                revert: () => {
                    this.dependencies.visibility.toggleTargetVisibility(snippetEl, false);
                },
            });
        }
    }

    onWillRemove(el) {
        this.dependencies.visibility.toggleTargetVisibility(el, false);
        this.dependencies.history.addCustomMutation({
            apply: () => {
                this.dependencies.visibility.toggleTargetVisibility(el, false);
            },
            revert: () => {
                this.dependencies.visibility.toggleTargetVisibility(el, true);
            },
        });
    }

    assignUniqueID(editingElement) {
        editingElement.closest(".s_popup").id = `sPopup${Date.now()}`;
    }

    onElementDropped({ droppedEl }) {
        if (droppedEl.matches(".s_popup")) {
            this.relocatePopup(droppedEl);
        }
    }

    relocatePopup(editingElement) {
        const popupEl = editingElement.closest(".s_popup");
        if (popupEl.closest(SHARED_POPUPS_CONTAINER_SELECTOR)) {
            return;
        }
        if (popupEl.closest(PRODUCT_SHARED_BLOCKS_SELECTOR)) {
            const sharedBlocksEl = this.editable.querySelector(SHARED_POPUPS_CONTAINER_SELECTOR);
            const allProductsOption = this.getResource("popup_show_on_options").find(
                (showOnOption) => showOnOption.value === SHOW_ON_ALL_PRODUCTS_VALUE
            );
            if (sharedBlocksEl && allProductsOption) {
                sharedBlocksEl.insertAdjacentElement("afterbegin", popupEl);
                popupEl.dataset.showOn = allProductsOption.value;
                if (allProductsOption.pageSelector) {
                    popupEl.dataset.showOnSelector = allProductsOption.pageSelector;
                } else {
                    delete popupEl.dataset.showOnSelector;
                }
            }
            return;
        }
        const containerEl = getPopupContainerFromSelectors(
            this.editable,
            this.getResource("popup_container_selectors")
        );
        if (containerEl) {
            containerEl.insertAdjacentElement("afterbegin", popupEl);
        }
    }
}

// Moves the snippet in SHARED_POPUPS_CONTAINER_SELECTOR to be common to all pages
// or inside the first matching selector in popup_container_selectors resource
// to be on the current page only.
export class MoveBlockAction extends BuilderAction {
    static id = "moveBlock";
    isApplied({ editingElement, value }) {
        const popupEl = editingElement.closest(".s_popup");
        const showOn = popupEl?.dataset.showOn;
        if (showOn) {
            return showOn === value;
        }
        return popupEl.closest(SHARED_POPUPS_CONTAINER_SELECTOR)
            ? value === SHOW_ON_ALL_PAGES_VALUE
            : value === SHOW_ON_CURRENT_PAGE_VALUE;
    }
    apply({ editingElement, value }) {
        const popupEl = editingElement.closest(".s_popup");
        popupEl.dataset.showOn = value;

        const containerEl =
            value === SHOW_ON_CURRENT_PAGE_VALUE
                ? getPopupContainerFromSelectors(
                      this.editable,
                      this.getResource("popup_container_selectors")
                  )
                : this.editable.querySelector(SHARED_POPUPS_CONTAINER_SELECTOR);
        containerEl?.insertAdjacentElement("afterbegin", popupEl);

        const showOnOption = this.getResource("popup_show_on_options").find(
            (showOnOption) => showOnOption.value === value
        );
        if (showOnOption?.pageSelector) {
            popupEl.dataset.showOnSelector = showOnOption.pageSelector;
        } else {
            delete popupEl.dataset.showOnSelector;
        }
    }
}
export class SetBackdropAction extends BuilderAction {
    static id = "setBackdrop";
    isApplied({ editingElement }) {
        const hasBackdropColor = !!editingElement.style.getPropertyValue("background-color").trim();
        const hasNoBackdropClass = editingElement.classList.contains("s_popup_no_backdrop");
        return hasBackdropColor && !hasNoBackdropClass;
    }
    apply({ editingElement }) {
        editingElement.classList.remove("s_popup_no_backdrop");
        editingElement.style.setProperty("background-color", "var(--black-50)", "important");
    }
    clean({ editingElement }) {
        editingElement.classList.add("s_popup_no_backdrop");
        editingElement.style.removeProperty("background-color");
    }
}
export class CopyAnchorAction extends BuilderAction {
    static id = "copyAnchor";
    static dependencies = ["anchor"];
    apply({ editingElement }) {
        this.dependencies.anchor.createOrEditAnchorLink(editingElement);
    }
}
export class SetPopupDelayAction extends BuilderAction {
    static id = "setPopupDelay";
    apply({ editingElement, value }) {
        editingElement.dataset.showAfter = value * 1000;
    }
    getValue({ editingElement }) {
        return editingElement.dataset.showAfter / 1000;
    }
}

registry.category("website-plugins").add(PopupOptionPlugin.id, PopupOptionPlugin);
