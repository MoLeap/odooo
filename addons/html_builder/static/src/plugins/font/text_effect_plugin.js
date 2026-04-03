import { Plugin } from "@html_editor/plugin";
import { childNodeIndex, DIRECTIONS, nodeSize } from "@html_editor/utils/position";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { isStylable } from "@html_editor/utils/dom_info";
import { TextEffectSelector } from "./text_effect_selector";
import { BuilderAction } from "@html_builder/core/builder_action";
import {
    ancestors,
    closestElement,
    findFurthest,
    selectElements,
} from "@html_editor/utils/dom_traversal";
import { TextEffectUtil } from "./text_effect_util";

export class TextEffectPlugin extends Plugin {
    static id = "textEffect";
    static dependencies = ["selection", "split", "history", "format"];
    /** @type {import("plugins").EditorResources} */
    resources = {
        builder_actions: {
            UpdateTextEffectAction,
        },
        toolbar_items: [
            withSequence(15, {
                id: "textEffect",
                groupId: "decoration",
                namespaces: ["expanded"],
                description: _t("Apply Text Effects"),
                Component: TextEffectSelector,
                props: {
                    config: this.config.getAnimateTextConfig(), // TODO obtain a more neutral method name
                    getTextEffectOrCreateDefault: this.getTextEffectOrCreateDefault.bind(this),
                    isActive: this.isTextEffectActive.bind(this),
                    isDisabled: this.isTextEffectDisabled.bind(this),
                },
                isAvailable: (selection) => !selection.isCollapsed,
                isDisabled: (selection, nodes) =>
                    selection.isCollapsed || nodes.some((node) => !isStylable(node)),
            }),
        ],
        user_commands: [
            // TODO remove ?
            {
                id: "applyTextEffect",
                run: ({ color, mode }) => {
                    // this.applyColor(color, mode);
                    this.dependencies.history.addStep();
                },
                isAvailable: (selection) => !selection.isCollapsed,
            },
        ],
        has_format_predicates: (node) => {
            if (closestElement(node, "[data-text-effect]")) {
                return true;
            }
        },
        is_node_splittable_predicates: (node) => {
            if (node.matches?.("[data-text-effect]")) {
                return false;
            }
        },
        clean_for_save_processors: this.removeEmptyTextEffects.bind(this),
        on_remove_all_formats_handlers: (nodes) => {
            for (const node of nodes) {
                const formattedElement = closestElement(node, "[data-text-effect]");
                if (formattedElement) {
                    delete formattedElement.dataset.textEffect;
                    TextEffectUtil.applyConfiguredEffects(formattedElement);
                }
            }
        },
    };
    /**
     * Returns the element that is a text with an effect that corresponds to the
     * current selection (if there is any)
     *
     * @returns {HTMLElement?}
     */
    getTextEffect() {
        const selection = this.dependencies.selection.getSelectionData().editableSelection;
        const ancestor = closestElement(selection.commonAncestorContainer, "[data-text-effect]");
        if (ancestor) {
            const selectionText = selection.textContent().replace(/\s+/g, " ").trim();
            const ancestorText = ancestor.innerText.replace(/\s+/g, " ").trim();
            if (selection.isCollapsed || selectionText === ancestorText) {
                return ancestor;
            }
        }
    }
    /**
     * @return {HTMLElement?} The `commonAncestorContainer` after the split
     * (null if splits are prevented by an unsplittable node)
     */
    splitForTextEffect({ anchorNode, focusNode, commonAncestorContainer }) {
        let commonAncestor = commonAncestorContainer;
        for (let [node, forward] of [
            [anchorNode, true],
            [focusNode, false],
        ]) {
            let needToMeetCommonAncestor =
                node !== commonAncestor && node.parentNode !== commonAncestor;
            let needToMeetShadowedTextAncestor = !!closestElement(node, "[data-text-effect]");
            let updatedCommonAncestor = needToMeetCommonAncestor ? undefined : commonAncestor;

            // Go up to the common ancestor of the selection, or to the
            // containing text with effect (whichever is the furthest)
            while (needToMeetCommonAncestor || needToMeetShadowedTextAncestor) {
                if (
                    needToMeetShadowedTextAncestor &&
                    node.parentNode.matches("[data-text-effect]")
                ) {
                    needToMeetShadowedTextAncestor = false;
                }
                const updatingCommonAncestor = commonAncestor === node.parentNode;
                const splitIndex = childNodeIndex(node);
                if (forward ? splitIndex > 0 : splitIndex < node.parentNode.childNodes.length - 1) {
                    // Split the node if needed, abort if unsplittable (unless it is a text with effect)
                    if (
                        this.dependencies.split.isUnsplittable(node.parentNode) &&
                        !node.parentNode.matches("[data-text-effect]")
                    ) {
                        return;
                    }
                    node = this.dependencies.split.splitElement(
                        node.parentNode,
                        splitIndex + (forward ? 0 : 1)
                    )[forward ? 1 : 0];
                } else {
                    node = node.parentNode;
                }
                if (updatingCommonAncestor) {
                    updatedCommonAncestor = node.parentNode;
                }
                if (needToMeetCommonAncestor && node.parentNode === commonAncestor) {
                    needToMeetCommonAncestor = false;
                }
            }
            commonAncestor = updatedCommonAncestor || commonAncestor;
        }
        return commonAncestor;
    }
    /**
     * Create a span with the default text effect, on the selection
     *
     * @returns {{element: HTMLElement, didRemoveOtherTextEffect: boolean}|{}}
     */
    createDefaultTextEffect() {
        /*
        We need to create 1 element with the content of the selection to set the
        text effect. This element must be the only text effect element for
        the selected text

        To be able to create 1 new element containing the selection, we need to
        split the elements that are descendants of the common ancestor and that
        contains one end of the selection.

        To remove any other overlapping effect on text, we need to:
        - remove the effect on the part of a splitted element that falls
          inside the selection
        - split ancestor text with effect that fully contains the selection, to
          remove the effect on the part containing the selection
        - remove text effect inside of the created element

        If these splits would split an unsplittable node, we abort
        */
        const selection = this.dependencies.split.splitSelection();
        const commonAncestor = this.splitForTextEffect(selection);
        if (!commonAncestor) {
            return {};
        }
        const { startContainer, endContainer, direction } = selection;

        const range = new Range();
        range.setStartBefore(
            findFurthest(startContainer, commonAncestor, () => true) || startContainer
        );
        range.setEndAfter(findFurthest(endContainer, commonAncestor, () => true) || endContainer);
        const span = this.document.createElement("span");
        range.surroundContents(span);
        // Remove text effect inside the span and containing the span (the ancestors have been split so it only contains the span)
        let didRemoveOtherTextEffect = false;
        for (const node of [
            ...span.querySelectorAll("[data-text-effect]"),
            ...ancestors(span, this.editable).filter((n) => n.matches("[data-text-effect]")),
        ]) {
            node.replaceWith(...node.childNodes);
            didRemoveOtherTextEffect = true;
        }
        const recycleFromElement =
            closestElement(span.previousSibling || span, "[data-text-effect]") ||
            closestElement(span.nextSibling || span, "[data-text-effect]");
        if (recycleFromElement) {
            // Start from neighbour's effects.
            span.dataset.textEffect = recycleFromElement.dataset.textEffect;
        } else {
            // Start from defaults.
            span.dataset.textEffect = JSON.stringify({
                outline: "2px",
                outlineColor: "#808080",
            });
        }
        TextEffectUtil.applyConfiguredEffects(span);
        this.dependencies.selection.setSelection(
            direction === DIRECTIONS.RIGHT
                ? {
                      anchorNode: span,
                      anchorOffset: 0,
                      focusNode: span,
                      focusOffset: nodeSize(span),
                  }
                : {
                      anchorNode: span,
                      anchorOffset: nodeSize(span),
                      focusNode: span,
                      focusOffset: 0,
                  }
        );
        this.dependencies.history.addStep();

        return { element: span, didRemoveOtherTextEffect };
    }
    /**
     *
     * @returns {{element: HTMLElement, onReset: Function}|{}}
     */
    getTextEffectOrCreateDefault() {
        const resetTextEffect = (el) => {
            const cursors = this.dependencies.selection.preserveSelection();
            el.replaceWith(...el.childNodes);
            cursors.restore();
            this.dependencies.history.addStep();
        };

        const existingTextEffectEl = this.getTextEffect();
        if (existingTextEffectEl) {
            return { element: existingTextEffectEl, onReset: resetTextEffect };
        }
        const savePoint = this.dependencies.history.makeSavePoint();
        const { element: createdTextEffectEl, didRemoveOtherTextEffect } =
            this.createDefaultTextEffect();
        if (createdTextEffectEl) {
            return {
                element: createdTextEffectEl,
                onReset: didRemoveOtherTextEffect ? resetTextEffect : savePoint,
            };
        }
        savePoint();
        this.services.notification.add(
            _t(
                "Cannot apply this option on current text selection. Try clearing the format and try again."
            ),
            { type: "danger", sticky: true }
        );
        return {};
    }
    isTextEffectActive() {
        return !!this.getTextEffect();
    }
    isTextEffectDisabled() {
        return 2 <= this.dependencies.selection.getTargetedNodes().size;
    }
    removeEmptyTextEffects(root) {
        for (const el of selectElements(root, "[data-text-effect='{}']")) {
            delete el.dataset.textEffect;
        }
    }
}

