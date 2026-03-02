import { registry } from "@web/core/registry";

function get_website_profile_description_steps(editClass) {
    return [{
        content: "Click on one user profile card",
        trigger: "div[onclick]:contains(\"test_user\")",
        run: "click",
        expectUnloadPage: true,
    }, {
        content: "Edit profile",
        trigger: `a.o_wprofile_editor.${editClass}`,
        run: "click",
    }, {
        content: "Add some content",
        trigger: ".odoo-editor-editable",
        run: "editor content <p>code here</p>",
    }, {
        content: "Save changes",
        trigger: "button:contains('Update')",
        run: "click",
        expectUnloadPage: true,
    }, {
        content: "Check the content is saved",
        trigger: "span[data-oe-field='website_description']:contains('content <p>code here</p>')",
    }];
}

registry.category("web_tour.tours").add("website_profile_description", {
    url: "/profile/users",
    steps: () => get_website_profile_description_steps("d-md-inline-block"),
});

registry.category("web_tour.tours").add("website_profile_description_mobile", {
    url: "/profile/users",
    steps: () => get_website_profile_description_steps("d-inline-block"),
});
