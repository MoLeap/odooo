import { getUrlOptions } from "@html_editor/main/media/video/utils";

export class ThirdPartyVideoAbstract {
    /**
     * Check if the url is a valid video url.
     *
     * @param {String} url
     * @returns {array|boolean} a regex match || false
     */
    static isValidVideoUrl(url) {
        url = url.trim();
        if (!/^https?:\/\//.test(url)) {
            url = "https://" + url;
        }
        if (!URL.canParse(url)) {
            return false;
        }
        return this.urlMatcher.exec(url) || false;
    }

    /**
     * Returns the video data extracted from the provided url.
     *
     * @param {array} urlMatch The result of the regex match of the url
     * @param {Object} [forcedOptions={}]
     */
    static getVideoUrlData(urlMatch, forcedOptions = {}) {
        const baseUrl = new URL(urlMatch[0]);
        const videoId = urlMatch.groups.id;
        const options = {
            ...getUrlOptions(baseUrl, this.optionsConfig || {}),
            ...(this?.getCustomUrlOptions?.(baseUrl) || {}),
            ...forcedOptions,
        };
        // always mute video when autoplay is enabled
        if (options.autoplay) {
            options.muted = true;
        }

        return {
            baseUrl: urlMatch[0],
            platform: this.id,
            videoId,
            embedUrl: this.getEmbedUrl(videoId, options),
            // thumbnailUrl can be a promise in some cases (see vimeo)
            thumbnailUrl: this.getThumbnailUrl?.(videoId) || "",
            options,
        };
    }
}
