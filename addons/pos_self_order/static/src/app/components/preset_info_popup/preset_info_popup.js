import { Component, onWillStart, useState, EventBus } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { isValidPhone, isValidEmail } from "@point_of_sale/utils";
import { AddressAutoComplete } from "@google_address_autocomplete/address_autocomplete/google_address_autocomplete";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { PillsSelectionPopup } from "@pos_self_order/app/components/pills_selection_popup/pills_selection_popup";
import { _t } from "@web/core/l10n/translation";

class SelfOrderAddressAutoComplete extends AddressAutoComplete {
    async selectAddressProposition(option) {
        await super.selectAddressProposition(option);
        await this.props.record.update({ [this.props.name]: option.formatted_address });
    }
}

const { DateTime } = luxon;
export class PresetInfoPopup extends Component {
    static template = "pos_self_order.PresetInfoPopup";
    static components = { Dialog, AddressAutoComplete: SelfOrderAddressAutoComplete };
    static props = {
        close: Function,
        getPayload: Function,
    };

    setup() {
        this.selfOrder = useService("self_order");
        this.dialog = useService("dialog");
        this.state = useState({
            selectedPartnerId: null,
            name: "",
            email: "",
            phoneCountryId: this.selfOrder.config.company_id.country_id.id,
            phoneLocal: "",
            street: "",
            city: "",
            zip: "",
            countryId: this.selfOrder.config.company_id.country_id.id,
            stateId: this.selfOrder.config.company_id.country_id.state_ids[0]?.id || null,
            validationError: null,
            isSubmitting: false,
        });
        this.addressRecord = this.makeAddressRecord();

        onWillStart(async () => {
            await this.selfOrder.syncPresetSlotAvaibility(this.preset);
        });
    }

    handleValidationErrors(result) {
        if (result?.error) {
            this.state.validationError = result.error;
            return true;
        }
        return false;
    }

    setPartnerAndOrderName(partner) {
        if (this.preset.needsPartner) {
            this.selfOrder.currentOrder.floating_order_name = `${this.preset.name} - ${partner["res.partner"][0].name}`;
        } else {
            this.selfOrder.currentOrder.floating_order_name = partner["res.partner"][0].name;
        }
        this.selfOrder.currentOrder.partner_id = partner["res.partner"][0];
    }

    async setInformations() {
        if (this.state.isSubmitting || !this.checkPhoneFormat()) {
            return;
        }
        this.state.isSubmitting = true;
        this.state.validationError = null;
        try {
            if (this.preset.needsPartner || this.state.phoneLocal) {
                const result = await rpc(`/pos-self-order/validate-partner`, {
                    access_token: this.selfOrder.access_token,
                    partner_id: this.state.selectedPartnerId,
                    preset_id: this.preset?.id,
                    name: this.state.name,
                    email: this.state.email,
                    phone: this.fullPhone,
                    street: this.state.street,
                    city: this.state.city,
                    country_id: this.state.countryId,
                    state_id: this.state.stateId,
                    zip: this.state.zip,
                });
                if (this.handleValidationErrors(result)) {
                    return;
                }
                const partner = this.selfOrder.models.connectNewData(result);
                this.setPartnerAndOrderName(partner);
            } else {
                this.selfOrder.currentOrder.floating_order_name = this.state.name;
            }

            if (this.preset.needsSlot && this.state.selectedSlot) {
                this.selfOrder.currentOrder.preset_time = DateTime.fromSQL(this.state.selectedSlot)
                    .toUTC()
                    .toFormat("yyyy-MM-dd HH:mm:ss");
            }
            this.props.getPayload(this.state);
            this.props.close();
        } finally {
            this.state.isSubmitting = false;
        }
    }

    makeAddressRecord() {
        const bus = new EventBus();
        const invalidFields = new Set();
        return {
            data: this.state,
            fields: {
                street: { type: "char", trim: false, size: false, translate: false },
                city: { type: "char", trim: false, size: false, translate: false },
                zip: { type: "char", trim: false, size: false, translate: false },
                countryId: { type: "many2one" },
                stateId: { type: "many2one" },
            },
            activeFields: {
                street: true,
                city: true,
                zip: true,
                countryId: true,
                stateId: true,
            },
            model: { bus },
            isValid: true,
            resetFieldValidity: (name) => invalidFields.delete(name),
            setInvalidField: (name) => invalidFields.add(name),
            isFieldInvalid: (name) => invalidFields.has(name),
            update: async (values) => {
                for (const [key, value] of Object.entries(values)) {
                    if (key === "countryId") {
                        this.state.countryId = value?.id || value || null;
                    } else if (key === "stateId") {
                        this.state.stateId = value?.id || value || null;
                    } else {
                        this.state[key] = value || "";
                    }
                }
                this.state.validationError = null;
            },
        };
    }

    get availablePresets() {
        const currentPresetId = this.selfOrder.currentOrder?.preset_id?.id;
        return this.selfOrder.models["pos.preset"].getAll().filter((p) => p.id !== currentPresetId);
    }

