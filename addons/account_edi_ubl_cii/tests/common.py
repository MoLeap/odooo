import requests

from lxml import etree

from odoo import Command
from odoo.tools import config, file_open
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


class TestUblCiiCommon(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner_be = cls._create_partner_be()
        cls.partner_lu_dig = cls._create_partner_lu_dig()
        cls.partner_nl = cls._create_partner_nl()
        cls.partner_au = cls._create_partner_au()

    @classmethod
    def _create_company(cls, **create_values):
        # EXTENDS 'account'
        create_values.setdefault('currency_id', cls.env.ref('base.EUR').id)
        company = super()._create_company(**create_values)
        company.tax_calculation_rounding_method = 'round_globally'
        return company

    @classmethod
    def _create_partner_default_values(cls):
        return {
            'invoice_sending_method': 'manual',
            'property_account_receivable_id': cls.company_data['default_account_receivable'].id,
            'property_account_payable_id': cls.company_data['default_account_payable'].id,
            'company_id': cls.company_data['company'].id,
        }

    @classmethod
    def _create_partner_be(cls, **kwargs):
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': 'partner_be',
            'street': "Rue des Bourlottes 9",
            'zip': "1367",
            'city': "Ramillies",
            'vat': 'BE0477472701',
            'company_registry': '0477472701',
            'bank_ids': [Command.create({'acc_number': 'BE90735788866632', 'allow_out_payment': True})],
            'country_id': cls.env.ref('base.be').id,
            **kwargs,
        })

    @classmethod
    def _create_partner_lu_dig(cls, **kwargs):
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': "Division informatique et gestion",
            'street': "bd de la Foire",
            'zip': "L-1528",
            'city': "Luxembourg",
            'vat': None,
            'company_registry': None,
            'country_id': cls.env.ref('base.lu').id,
            'peppol_eas': '9938',
            'peppol_endpoint': '00005000041',
            **kwargs,
        })

    @classmethod
    def _create_partner_nl(cls, **kwargs):
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': "partner_nl",
            'street': "Kunststraat, 3",
            'zip': "1000",
            'city': "Amsterdam",
            'vat': 'NL000099998B57',
            'company_registry': None,
            'country_id': cls.env.ref('base.nl').id,
            'peppol_eas': '0106',
            'peppol_endpoint': '77777677',
            **kwargs,
        })

    @classmethod
    def _create_partner_au(cls, **kwargs):
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': "partner_au",
            'street': "Parliament Dr",
            'zip': "2600",
            'city': "Canberra",
            'vat': '53 930 548 027',
            'country_id': cls.env.ref('base.au').id,
            'bank_ids': [Command.create({'acc_number': '93999574162167', 'allow_out_payment': True})],
            **kwargs,
        })

    @classmethod
    def _create_mixed_early_payment_term(cls, **kwargs):
        return cls.env['account.payment.term'].create({
            'name': "2/7 Net 30",
            'note': "Payment terms: 30 Days, 2% Early Payment Discount under 7 days",
            'early_discount': True,
            'discount_percentage': 2,
            'discount_days': 7,
            'early_pay_discount_computation': 'mixed',
            'line_ids': [Command.create({'value': 'percent', 'value_amount': 100.0, 'nb_days': 30})],
            **kwargs,
        })

    @classmethod
    def _create_add_invoice_line_cash_rounding(cls, **kwargs):
        return cls.env['account.cash.rounding'].create({
            'name': "Rounding 0.05",
            'rounding': 0.05,
            'strategy': 'add_invoice_line',
            'profit_account_id': cls.company_data['default_account_revenue'].copy().id,
            'loss_account_id': cls.company_data['default_account_expense'].copy().id,
            'rounding_method': 'HALF-UP',
            **kwargs,
        })

    @classmethod
    def _create_biggest_tax_cash_rounding(cls, **kwargs):
        return cls.env['account.cash.rounding'].create({
            'name': "Rounding 0.05",
            'rounding': 0.05,
            'strategy': 'biggest_tax',
            'rounding_method': 'HALF-UP',
            **kwargs,
        })

    @classmethod
    def subfolders(cls):
        return None, None, None

    # -------------------------------------------------------------------------
    # EXPORT HELPERS
    # -------------------------------------------------------------------------

    @classmethod
    def _generate_invoice_ubl_file(cls, invoice, **kwargs):
        cls.env['account.move.send']._generate_and_send_invoices(invoice, **{'sending_methods': ['manual'], **kwargs})

    def _assert_invoice_ubl_file(self, invoice, filename):
        subfolder_format, subfolder_document, subfolder_country = self.subfolders()
        subfolder = f'export/{subfolder_format}/{subfolder_document}/{subfolder_country}'

        self.assertTrue(invoice.ubl_cii_xml_id)

        if 'EXTERNAL_MODE' in config['test_tags']:
            self._assert_ubl(invoice.ubl_cii_xml_id.raw)

        self.assert_xml(invoice.ubl_cii_xml_id.raw, filename, subfolder=subfolder)

    def _assert_ubl(self, xml_element: str | bytes | etree._Element):
        """
        Helper to validate the xml_element against the ubl structure.
        This function should only be run in EXTERNAL_MODE!

        :param xml_element: the _Element/str/bytes content to be validated
        :return:
        """
        assert 'EXTERNAL_MODE' in config['test_tags'], "Can only be run in EXTERNAL_MODE"

        def format_errors(errors: list[str] | dict[str, list[str]]) -> str:
            if isinstance(errors, list):
                return '\n- '.join(errors)

            joined = ""
            for group, group_errors in errors.items():
                joined += f"{group}: \n{format_errors(group_errors)}\n"
            return joined

        if isinstance(xml_element, etree._Element):
            xml_element = etree.tostring(xml_element, encoding='UTF-8')
        if isinstance(xml_element, bytes):
            xml_element = xml_element.decode('utf-8')

        payload = {
            'jsonrpc': '2.0',
            'method': 'call',
            'params': {
                'file_content': xml_element,
            },
        }

        # Get file details
        details_response = requests.post(url='https://iap-services.odoo.com/file_validator/get/details', json=payload)
        self.assertEqual(details_response.status_code, 200)
        details_json = details_response.json()
        self.assertFalse('error' in details_json, f"Details call failed: \n\n{details_json.get('error')}")
        details = details_json['result']

        # XSD validation
        payload['params']['xsd_name'] = details['xsd_name']

        xsd_response = requests.post(url='https://iap-services.odoo.com/file_validator/validate/xsd', json=payload)
        self.assertEqual(xsd_response.status_code, 200)
        xsd_json = xsd_response.json()['result']
        self.assertFalse(xsd_json['errors'], f"Call to xsd validator failed:\n\n{format_errors(xsd_json['errors'])}")
        self.assertFalse(xsd_json['xsd_errors'], f"XSD validation failed with following error(s):\n\n{format_errors(xsd_json['xsd_errors'])}")

        # Schematron validation
        del payload['params']['xsd_name']
        payload['params']['script_name'] = 'lxml'

        schematron_validation_errors = {}
        for schematron_name in details['schematrons']:
            payload['params']['schematron_name'] = schematron_name

            schematron_response = requests.post(url='https://iap-services.odoo.com/file_validator/validate/schematron', json=payload)
            self.assertEqual(xsd_response.status_code, 200, f"Schematron call failed for '{schematron_name}'")
            schematron_json = schematron_response.json()['result']

            self.assertFalse(schematron_json['errors'], f"Error for schematron '{schematron_name}': \n\n{format_errors(schematron_json['errors'])}")
            if schematron_json['fatals']:
                schematron_validation_errors[schematron_name] = schematron_json['fatals']

        self.assertFalse(schematron_validation_errors, f"Schematron validation failed with following error(s):\n\n{format_errors(schematron_validation_errors)}")

    # -------------------------------------------------------------------------
    # IMPORT HELPERS
    # -------------------------------------------------------------------------

    @classmethod
    def _import_file_content(cls, test_name, extension):
        subfolder_format, subfolder_document, subfolder_country = cls.subfolders()
        subfolder = f'import/{subfolder_format}/{subfolder_document}/{subfolder_country}'
        filename = f"{test_name}.{extension}"
        full_file_path = cls._get_test_file_path(cls, filename, subfolder=subfolder)
        with file_open(full_file_path, 'rb') as file:
            return filename, file.read()

    @classmethod
    def _import_invoice_as_attachment(cls, test_name):
        """ Import a test file as an attachment.

        :param test_name:   The name of the test file to import.
        :return:            The newly created attachment with the content of the targeted file.
        """
        filename, file_content = cls._import_file_content(test_name, 'xml')
        return cls.env['ir.attachment'].create({
            'mimetype': 'application/xml',
            'name': filename,
            'raw': file_content,
        })

    @classmethod
    def _import_invoice_as_attachment_on(cls, test_name=None, attachment=None, journal=None):
        """ Import an attachment on an accounting journal to create a brand new invoice.

        :param test_name:   The name of the test file to import (mutually exclusive with 'attachment').
        :param attachment:  OR an attachment containing the file to be imported  (mutually exclusive with 'test_name').
        :param journal:     An optional specific accounting journal. Will be the default purchase journal if not specified.
        :return:            The newly created invoice/vendor bill.
        """
        assert bool(test_name) ^ bool(attachment), "Either `filename` or `attachment` must be provided, but not both."
        journal = journal or cls.company_data["default_journal_purchase"]
        if test_name:
            attachment = cls._import_invoice_as_attachment(test_name)
        return journal._create_document_from_attachment(attachment.id)


