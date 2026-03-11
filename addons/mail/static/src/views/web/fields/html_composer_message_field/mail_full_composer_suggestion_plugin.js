import { isContentEditable, isTextNode } from "@html_editor/utils/dom_info";
import { Plugin } from "@html_editor/plugin";
import { rightPos } from "@html_editor/utils/position";
import { NavigableList } from "@mail/core/common/navigable_list";
import {
    generatePartnerMentionElement,
    generateRoleMentionElement,
    generateSpecialMentionElement,
    generateChannelMentionElement,
} from "@mail/utils/common/format";
import { ConnectionAbortedError } from "@web/core/network/rpc";
import { createTextNode } from "@web/core/utils/xml";
import { reactive } from "@web/owl2/utils";
import { user } from "@web/core/user";

export class MailFullComposerSuggestionPlugin extends Plugin {
    static id = "mail_full_composer_suggestion";
    static dependencies = ["overlay", "dom", "history", "input", "selection"];

    resources = {
        on_deleted_handlers: this.detect.bind(this),
        on_input_handlers: this.detect.bind(this),
        on_redone_handlers: this.detect.bind(this),
        on_undone_handlers: this.detect.bind(this),
    };

    setup() {
        this.suggestionList = this.dependencies.overlay.createOverlay(
            NavigableList,
            {
                hasAutofocus: false,
                className: "shadow",
            },
        );
        this.search = reactive(
            {
                delimiter: undefined,
                position: undefined,
                term: "",
            },
            () => {
                this.update();
                if (
                    this.search.position === undefined ||
                    !this.search.delimiter
                ) {
                    return; // nothing else to fetch
                }
                if (!user.isInternalUser) {
                    return; // guests cannot access fetch suggestion method
                }
                const isSearchMoreSpecificThanLastFetch =
                    this.lastFetchedSearch?.delimiter ===
                        this.search.delimiter &&
                    this.search.term.startsWith(this.lastFetchedSearch.term) &&
                    this.lastFetchedSearch.position >= this.search.position;
                if (
                    this.lastFetchedSearch?.count === 0 &&
                    (!this.search.delimiter ||
                        isSearchMoreSpecificThanLastFetch)
                ) {
                    return; // no need to fetch since this is more specific than last and last had no result
                }
                this.fetchSuggestions();
            },
        );
        this.suggestionListProps = reactive({
            anchorRef: undefined,
            position: "bottom-fit",
            onSelect: (ev, option) => {
                this.insert(option);
            },
            isLoading: false,
            options: [],
            optionTemplate: undefined,
        });
        this.state = reactive(
            {
                count: 0,
                items: undefined,
                isFetching: false,
            },
            () => {
                if (this.state.items) {
                    this.updateSuggestionListProps();
                    this.suggestionList.open({
                        props: this.suggestionListProps,
                    });
                } else {
                    this.suggestionList.close();
                }
            },
        );
        this.lastFetchedSearch = null;
    }

    get isSearchMoreSpecificThanLastFetch() {
        return (
            this.lastFetchedSearch.delimiter === this.search.delimiter &&
            this.search.term.startsWith(this.lastFetchedSearch.term) &&
            this.lastFetchedSearch.position >= this.search.position
        );
    }

