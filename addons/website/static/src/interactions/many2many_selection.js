import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class Many2ManySelection extends Interaction {
    static selector = ".s_website_form_m2m_selection";

    dynamicContent = {
        ".dropdown-item": { "t-on-click": this.onOptionClick },
        ".s_website_form_m2m_pill_remove": { "t-on-click": this.onPillRemove },
    };

    setup() {
        this.selectEl = this.el.querySelector("select.s_website_form_input");
        this.pillsContainer = this.el.querySelector(".s_website_form_m2m_pills_container");
        this.initialPillsHTML = this.pillsContainer.innerHTML;
        this.initialSelectedStates = [...this.selectEl.options].map((opt) =>
            opt.hasAttribute("selected")
        );
        this.pillsContainer.dataset.bsToggle = "dropdown";
        this.pillsContainer.dataset.bsAutoClose = "outside";
        this.bsDropdown = Dropdown.getOrCreateInstance(this.pillsContainer);
        this.resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => this.bsDropdown?.update());
        });
        this.resizeObserver.observe(this.pillsContainer);
        this.registerCleanup(() => {
            this.resizeObserver.disconnect();
            this.bsDropdown.hide();
            this.bsDropdown.dispose();
            delete this.pillsContainer.dataset.bsToggle;
            delete this.pillsContainer.dataset.bsAutoClose;
            this.pillsContainer.innerHTML = this.initialPillsHTML;
            [...this.selectEl.options].forEach((opt, i) => {
                opt.selected = this.initialSelectedStates[i];
            });
        });
    }

    /**
     * @param {string} value Option value (record id).
     * @param {boolean} selected Whether the option should be selected.
     * @param {HTMLInputElement} [checkboxEl] Checkbox inside the dropdown.
     */
    toggleValue(value, selected, checkboxEl) {
        const optionEl = [...this.selectEl.options].find((opt) => opt.value === value);
        optionEl.selected = selected;
        checkboxEl.checked = selected;
        if (selected) {
            this.addPill(optionEl);
        } else {
            this.removePill(value);
        }
        this.updatePlaceholder();
        this.selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Updates the visibility of the placeholder element based on the presence
     * of pills.
     */
    updatePlaceholder() {
        const placeholderEl = this.pillsContainer.querySelector(".s_website_form_m2m_placeholder");
        const hasPills = !!this.pillsContainer.querySelector(".s_website_form_m2m_pill");
        placeholderEl.classList.toggle("d-none", hasPills);
    }

    /**
     * Toggles the selection of the option associated with the clicked dropdown
     * item.
     *
     * @param {Event} ev
     */
    onOptionClick(ev) {
        ev.preventDefault();
        const dropdownItemEl = ev.currentTarget;
        const checkboxEl = dropdownItemEl.querySelector("input[type=checkbox]");
        this.toggleValue(dropdownItemEl.dataset.value, !checkboxEl.checked, checkboxEl);
    }

    /**
     * Removes a pill to deselect the associated option.
     *
     * @param {Event} ev
     */
    onPillRemove(ev) {
        ev.stopPropagation();
        const pillEl = ev.currentTarget.closest(".s_website_form_m2m_pill");
        const value = pillEl.dataset.value;
        const checkboxEl = this.el.querySelector(
            `.dropdown-item[data-value="${value}"] input[type=checkbox]`
        );
        this.toggleValue(value, false, checkboxEl);
    }

    /**
     * Creates and inserts a pill element for the given option.
     *
     * @param {HTMLOptionElement} optionEl Option element to create a pill for.
     */
    addPill(optionEl) {
        const pillEl = document.createElement("span");
        pillEl.className = "s_website_form_m2m_pill badge rounded-pill text-bg-primary";
        pillEl.dataset.value = optionEl.value;
        const textEl = document.createElement("span");
        textEl.textContent = optionEl.text;
        pillEl.appendChild(textEl);
        const removeBtnEl = document.createElement("i");
        removeBtnEl.className = "s_website_form_m2m_pill_remove fa fa-times ms-1 cursor-pointer";
        pillEl.appendChild(removeBtnEl);
        this.pillsContainer.appendChild(pillEl);
    }

    /**
     * Removes the pill element matching the given value from the pills
     * container.
     *
     * @param {string} value Value of the pill to remove.
     */
    removePill(value) {
        this.pillsContainer
            .querySelector(`.s_website_form_m2m_pill[data-value="${value}"]`)
            .remove();
    }
}

registry.category("public.interactions").add("website.many2many_selection", Many2ManySelection);
