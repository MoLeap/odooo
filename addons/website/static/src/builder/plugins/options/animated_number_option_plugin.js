import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { firstLeaf } from "@html_editor/utils/dom_traversal";
import { BuilderAction } from "@html_builder/core/builder_action";
import { ClassAction } from "@html_builder/core/core_builder_action_plugin";

class AnimatedNumberOptionPlugin extends Plugin {
    static id = "animatedNumberOption";
    /** @type {import("plugins").WebsiteResources} */
    resources = {
        so_content_addition_selectors: [".s_animated_number"],
        builder_actions: {
            ToggleTitleAnimatedNumberAction,
            ToggleAnimatedNumberPrefixAction,
            ToggleAnimatedNumberPostfixAction,
        },
        clean_for_save_processors: this.cleanForSave.bind(this),
    };

    cleanForSave(root) {
        for (const el of root.querySelectorAll(".s_animated_number")) {
            let numberEl = el.querySelector(".s_animated_number_value");
            if (!numberEl) {
                continue;
            }
            numberEl = firstLeaf(numberEl, (el) => el.childNodes.length != 1);
            numberEl = numberEl.nodeType == Node.TEXT_NODE ? numberEl.parentElement : numberEl;
            numberEl.textContent = el.dataset.startValue || 0;
        }
        for (const el of root.querySelectorAll(
            ".s_animated_number_prefix, .s_animated_number_postfix"
        )) {
            if (el.classList.contains("d-none") || el.textContent == "") {
                el.remove();
            }
        }
    }
}

export class ToggleTitleAnimatedNumberAction extends ClassAction {
    static id = "toggleTitleAnimatedNumber";

    isApplied({ editingElement, value }) {
        if (!value) {
            return !editingElement.querySelector(".s_animated_number_label");
        } else {
            return true;
        }
    }
    apply({ editingElement, value }) {
        if (!value) {
            editingElement.querySelector(".s_animated_number_label")?.remove();
        } else if (!editingElement.querySelector(".s_animated_number_label")) {
            const titleEl = document.createElement("div");
            titleEl.classList.add(
                "s_animated_number_label",
                "d-flex",
                "justify-content-center",
                "align-items-center"
            );
            const h2El = document.createElement("h2");
            h2El.textContent = "Clients";
            titleEl.append(h2El);
            editingElement.prepend(titleEl);
        }
    }
}

export class ToggleAnimatedNumberTextAction extends BuilderAction {
    textClass = "";
    textDefault = "";
    textPosition = "";

    isApplied({ editingElement }) {
        return !!editingElement.querySelector(`.${this.textClass}:not(.d-none)`);
    }
    apply({ editingElement }) {
        let textEl = editingElement.querySelector(`.${this.textClass}`);
        if (textEl) {
            textEl.classList.remove("d-none");
        } else {
            const numberEl = editingElement.querySelector(".s_animated_number_value");
            textEl = numberEl.cloneNode(true);
            let leafEl = firstLeaf(textEl, (el) => el.childNodes.length != 1);
            leafEl = leafEl.nodeType == Node.TEXT_NODE ? leafEl.parentElement : leafEl;
            leafEl.textContent = this.textDefault;
            textEl.classList.remove("s_animated_number_value");
            textEl.classList.add(this.textClass);
            const displayEl = editingElement.querySelector(".s_animated_number_display");
            displayEl.insertAdjacentElement(this.textPosition, textEl);
        }
    }
    clean({ editingElement }) {
        editingElement.querySelector(`.${this.textClass}`)?.classList.add("d-none");
    }
}

export class ToggleAnimatedNumberPrefixAction extends ToggleAnimatedNumberTextAction {
    static id = "toggleAnimatedNumberPrefix";
    textClass = "s_animated_number_prefix";
    textDefault = "+";
    textPosition = "afterbegin";
}

export class ToggleAnimatedNumberPostfixAction extends ToggleAnimatedNumberTextAction {
    static id = "toggleAnimatedNumberPostfix";
    textClass = "s_animated_number_postfix";
    textDefault = "%";
    textPosition = "beforeend";
}

registry.category("website-plugins").add(AnimatedNumberOptionPlugin.id, AnimatedNumberOptionPlugin);