    async selectPreset(preset) {
        const currentPreset = this.selfOrder.currentOrder?.preset_id;
        // Remove delivery lines when switching away from delivery
        if (currentPreset?.service_at === "delivery") {
            const deliveryTmplId = currentPreset.delivery_product_id?.id;
            if (deliveryTmplId) {
                const toDelete = this.selfOrder.currentOrder.lines.filter(
                    (l) => l.product_id?.product_tmpl_id?.id === deliveryTmplId
                );
                for (const line of toDelete) {
                    line.delete();
                }
            }
        }
        this.selfOrder.currentOrder.setPreset(preset);
        this.state.selectedSlot = null;
        this.state.validationError = null;
        await this.selfOrder.syncPresetSlotAvaibility(preset);
        if (preset.needsSlot) {
            const timingOptions = this._getTimingOptions(preset);
            const result = await makeAwaitable(this.dialog, PillsSelectionPopup, {
                options: timingOptions,
                title: _t("Select a hour"),
                subtitle: _t("Please choose a time slot for your order."),
                selectionType: "time",
            });
            if (result) {
                this.selfOrder.currentOrder.preset_time = DateTime.fromSQL(result);
                this.state.selectedSlot = result;
            }
        }
    }

    _getTimingOptions(preset) {
        const availabilities = preset.availabilities;
        const options = { categories: {} };
        for (const [date, slots] of Object.entries(availabilities)) {
            options.categories[date] = {
                id: date,
                name: DateTime.fromISO(date).toLocaleString(DateTime.DATE_SHORT),
                subCategories: {},
            };
            for (const slot of Object.values(slots)) {
                if (!options.categories[date].subCategories[slot.periode]) {
                    let periodeName = _t("Full Day");
                    switch (slot.periode) {
                        case "morning":
                            periodeName = _t("Morning");
                            break;
                        case "afternoon":
                            periodeName = _t("Afternoon");
                            break;
                        case "evening":
                            periodeName = _t("Evening");
                            break;
                    }
                    options.categories[date].subCategories[slot.periode] = {
                        id: slot.periode,
                        name: periodeName,
                        options: [],
                    };
                }
                options.categories[date].subCategories[slot.periode].options.push({
                    id: slot.datetime.toFormat("yyyy-MM-dd HH:mm:ss"),
                    name: this.selfOrder.getTime(slot.datetime),
                });
            }
        }
        for (const dateId of Object.keys(options.categories)) {
            if (
                Object.keys(options.categories[dateId].subCategories).length === 0 ||
                Object.values(options.categories[dateId].subCategories).every(
                    (subCateg) => subCateg.options.length === 0
                )
            ) {
                delete options.categories[dateId];
            }
        }
        return options;
    }

    get addressAutoCompleteProps() {
        return {
            record: this.addressRecord,
            name: "street",
            placeholder: "Address",
            readonly: Boolean(this.partnerIsSelected),
            addressFieldMap: {
                street: "street",
                city: "city",
                zip: "zip",
                country_id: "countryId",
                state_id: "stateId",
            },
        };
    }

    selectExistingPartner(event) {
        const partner = this.selfOrder.models["res.partner"].get(event.target.value);
        this.state.name = partner?.name || "";
        this.state.email = partner?.email || "";
        this.state.street = partner?.street || "";
        this.state.city = partner?.city || "";
        this.state.zip = partner?.zip || "";
        this.state.countryId = partner?.country_id?.id || null;
        this.state.stateId = partner?.state_id?.id || null;
        this.state.validationError = null;
        // Parse phone into prefix + local digits
        const phone = partner?.phone || "";
        if (phone.startsWith("+")) {
            const sorted = [...this.allCountries].sort(
                (a, b) => String(b.phone_code).length - String(a.phone_code).length
            );
            const matched = sorted.find((c) => phone.startsWith("+" + c.phone_code));
            if (matched) {
                this.state.phoneCountryId = matched.id;
                this.state.phoneLocal = phone.slice(("+" + matched.phone_code).length).trim();
            } else {
                this.state.phoneLocal = phone;
            }
        } else {
            this.state.phoneLocal = phone;
        }
    }

    get existingPartners() {
        return this.selfOrder.models["res.partner"].getAll();
    }

    get partnerIsSelected() {
        return this.state.selectedPartnerId && this.state.selectedPartnerId !== "0";
    }

    close() {
        this.props.close();
    }

    get preset() {
        return this.selfOrder.currentOrder.preset_id;
    }

    get slots() {
        return Object.entries(this.preset.uiState.availabilities).filter(
            (s) => Object.keys(s[1]).length > 0
        );
    }

    flagEmoji(code) {
        return [...code.toUpperCase()]
            .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
            .join("");
    }

    get allCountries() {
        return this.selfOrder.models["res.country"]
            .getAll()
            .filter((c) => c.phone_code)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    get selectedCountry() {
        return this.selfOrder.models["res.country"].get(this.state.phoneCountryId);
    }

    get phonePrefix() {
        const country = this.selectedCountry;
        return country?.phone_code ? `+${country.phone_code}` : "";
    }

    get fullPhone() {
        const local = this.state.phoneLocal.trim();
        return local ? this.phonePrefix + local : "";
    }

    get validSelection() {
        const partnerInfo = this.state.name && this.fullPhone && this.state.street;
        return (
            (!this.preset.needsName || this.state.name) &&
            (!this.preset.needsEmail || isValidEmail(this.state.email)) &&
            (!this.preset.needsPartner || partnerInfo) &&
            !this.state.validationError &&
            this.checkPhoneFormat()
        );
    }

    formatDate(date) {
        const dateObj = DateTime.fromFormat(date, "yyyy-MM-dd");
        return this.preset.formatDate(dateObj);
    }

    checkPhoneFormat() {
        return !this.state.phoneLocal || isValidPhone(this.fullPhone);
    }
}
