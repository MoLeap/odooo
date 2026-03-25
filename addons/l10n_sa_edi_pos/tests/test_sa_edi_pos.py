from unittest.mock import patch

from odoo.tests import tagged

from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.addons.l10n_sa_edi.tests.common import AccountEdiTestCommon, TestSaEdiCommon
from odoo.addons.point_of_sale.tests.test_frontend import TestPointOfSaleHttpCommon
from odoo.addons.point_of_sale.tests.test_generic_localization import TestGenericLocalization


@tagged('post_install', '-at_install', 'post_install_l10n')
class TestGenericSAEdi(TestGenericLocalization):
    @classmethod
    @AccountEdiTestCommon.setup_edi_format('l10n_sa_edi.edi_sa_zatca')
    @AccountTestInvoicingCommon.setup_country('sa')
    def setUpClass(cls):
        super().setUpClass()
        cls.main_pos_config.journal_id._l10n_sa_load_edi_demo_data()
        cls.company.write({
            'name': 'Generic SA EDI',
            'email': 'info@company.saexample.com',
            'phone': '+966 51 234 5678',
            'street2': 'Testomania',
            'vat': '311111111111113',
            'state_id': cls.env['res.country.state'].create({
                'name': 'Riyadh',
                'code': 'RYA',
                'country_id': cls.company.country_id.id
            }),
            'street': 'Al Amir Mohammed Bin Abdul Aziz Street',
            'city': 'المدينة المنورة',
            'zip': '42317',
            'l10n_sa_edi_building_number': '1234',
        })


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestSaEdiPosAccessRights(TestSaEdiCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pos_config = cls.env['pos.config'].sudo().create({'name': 'SA Test POS'})
        cls.pos_session = cls.env['pos.session'].sudo().create({
            'config_id': cls.pos_config.id,
            'state': 'opened',
        })

    def test_accounting_user_can_read_invoice_with_pos_order(self):
        """
        Regression: an accounting admin without POS access should not get an
        AccessError when opening a customer invoice linked to a POS order.
        """
        invoice = self._create_test_invoice(
            move_type='out_invoice',
            partner_id=self.partner_sa,
            invoice_line_ids=[{'price_unit': 100.0, 'tax_ids': [self.tax_15.id]}],
        )

        # Link a pos.order to the invoice to trigger the code path
        self.env['pos.order'].sudo().create({
            'session_id': self.pos_session.id,
            'account_move': invoice.id,
            'amount_tax': 0.0,
            'amount_total': 100.0,
            'amount_paid': 100.0,
            'amount_return': 0.0,
        })

        # Create a user with accounting admin rights but no POS access
        accounting_user = self.env['res.users'].create({
            'name': 'Test Accountant No POS',
            'login': 'test_accountant_no_pos',
            'company_id': self.company.id,
            'company_ids': [(4, self.company.id)],
            'group_ids': [(4, self.env.ref('account.group_account_manager').id)],
        })

        edi_format = self.env.ref('l10n_sa_edi.edi_sa_zatca')

        # Simulate pos_settle_due being installed: it adds _is_settle_or_deposit to
        # pos.order.line, which is what enables the buggy code path. Without this
        # patch the hasattr() guard would short-circuit and the bug would not be hit.
        with patch(
            'odoo.addons.point_of_sale.models.pos_order.PosOrderLine._is_settle_or_deposit',
            new=lambda self: False,
            create=True,
        ):
            result = edi_format._move_has_settle_or_deposit_pos_order(invoice.with_user(accounting_user))
            self.assertFalse(result)


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestUi(TestPointOfSaleHttpCommon):

    @classmethod
    @AccountEdiTestCommon.setup_country('sa')
    def setUpClass(cls):
        super().setUpClass()

    @patch('odoo.addons.l10n_sa_edi.models.account_journal.AccountJournal._l10n_sa_ready_to_submit_einvoices',
           new=lambda self: True)
    def test_ZATCA_invoice_not_mandatory_if_deposit(self):
        """
        Tests that the invoice is  not mandatory in POS payment for ZATCA if it's a deposit.
        """

        self.test_partner = self.env["res.partner"].create({"name": "AAA Partner"})
        self.start_tour(
            "/pos/ui?config_id=%d" % self.main_pos_config.id,
            'ZATCA_invoice_not_mandatory_if_deposit',
            login="pos_admin"
        )

    @patch('odoo.addons.l10n_sa_edi.models.account_journal.AccountJournal._l10n_sa_ready_to_submit_einvoices',
           new=lambda self: True)
    def test_ZATCA_invoice_mandatory_if_regular_order(self):
        """
        Tests that the invoice is mandatory in POS payment for ZATCA.
        Also is by default checked.
        """

        self.test_partner = self.env["res.partner"].create({"name": "AAA Partner"})
        self.start_tour(
            "/pos/ui?config_id=%d" % self.main_pos_config.id,
            'ZATCA_invoice_mandatory_if_regular_order',
            login="pos_admin",
        )