    detect(ev) {
        let start = 0;
        let text = "";
        const selection = this.dependencies.selection.getEditableSelection();
        if (
            !isTextNode(selection.startContainer) ||
            !isContentEditable(selection.startContainer) ||
            !selection.isCollapsed
        ) {
            this.clearSearch();
            return;
        }
        start = selection.startOffset;
        text = selection.anchorNode.textContent;
        const candidatePositions = [];
        // consider the chars before the current cursor position
        let numberOfSpaces = 0;
        for (let index = start - 1; index >= 0; --index) {
            if (/\s/.test(text[index])) {
                numberOfSpaces++;
                if (numberOfSpaces === 2) {
                    // The consideration stops after the second space since
                    // a majority of partners have a two-word name. This
                    // removes the need to check for mentions following a
                    // delimiter used earlier in the content.
                    break;
                }
            }
            candidatePositions.push(index);
        }
        // keep the current delimiter if it is still valid
        if (
            this.search.position !== undefined &&
            this.search.position < start
        ) {
            candidatePositions.push(this.search.position);
        }
        const supportedDelimiters = this.services[
            "mail.suggestion"
        ].getSupportedDelimiters(this.config.thread);
        for (const candidatePosition of candidatePositions) {
            if (candidatePosition < 0 || candidatePosition >= text.length) {
                continue;
            }

            const findAppropriateDelimiter = () => {
                let goodCandidate;
                for (const [
                    delimiter,
                    allowedPosition,
                    minCharCountAfter,
                ] of supportedDelimiters) {
                    if (
                        text
                            .substring(candidatePosition)
                            .startsWith(delimiter) && // delimiter is used
                        (allowedPosition === undefined ||
                            allowedPosition === candidatePosition) && // delimiter is allowed position
                        (minCharCountAfter === undefined ||
                            start - candidatePosition - delimiter.length + 1 >
                                minCharCountAfter) && // delimiter is allowed (enough custom char typed after)
                        (!goodCandidate || delimiter.length > goodCandidate) // delimiter is more specific
                    ) {
                        goodCandidate = delimiter;
                    }
                }
                return goodCandidate;
            };

            const candidateDelimiter = findAppropriateDelimiter();
            if (!candidateDelimiter) {
                continue;
            }
            const charBeforeCandidate = text[candidatePosition - 1];
            if (charBeforeCandidate && !/\s/.test(charBeforeCandidate)) {
                continue;
            }
            Object.assign(this.search, {
                delimiter: candidateDelimiter,
                position: candidatePosition,
                term: text.substring(
                    candidatePosition + candidateDelimiter.length,
                    start,
                ),
            });
            this.state.count++;
            return;
        }
        this.clearSearch();
    }

    update() {
        if (!this.search.delimiter) {
            return;
        }
        const { type, suggestions } = this.services[
            "mail.suggestion"
        ].searchSuggestions(this.search, {
            thread: this.config.thread,
        });
        if (!suggestions.length) {
            this.state.items = undefined;
            return;
        }
        // arbitrary limit to avoid displaying too many elements at once
        // ideally a load more mechanism should be introduced
        const limit = 8;
        suggestions.length = Math.min(suggestions.length, limit);
        this.state.items = { type, suggestions };
    }

    insert(option) {
        let position = this.search.position + 1;
        if (
            [":", "::"].includes(this.search.delimiter) ||
            this.search.delimiter !== "/"
        ) {
            position = this.search.position;
        }
        const { startContainer, endContainer, endOffset } =
            this.dependencies.selection.getEditableSelection();
        this.dependencies.selection.setSelection({
            anchorNode: startContainer,
            anchorOffset: position,
            focusNode: endContainer,
            focusOffset: endOffset,
        });
        let inlineElement;
        if (option.partner) {
            inlineElement = generatePartnerMentionElement(
                option.partner,
                this.config.thread,
            );
        } else if (option.isSpecial) {
            inlineElement = generateSpecialMentionElement(option.label);
        } else if (option.role) {
            inlineElement = generateRoleMentionElement(option.role);
        } else if (option.channel) {
            inlineElement = generateChannelMentionElement(option.channel);
        } else {
            inlineElement = createTextNode(option.label);
        }
        this.dependencies.dom.insert(inlineElement);
        const [anchorNode, anchorOffset] = rightPos(inlineElement);
        this.dependencies.selection.setSelection({ anchorNode, anchorOffset });
        this.dependencies.dom.insert("\u00A0");
        this.dependencies.history.addStep();
    }

