import { useChildSubEnv, useRef, useState } from "@web/owl2/utils";
import { Component, onMounted, onWillDestroy } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { POSITION_BUS } from "@web/core/position/position_hook";
import { useService } from "@web/core/utils/hooks";
import { toolbarButtonProps } from "@html_editor/main/toolbar/toolbar";
import { BaseOptionComponent } from "@html_builder/core/base_option_component";
import { DependencyManager } from "@html_builder/core/dependency_manager";
import { useDomState } from "@html_builder/core/utils";
import { InputConfirmationDialog } from "@html_builder/snippets/input_confirmation_dialog";
import { TextEffectUtil } from "./text_effect_util";

export class TextEffectOption extends BaseOptionComponent {
    static template = "html_builder.TextEffectOption";
    static dependencies = ["builderActions"];
    setup() {
        super.setup();
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.state = useDomState(async (editingElement) => ({
            isOptionActive: !editingElement.matches("img"),
            hasOutline: this.hasOutline(editingElement),
            hasTrail: this.hasTrail(editingElement),
            hasTilt: this.hasTilt(editingElement, "X") || this.hasTilt(editingElement, "Y"),
            effect: editingElement.dataset.textEffect,
        }));
    }
    getEffectParam(editingElement, paramName) {
        const { getAction } = this.dependencies.builderActions;
        return getAction("updateTextEffect").getValue({
            editingElement,
            params: {
                mainParam: paramName,
            },
        });
    }
    hasOutline(editingElement) {
        const styleActionValue = this.getEffectParam(editingElement, "outline");
        const values = (styleActionValue || "0").match(/\d+/g);
        return values.some((value) => parseInt(value) > 0);
    }
    hasTrail(editingElement) {
        const styleActionValue = this.getEffectParam(editingElement, "trailCount");
        const values = (styleActionValue || "0").match(/\d+/g);
        return values.some((value) => parseInt(value) > 0);
    }
    hasTilt(editingElement, axis) {
        const styleActionValue = this.getEffectParam(editingElement, `tilt${axis}`);
        const values = (styleActionValue || "0").match(/\d+/g);
        return values.some((value) => parseInt(value) > 0);
    }
    getPresets() {
        const savedPresets = JSON.parse(window.localStorage.getItem("textEffectPresets") || "[]");
        const presets = [
            ...savedPresets,
            {
                name: _t("Outline"),
                effect: {
                    outline: "2px",
                    outlineColor: "#808080",
                },
            },
            {
                name: _t("Sharp Shadow"),
                effect: { shadowBlur: "1px" },
            },
            {
                name: _t("Blurred Shadow"),
                effect: { shadowBlur: "10px" },
            },
            {
                name: _t("Glow"),
                effect: {
                    shadowBlur: "10px",
                    shadowColor: "#D0D0F0",
                    shadowOffsetX: "0px",
                    shadowOffsetY: "0px",
                },
            },
            {
                name: _t("Vertical"),
                effect: {
                    rotate: "-90deg",
                },
            },
            {
                name: _t("3.11 Art"),
                effect: {
                    trailCount: "10",
                    trailOffsetX: "30px",
                    trailOffsetY: "30px",
                    skewX: "-15deg",
                },
            },
            {
                name: _t("Ribbon"),
                effect: {
                    shadowBlur: "10px",
                    shadowColor: "#FFFFFF",
                    shadowOffsetX: "0px",
                    shadowOffsetY: "0px",
                    outline: "2px",
                    outlineColor: "#FF0000",
                    rotate: "-40deg",
                },
            },
            {
                name: _t("Episode Tilt"),
                effect: {
                    tiltX: "15deg",
                    tiltPerspective: "1.4",
                },
            },
            {
                name: _t("Speed"),
                effect: {
                    trailCount: "10",
                    trailOffsetX: "-30px",
                    trailOffsetY: "0px",
                    trailStartColor: "#ED452F",
                    trailEndColor: "#FFFEB2",
                    skewX: "-15deg",
                },
            },
        ];
        for (const preset of presets) {
            preset.effectJson = JSON.stringify(preset.effect);
            const el = document.createElement("span");
            el.dataset.textEffect = preset.effectJson;
            TextEffectUtil.applyConfiguredEffects(el);
            preset.effectStyle = el.getAttribute("style");
            if (preset.effectStyle.includes("-webkit")) {
                preset.sampleText = "A";
            } else {
                preset.sampleText = "\uD83E\uDD84";
            }
        }
        return presets;
    }
    onClickSavePreset() {
        this.dialog.add(InputConfirmationDialog, {
            title: _t("Save text effect preset"),
            inputLabel: _t("Name"),
            defaultValue: _t("My custom effect"),
            confirmLabel: _t("Save"),
            confirm: (inputValue) => {
                const json = JSON.parse(this.state.effect || "{}");
                const savedPresets = JSON.parse(
                    window.localStorage.getItem("textEffectPresets") || "[]"
                );
                savedPresets.unshift({
                    name: inputValue,
                    effect: json,
                });
                window.localStorage.setItem("textEffectPresets", JSON.stringify(savedPresets));
                this.notification.add(_t("Custom effect saved"), {
                    type: "info",
                });
            },
            cancel: () => {},
        });
    }
}

export class TextEffectPopover extends BaseOptionComponent {
    static template = "html_builder.TextEffectPopover";
    static props = {
        onReset: Function,

        // Popover service
        close: { type: Function, optional: true },
    };
    static components = { TextEffectOption };

    setup() {
        super.setup();
        this.contentRef = useRef("content");
        this.resizeObserver = new ResizeObserver(() => {
            this.env[POSITION_BUS]?.trigger("update");
        });
        onMounted(() => {
            this.resizeObserver.observe(this.contentRef.el);
        });
        onWillDestroy(() => {
            this.resizeObserver.disconnect();
        });
    }
}

export class TextEffectSelector extends Component {
    static template = "html_builder.TextEffectSelector";
    static props = {
        ...toolbarButtonProps,
        config: {
            type: Object,
            shape: { editor: Object, editorBus: Object },
        },
        getTextEffectOrCreateDefault: Function,
        isActive: Function,
        isDisabled: Function,
    };

    setup() {
        this.state = useState({});
        this.root = useRef("root");
        useChildSubEnv({
            dependencyManager: new DependencyManager(),
            getEditingElement: () => this.activeElement,
            getEditingElements: () => (this.activeElement ? [this.activeElement] : []),
            weContext: {},
            editor: this.props.config.editor,
            editorBus: this.props.config.editorBus,
            services: this.props.config.editor.services,
        });
        this.popover = usePopover(TextEffectPopover, {
            env: this.__owl__.childEnv,
            onClose: () => {
                if (!this.props.config.editor.isDestroyed) {
                    this.updateState();
                }
            },
        });
    }

    onClick() {
        if (this.popover.isOpen) {
            return;
        }
        const { element, onReset } = this.props.getTextEffectOrCreateDefault();
        if (!element) {
            return;
        }
        this.activeElement = element;

        this.updateState();
        this.popover.open(this.root.el, {
            onReset: () => {
                onReset(this.activeElement);
                this.popover.close();
            },
        });
    }

    updateState() {
        this.state.isActive = this.props.isActive();
        this.state.isDisabled = this.props.isDisabled();
    }
}
