import { Image } from "@html_builder/core/img";
import { ImgGroup } from "@html_builder/core/img_group";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { expect, test, describe } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-dom";
import { Component, xml } from "@odoo/owl";
import { mountWithCleanup, patchWithCleanup } from "@web/../tests/web_test_helpers";

describe.current.tags("desktop");

defineMailModels(); // meh
test("ImgGroup's inner Image components should not be blocked before src load", async () => {
    const defs = {
        img1: Promise.withResolvers(),
        img2: Promise.withResolvers(),
        img3: Promise.withResolvers(),
    };
    patchWithCleanup(Image.prototype, {
        loadImage(src) {
            const { promise: def } = defs[this.props.class];
            return Promise.all([super.loadImage(src), def]);
        },
    });
    class Container extends Component {
        static components = { ImgGroup, Image };
        static template = xml`
            <ImgGroup>
                <t t-foreach="Object.keys(defs)" t-as="key" t-key="key">
                    <Image src="''" class="key"/>
                </t>
            </ImgGroup>`;
        static props = {};

        setup() {
            this.defs = defs;
        }
    }
    await mountWithCleanup(Container);

    for (const key in defs) {
        expect("img").toHaveCount(0);
        defs[key].resolve();
        await animationFrame();
    }
    expect("img").toHaveCount(3);
});

test("Image with lazyLoad defers loading until visible", async () => {
    let observeCallback;
    patchWithCleanup(window, {
        IntersectionObserver: class {
            constructor(callback) {
                observeCallback = callback;
            }
            observe() {}
            disconnect() {}
        },
    });

    const def = Promise.withResolvers();
    let loadImageCalled = false;
    patchWithCleanup(Image.prototype, {
        loadImage(src) {
            loadImageCalled = true;
            return def.promise;
        },
    });

    class Container extends Component {
        static components = { Image };
        static template = xml`<Image src="'/test.png'" lazyLoad="true"/>`;
        static props = {};
    }
    await mountWithCleanup(Container);

    // Should show a placeholder span instead of an image
    expect("img").toHaveCount(0);
    expect("span").toHaveCount(1);
    expect(loadImageCalled).toBe(false);

    // Simulate the element becoming visible
    observeCallback([{ isIntersecting: true }]);
    await animationFrame();

    // loadImage was called but not yet resolved
    expect(loadImageCalled).toBe(true);
    expect("img").toHaveCount(0);

    // Resolve the load
    def.resolve({ status: "loaded" });
    await animationFrame();

    // Image should now be fully rendered
    expect("img").toHaveCount(1);
    expect("span").toHaveCount(0);
});

test("ImgGroup batches lazy-loaded images that become visible together", async () => {
    const observeCallbacks = [];
    patchWithCleanup(window, {
        IntersectionObserver: class {
            constructor(callback) {
                observeCallbacks.push(callback);
            }
            observe() {}
            disconnect() {}
        },
    });

    const defs = {
        img1: Promise.withResolvers(),
        img2: Promise.withResolvers(),
        img3: Promise.withResolvers(),
    };
    patchWithCleanup(Image.prototype, {
        loadImage(src) {
            const { promise: def } = defs[this.props.class];
            return Promise.all([super.loadImage(src), def]);
        },
    });

    class Container extends Component {
        static components = { ImgGroup, Image };
        static template = xml`
            <ImgGroup>
                <t t-foreach="Object.keys(defs)" t-as="key" t-key="key">
                    <Image src="''" class="key" lazyLoad="true"/>
                </t>
            </ImgGroup>`;
        static props = {};

        setup() {
            this.defs = defs;
        }
    }
    await mountWithCleanup(Container);

    // Initially all show placeholders
    expect("img").toHaveCount(0);
    expect("span").toHaveCount(3);

    // Simulate all images becoming visible at once
    for (const cb of observeCallbacks) {
        cb([{ isIntersecting: true }]);
    }
    await animationFrame();

    // Still no images - waiting for load promises
    expect("img").toHaveCount(0);

    // Resolve img1 and img2, but not img3
    defs.img1.resolve();
    defs.img2.resolve();
    await animationFrame();

    // Still no images - ImgGroup batches them together
    expect("img").toHaveCount(0);

    // Resolve img3
    defs.img3.resolve();
    await animationFrame();

    // All images should appear together
    expect("img").toHaveCount(3);
    expect("span").toHaveCount(0);
});