    async fetchSuggestions() {
        if (!this.config.thread || this.isDestroyed) {
            return;
        }
        let resetFetchingState = true;
        try {
            this.abortController?.abort();
            this.abortController = new AbortController();
            this.state.isFetching = true;
            await this.services["mail.suggestion"].fetchSuggestions(
                this.search,
                {
                    thread: this.config.thread,
                    abortSignal: this.abortController.signal,
                },
            );
        } catch (e) {
            this.lastFetchedSearch = null;
            if (e instanceof ConnectionAbortedError) {
                resetFetchingState = false;
                return;
            }
            throw e;
        } finally {
            if (resetFetchingState) {
                this.state.isFetching = false;
            }
        }
        if (!this.config.thread || this.isDestroyed) {
            return;
        }
        this.update();
        this.lastFetchedSearch = {
            ...this.search,
            count: this.state.items?.suggestions.length ?? 0,
        };
        if (!this.state.items?.suggestions.length) {
            this.clearSearch();
        }
    }

    updateSuggestionListProps() {
        const selection = this.dependencies.selection.getEditableSelection();
        Object.assign(this.suggestionListProps, {
            anchorRef: selection.anchorNode?.el,
            position: "bottom-fit",
            isLoading: !!this.search.term && this.state.isFetching,
            options: [],
            optionTemplate: undefined,
        });
        const suggestions = this.state.items.suggestions;
        switch (this.state.items.type) {
            case "Partner":
                Object.assign(this.suggestionListProps, {
                    optionTemplate: "mail.Composer.suggestionPartner",
                    options: suggestions.map((suggestion) => {
                        if (suggestion.isSpecial) {
                            return {
                                ...suggestion,
                                group: 1,
                                optionTemplate:
                                    "mail.Composer.suggestionSpecial",
                                classList: "o-mail-Composer-suggestion",
                            };
                        } else if (suggestion.Model.getName() === "res.role") {
                            return {
                                label: suggestion.name,
                                role: suggestion,
                                thread: this.thread,
                                optionTemplate: "mail.Composer.suggestionRole",
                                classList: "o-mail-Composer-suggestion",
                            };
                        } else {
                            return {
                                label:
                                    this.thread?.getPersonaName(suggestion) ??
                                    suggestion.name,
                                thread: this.thread,
                                partner: suggestion,
                                classList: "o-mail-Composer-suggestion",
                            };
                        }
                    }),
                });
                return;
            case "discuss.channel":
                Object.assign(this.suggestionListProps, {
                    optionTemplate: "mail.Composer.suggestionChannel",
                    options: suggestions.map((suggestion) => ({
                        label: suggestion.fullNameWithParent,
                        channel: suggestion,
                        classList: "o-mail-Composer-suggestion",
                    })),
                });
                return;
            case "ChannelCommand":
                Object.assign(this.suggestionListProps, {
                    optionTemplate: "mail.Composer.suggestionChannelCommand",
                    options: suggestions.map((suggestion) => ({
                        label: suggestion.name,
                        help: suggestion.help,
                        classList: "o-mail-Composer-suggestion",
                    })),
                });
                return;
            case "mail.canned.response":
                Object.assign(this.suggestionListProps, {
                    optionTemplate: "mail.Composer.suggestionCannedResponse",
                    options: suggestions.map((suggestion) => ({
                        cannedResponse: suggestion,
                        label: suggestion.substitution,
                        source: suggestion.source,
                        title: suggestion.substitution,
                        classList: "o-mail-Composer-suggestion",
                    })),
                });
                return;
            case "emoji":
                Object.assign(this.suggestionListProps, {
                    optionTemplate: "mail.Composer.suggestionEmoji",
                    options: suggestions.map((suggestion) => ({
                        emoji: suggestion,
                        label: suggestion.codepoints,
                    })),
                });
                return;
            default:
                return;
        }
    }

    clearSearch() {
        Object.assign(this.search, {
            delimiter: undefined,
            position: undefined,
            term: "",
        });
        this.state.items = undefined;
    }
}
