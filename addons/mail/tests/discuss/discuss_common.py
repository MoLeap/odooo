# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.mail.tests.common import MailCommon, mail_new_test_user


class DiscussCommon(MailCommon):
    """Base class providing common discuss test data."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.public_channel = cls.env["discuss.channel"]._create_channel(
            group_id=None,
            name="Public Channel",
        )
        cls.user_employee_nomail = mail_new_test_user(
            cls.env,
            login="employee_nomail",
            email=False,
            groups="base.group_user",
            company_id=cls.company_admin.id,
            name="Evita Employee NoEmail",
            notification_type="email",
            signature="--\nEvite",
        )
        cls.partner_employee_nomail = cls.user_employee_nomail.partner_id
        cls.alice_user = mail_new_test_user(
            cls.env,
            login="alice",
            groups="base.group_user",
            email="alice@test.com",
        )
        cls.bob_user = mail_new_test_user(
            cls.env,
            login="bob",
            groups="base.group_user",
            email="bob@test.com",
        )
        cls.eve_user = mail_new_test_user(
            cls.env,
            login="eve",
            groups="base.group_user",
            email="eve@test.com",
        )
        cls.john_user = mail_new_test_user(
            cls.env,
            login="john",
            groups="base.group_user",
            email="john@test.com",
        )
        cls.alice_partner = cls.alice_user.partner_id
        cls.bob_partner = cls.bob_user.partner_id
        cls.eve_partner = cls.eve_user.partner_id
        cls.john_partner = cls.john_user.partner_id
