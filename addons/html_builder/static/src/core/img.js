import {
    Component,
    onWillStart,
    onWillDestroy,
    onWillUpdateProps,
    useEffect,
    useRef,
    useState,
    xml,
} from "@odoo/owl";
import { Cache } from "@web/core/utils/cache";

const svgCache = new Cache(async (src) => {
    let text;
    try {
        const response = await window.fetch(src);
        text = await response.text();
    } catch {
        // In some tours, the tour finishes before the fetch is done
        // and when a tour is finished, the python side will ask the
        // browser to stop loading resources. This causes the fetch
        // to fail and throw an error which crashes the test even
        // though it completed successfully.
        // So return an empty SVG to ensure everything completes
        // correctly.
        text = "<svg></svg>";
    }
    const parser = new window.DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    return xmlDoc.getElementsByTagName("svg")[0];
}, JSON.stringify);

export class Image extends Component {
    static props = {
        src: String,
        class: { type: String, optional: true },
        style: { type: String, optional: true },
        alt: { type: String, optional: true },
        attrs: { type: Object, optional: true },
        svgCheck: { type: Boolean, optional: true },
        lazyLoad: { type: Boolean, optional: true },
    };
    static defaultProps = {
        svgCheck: true,
        lazyLoad: false,
    };
    static template = xml`
        <t t-if="state.loaded">
            <svg t-if="isSvg(props.src)" t-ref="svg"
                xmlns="http://www.w3.org/2000/svg"
                t-att-width="svg.width"
                t-att-viewBox="svg.viewBox"
                t-att-fill="svg.fill"
                class="hb-svg d-flex m-auto"
                t-att-class="props.class"
                t-att-style="props.style"
                t-att="props.attrs"/>
            <img t-else=""
                t-att-src="props.src"
                t-att-class="props.class"
                t-att-style="props.style"
                t-att-alt="props.alt"
                t-att="props.attrs"/>
        </t>
        <span t-elif="props.lazyLoad" t-ref="placeholder"
            style="display:inline-block;width:100%;aspect-ratio:1;"/>
        `;

    setup() {
        this.svgRef = useRef("svg");
        this.placeholderRef = useRef("placeholder");
        this.svg = {};
        this.state = useState({ loaded: false });
        // _isMounted guards this.svg assignment (a plain object, not reactive state).
        // Owl silently ignores state mutations on destroyed components, so we do NOT
        // need to guard this.state.loaded assignments with a flag.
        this._isMounted = true;

        onWillStart(async () => {
            if (!this.props.lazyLoad) {
                await this.handleImgLoad(this.props.src);
            }
        });
        onWillUpdateProps(async (nextProps) => {
            if (this.props.src !== nextProps.src) {
                // Reset loaded state immediately so stale image is not shown
                // while the new src is loading.
                this.state.loaded = false;
                await this.handleImgLoad(nextProps.src);
            }
        });
        onWillDestroy(() => {
            this._isMounted = false;
            // Note: IntersectionObserver cleanup is handled by the useEffect
            // return function below — no need to track this.observer separately.
        });

        // Set up IntersectionObserver for lazy loading after the
        // placeholder <span> is mounted in the DOM.
        // useEffect's cleanup function (return value) handles disconnect on both:
        //   - component destroy (Owl calls cleanup on unmount)
        //   - state.loaded becoming true (placeholder span removed, lazyRef.el → null)
        useEffect(
            (placeholderEl) => {
                if (!placeholderEl) {
                    return;
                }
                if ("IntersectionObserver" in window) {
                    // Start loading slightly before the thumbnail scrolls fully into
                    // view (100px margin) to reduce perceived latency.
                    const PRELOAD_MARGIN = "100px";
                    const observer = new IntersectionObserver(
                        (entries) => {
                            for (const entry of entries) {
                                if (entry.isIntersecting) {
                                    this.handleImgLoad(this.props.src).catch((e) => {
                                        console.error(
                                            "[Image] lazy load failed for",
                                            this.props.src,
                                            e
                                        );
                                    });
                                    // Disconnect immediately — we only trigger once per image.
                                    observer.disconnect();
                                }
                            }
                        },
                        { rootMargin: PRELOAD_MARGIN }
                    );
                    observer.observe(placeholderEl);
                    return () => observer.disconnect();
                } else {
                    // Fallback: load immediately if IntersectionObserver is unavailable.
                    this.handleImgLoad(this.props.src).catch((e) => {
                        console.error("[Image] lazy load failed for", this.props.src, e);
                    });
                }
            },
            () => [this.placeholderRef.el]
        );

        useEffect(
            (imgLoaded) => {
                if (imgLoaded && this.isSvg(this.props.src) && this.svg.children.length) {
                    // We can't use t-out with markup because it is parsed as HTML,
                    // but SVG need to be parsed as XML for all features to work.
                    const children = [];
                    for (const child of this.svg.children) {
                        children.push(child.cloneNode(true));
                    }
                    this.svgRef.el.replaceChildren(...children);
                }
            },
            () => [this.state.loaded]
        );
    }

    async handleImgLoad(src) {
        const prom = this.isSvg(src) ? this.getSvg(src) : this.loadImage(src);
        if (this.isSvg(src)) {
            prom.then((svg) => {
                // this.svg is a plain object (not reactive), so we guard against
                // assignment after destroy to avoid holding stale DOM references.
                if (this._isMounted) {
                    this.svg = svg;
                }
            });
        }
        if (this.env.imgGroup) {
            this.env.imgGroup.addImgProm(prom, () => {
                // Guard against state mutation on destroyed component.
                // While Owl ignores mutations on destroyed components,
                // this prevents unnecessary processing in ImgGroup.
                if (this._isMounted) {
                    this.state.loaded = true;
                }
            });
        } else {
            await prom;
            this.state.loaded = true;
        }
    }

    loadImage(src = this.props.src) {
        // onerror resolves (not rejects) so callers never need a catch for network
        // failures — they receive { status: "error" } instead.
        return new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve({ status: "loaded" });
            img.onerror = () => resolve({ status: "error" });
            img.src = src;
        });
    }

    isSvg(src) {
        return this.props.svgCheck && src.split(".").pop() === "svg";
    }

    async getSvg(src = this.props.src) {
        const svgEl = (await svgCache.read(src)).cloneNode(true);
        return {
            viewBox: svgEl.getAttribute("viewBox"),
            width: svgEl.getAttribute("width") || "",
            fill: svgEl.getAttribute("fill") || "",
            children: svgEl.children,
        };
    }
}
