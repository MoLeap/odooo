import { Component, useState, onMounted, useRef, onWillUnmount } from "@odoo/owl";
import { BuilderComponent } from "./builder_component";
import { BuilderRow } from "./builder_row";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";

import { basicContainerBuilderComponentProps, useBuilderComponent } from "../utils";

export class BuilderSlidingPanel extends Component {
    static template = "html_builder.BuilderSlidingPanel";
    static components = { BuilderComponent, BuilderRow };
    static props = {
        ...basicContainerBuilderComponentProps,
        label: { type: String, optional: false },
        class: { type: String, optional: true },
        icon: { type: String, optional: true },
        textContent: { type: String, optional: true },
        fullHeight: { type: Boolean, optional: true },
        darkBackground: { type: Boolean, optional: true },
        openByDefault: { type: Boolean, optional: true },
        slots: { type: Object, optional: true },
    };
    static defaultProps = {
        class: "btn-secondary",
        icon: "fa-paint-brush",
        textContent: "",
        fullHeight: false,
        darkBackground: false,
        openByDefault: false,
    };

    setup() {
        useBuilderComponent();
        this.slidingPanelRef = useRef("slidingPanel");
        this.openButtonRef = useRef("openButton");
        // contentRendered is set to true when panel is first opened and stays true
        // (intentional cache behavior - content is rendered once and kept alive).
        this.state = useState({
            optionContainerName: "",
            contentRendered: !!this.props.openByDefault,
        });
        onMounted(() => {
            this.optionsContainerEls = document.querySelectorAll("div.options-container");

            const slidingPanelEl = this.slidingPanelRef.el;
            const optionsContainerEl = slidingPanelEl.closest("div.options-container");
            this.state.optionContainerName = optionsContainerEl.dataset.containerTitle;
            optionsContainerEl.parentElement.append(slidingPanelEl);

            if (this.props.openByDefault) {
                this.showSlidingPanel();
            }
        });
        useHotkey("escape", this.hideSlidingPanel.bind(this), {
            isAvailable: () => !this.slidingPanelRef.el.classList.contains("d-none"),
        });
        onWillUnmount(() => {
            clearTimeout(this.updateDisplayTimeout);
            this.slidingPanelRef.el.remove();
        });
    }

    updateDisplay(className) {
        const slidingPanelEl = this.slidingPanelRef.el;
        if (!slidingPanelEl) {
            return;
        }
        slidingPanelEl.classList.remove(
            "d-none",
            "d-block",
            "hb-panel-slide-in",
            "hb-panel-slide-out"
        );
        slidingPanelEl.classList.add(className);
    }

    showSlidingPanel() {
        this.state.contentRendered = true;
        // Defer animation to next microtask to ensure OWL has rendered the content.
        // This prevents the panel from sliding in empty before the slot content is mounted.
        //
        // Clear any in-flight hide timeout first: if the user clicks open before a
        // previous hide animation completes, we must not let the stale d-none timeout fire.
        clearTimeout(this.updateDisplayTimeout);
        Promise.resolve().then(() => {
            this.updateDisplay("hb-panel-slide-in");
            this.updateDisplayTimeout = setTimeout(() => this.updateDisplay("d-block"), 200);
        });
    }

    hideSlidingPanel() {
        // Clear any in-flight show timeout: if the user clicks close before the d-block
        // timeout fires (200ms), we must not let the panel snap to d-block mid-close.
        clearTimeout(this.updateDisplayTimeout);
        this.updateDisplay("hb-panel-slide-out");
        // We set a timeout slightly shorter than 200 because some flicker may
        // happen otherwise.
        this.updateDisplayTimeout = setTimeout(() => {
            this.updateDisplay("d-none");
            this.openButtonRef.el.focus();
        }, 180);
    }

    onBackdropClick(ev) {
        if (!this.props.fullHeight && ev.target === ev.currentTarget) {
            this.hideSlidingPanel();
        }
    }
}