export class UpdateTextEffectAction extends BuilderAction {
    static id = "updateTextEffect";

    getValue({ editingElement, params: { mainParam: variable } }) {
        const jsonText = editingElement.dataset.textEffect;
        if (jsonText) {
            const json = JSON.parse(jsonText);
            let value = json[variable] || TextEffectUtil.defaults[variable];
            if (variable.toLowerCase().endsWith("color")) {
                value = TextEffectUtil.getActualColor(value, this.document);
            }
            if (variable === "toggleShadow") {
                return Object.keys(json).some((key) => key.startsWith("shadow")) ? "toggle" : false;
            }
            return value;
        }
    }
    isApplied({ editingElement, params: { mainParam: variable }, value }) {
        return this.getValue({ editingElement, params: { mainParam: variable } }) === value;
    }
    apply({ editingElement, params: { mainParam: variable }, value }) {
        if (variable === "loadPreset") {
            editingElement.dataset.textEffect = value;
            TextEffectUtil.applyConfiguredEffects(editingElement);
            return;
        }
        console.log(316, variable, value);
        const jsonText = editingElement.dataset.textEffect;
        let json = {};
        if (jsonText) {
            json = JSON.parse(jsonText);
        }
        if (value && value !== TextEffectUtil.defaults[variable]) {
            if (variable === "toggleShadow") {
                if (this.getValue({ editingElement, params: { mainParam: "toggleShadow" } })) {
                    delete json.shadowColor;
                    delete json.shadowBlur;
                    delete json.shadowOffsetX;
                    delete json.shadowOffsetY;
                } else {
                    json.shadowBlur = "2px";
                }
            } else {
                json[variable] = value;
            }
        } else {
            delete json[variable];
        }
        editingElement.dataset.textEffect = JSON.stringify(json);
        TextEffectUtil.applyConfiguredEffects(editingElement);
    }
}