class TestUblCiiBECommon(TestUblCiiCommon):

    @classmethod
    def _create_company(cls, **create_values):
        company = super()._create_company(**create_values)

        company.partner_id.write({
            'street': "Chaussée de Namur 40",
            'zip': "1367",
            'city': "Ramillies",
            'vat': 'BE0202239951',
            'company_registry': '0202239951',
            'country_id': cls.env.ref('base.be').id,
            'bank_ids': [Command.create({'acc_number': 'BE15001559627230', 'allow_out_payment': True})],
        })
        return company

    @classmethod
    def subfolders(cls):
        subfolder_format, subfolder_document, _subfolder_country = super().subfolders()
        return subfolder_format, subfolder_document, 'be'


class TestUblCiiFRCommon(TestUblCiiCommon):

    @classmethod
    def _create_company(cls, **create_values):
        company = super()._create_company(**create_values)

        company.partner_id.write({
            'street': "Rue Grand Port 1",
            'zip': "35400",
            'city': "Saint-Malo",
            'vat': 'FR23334175221',
            'country_id': cls.env.ref('base.fr').id,
        })
        return company

    @classmethod
    def subfolders(cls):
        subfolder_format, subfolder_document, _subfolder_country = super().subfolders()
        return subfolder_format, subfolder_document, 'fr'


class TestUblBis3Common(TestUblCiiCommon):

    @classmethod
    def _create_partner_default_values(cls):
        values = super()._create_partner_default_values()
        values['invoice_edi_format'] = 'ubl_bis3'
        return values

    # -------------------------------------------------------------------------
    # EXPORT HELPERS
    # -------------------------------------------------------------------------

    @classmethod
    def subfolders(cls):
        _subfolder_format, subfolder_document, subfolder_country = super().subfolders()
        return 'bis3', subfolder_document, subfolder_country
