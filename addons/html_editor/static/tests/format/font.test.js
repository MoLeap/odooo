import { waitFor } from "@odoo/hoot-dom";
import { setupEditor } from "../_helpers/editor";
import { getContent } from "../_helpers/selection";
import { expect, test } from "@odoo/hoot";
import { expandToolbar } from "../_helpers/toolbar";
import { contains } from "@web/../tests/web_test_helpers";

test("should change the containing block with the font", async () => {
    const { el } = await setupEditor("<p>ab[cde]fg</p>");
    await waitFor(".btn[name='font']");
    expect(".btn[name='font']").toHaveText("Paragraph");
    await contains(".btn[name='font']").click();
    await waitFor(".o_font_selector_menu");
    await contains(".o_font_selector_menu .o-dropdown-item[name=blockquote]").click();
    expect(".btn[name='font']").toHaveText("Quote");
    expect(getContent(el)).toBe("<blockquote>ab[cde]fg</blockquote>");
});

test("should have font tool only if the block is content editable (non editable)", async () => {
    await setupEditor(
        `<div contenteditable="false"><p><span contenteditable="true">ab[cde]fg</span></p></div>`
    );
    await expandToolbar();
    expect(".btn[name='font']").toHaveCount(0);
});

test("should have font tool only if the block is content editable (editable)", async () => {
    await setupEditor(
        `<div contenteditable="true"><p><span contenteditable="true">ab[cde]fg</span></p></div>`
    );
    await expandToolbar();
    expect(".btn[name='font']").toHaveCount(1);
});
