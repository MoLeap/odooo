import { registerComposerAction } from "@mail/core/common/composer_actions";
import { Component, xml } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

registerComposerAction("voice-start", {
    condition: ({ composer, owner }) =>
        composer.targetThread?.channel &&
        owner.voiceRecorder &&
        !owner.voiceRecorder?.recording &&
        !composer.voiceAttachment,
    icon: "fa fa-microphone",
    name: _t("Voice Message (Alt+V)"),
    onSelected: ({ owner }) => owner.voiceRecorder.onClick(),
    sequence: 10,
});
registerComposerAction("voice-stop", {
    condition: ({ composer, owner }) =>
        composer.targetThread?.channel && owner.voiceRecorder?.recording,
    icon: "fa fa-circle text-danger o-mail-VoiceRecorder-dot",
    name: _t("Stop Recording (Alt+V)"),
    onSelected: ({ owner }) => owner.voiceRecorder.onClick(),
    sequence: 10,
});
registerComposerAction("voice-recording", {
    component: class VoiceMessageRecordingButton extends Component {
        static props = ["composer", "state"];
        static template = xml`
            <div class="o-mail-VoiceRecorder d-flex align-items-center o-recording rounded-pill user-select-none me-1 p-1">
                <button class="o-mail-VoiceRecorder-button btn btn-link text-reset text-muted p-0 d-flex align-items-center justify-content-center" title="Cancel Recording (Esc)" aria-label="Cancel Recording" t-att-disabled="props.state.isActionPending" t-on-click="() => props.state.cancel()">
                    <i class="fa fa-fw fa-times"/>
                </button>
                <div class="o-mail-VoiceRecorder-elapsed o-active recording d-flex align-items-center mx-1" t-att-class="{ 'text-danger': props.state.limitWarning }" style="font-variant-numeric: tabular-nums;">
                    <span class="d-flex text-truncate" t-out="props.state.elapsed"/>
                </div>
                <button class="o-mail-VoiceRecorder-button btn btn-link text-reset p-0 d-flex align-items-center justify-content-center" t-att-title="title" t-att-disabled="props.state.isActionPending or props.composer.voiceAttachment" t-on-click="props.state.onClick">
                    <i class="fa fa-fw fa-lg fa-circle text-danger o-mail-VoiceRecorder-dot"/>
                </button>
            </div>
        `;
        get title() {
            return _t("Stop Recording (Alt+V) or Send (Enter)");
        }
    },
    componentProps: ({ composer, owner }) => ({ composer, state: owner.voiceRecorder }),
    condition: ({ composer, owner }) =>
        composer.targetThread?.channel && owner.voiceRecorder?.recording,
    sequenceQuick: 10,
});
