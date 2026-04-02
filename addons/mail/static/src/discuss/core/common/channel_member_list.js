import { ActionPanel } from "@mail/discuss/core/common/action_panel";
import { ChannelMember } from "@mail/discuss/core/common/channel_member";
import { ChannelActionDialog } from "@mail/discuss/core/common/channel_action_dialog";
import { ChannelInvitation } from "@mail/discuss/core/common/channel_invitation";

import { Component, onWillUpdateProps, onWillStart } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useState } from "@web/owl2/utils";

import { useService } from "@web/core/utils/hooks";
import { useSequential } from "@mail/utils/common/hooks";

export class ChannelMemberList extends Component {
    static components = { ActionPanel, ChannelActionDialog, ChannelMember };
    static props = ["channel", "close?", "openChannelInvitePanel", "className?"];
    static template = "discuss.ChannelMemberList";

    setup() {
        super.setup();
        this.store = useService("mail.store");
        this.dialogService = useService("dialog");
        this.state = useState({ searchTerm: "" });
        this.sequential = useSequential();
        onWillStart(() => {
            if (this.props.channel.fetchMembersState === "not_fetched") {
                this.props.channel.fetchChannelMembers();
            }
        });
        onWillUpdateProps((nextProps) => {
            if (nextProps.channel.fetchMembersState === "not_fetched") {
                nextProps.channel.fetchChannelMembers();
            }
            if (nextProps.channel !== this.props.channel && this.state.searchTerm) {
                this.state.searchTerm = "";
            }
        });
    }

    get filteredOnlineMembers() {
        if (!this.state.searchTerm) {
            return this.props.channel.onlineMembers;
        }
        const term = this.state.searchTerm.toLowerCase();
        return this.props.channel.onlineMembers.filter((m) => m.name?.toLowerCase().includes(term));
    }

    get filteredOfflineMembers() {
        if (!this.state.searchTerm) {
            return this.props.channel.offlineMembers;
        }
        const term = this.state.searchTerm.toLowerCase();
        return this.props.channel.offlineMembers.filter((m) =>
            m.name?.toLowerCase().includes(term)
        );
    }

    get onlineSectionText() {
        return _t("Online - %(online_count)s", {
            online_count: this.filteredOnlineMembers.length,
        });
    }

    get offlineSectionText() {
        return _t("Offline - %(offline_count)s", {
            offline_count: this.filteredOfflineMembers.length,
        });
    }

    get isSearchResultCapped() {
        if (!this.state.searchTerm) {
            return false;
        }
        return this.filteredOnlineMembers.length + this.filteredOfflineMembers.length >= 100;
    }

    get searchResultCapHint() {
        return _t("Showing first 100 members. Narrow your search to see more.");
    }

    onSearchInput(ev) {
        this.state.searchTerm = ev.target.value;
        this.sequential(() => this.props.channel.searchChannelMembers(this.state.searchTerm));
    }

    onClickInviteButton() {
        if (this.env.inMeetingView) {
            this.props.openChannelInvitePanel?.({ keepPrevious: true });
        } else {
            this.dialogService.add(ChannelActionDialog, {
                contentClass: "o-discuss-ChannelInvitation",
                contentComponent: ChannelInvitation,
                contentProps: {
                    channel: this.props.channel,
                    close: () => this.store.env.services.dialog.closeAll(),
                },
                title: this.props.channel.displayName,
            });
        }
    }
}
