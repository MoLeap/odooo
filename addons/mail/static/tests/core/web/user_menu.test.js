import {
    click,
    defineMailModels,
    hover,
    insertText,
    onRpcBefore,
    start,
} from "@mail/../tests/mail_test_helpers";
import { describe, expect, test, waitFor } from "@odoo/hoot";

describe.current.tags("desktop");
defineMailModels();

test("User menu shows im_status icon", async () => {
    await start();
    await waitFor(".o_user_menu .o-mail-ImStatus");
});

test("set status message triggers RPC", async () => {
    onRpcBefore("/mail/set_status_message", (args) => {
        expect.step(`set_status_message: ${args.message}`);
    });
    await start();
    await click(".o_user_menu");
    await hover(".dropdown-menu a:has(.o-mail-ImStatus)");
    await insertText(
        ".o-mail-ImStatusDropdown input[placeholder='e.g. Off on Wednesdays']",
        "I am busy"
    );
    await expect.waitForSteps(["set_status_message: I am busy"]);
});
