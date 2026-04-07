from lxml import etree
from odoo.addons.account_edi_ubl_cii.tests.common import TestUblCiiCommon

from odoo.tests import tagged


UBL_NAMESPACES = {
    'cbc': "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    'cac': "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}


@tagged('post_install_l10n', 'post_install', '-at_install')
class TestBeExport(TestUblCiiCommon):
    @classmethod
    def setUpClass(cls, chart_template_ref='be_comp'):
        super().setUpClass(chart_template_ref=chart_template_ref)

        cls.ubl_namespaces = {
            'cbc': "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
            'cac': "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        }

    def test_invoice_cocontractant_tax_exemption_reason(self):

        co_contractant = self.env['account.chart.template'].ref('fiscal_position_template_4', raise_if_not_found=False)
        co_contractant.note = "Test note"
        invoice = self._create_invoice_one_line(
            product_id=self.product_a,
            partner_id=self.partner_be,
        )
        invoice.commercial_partner_id.property_account_position_id = co_contractant
        invoice.action_post()
        xml_content = self.env['account.edi.xml.ubl_bis3']._export_invoice(invoice)[0]
        xml_tree = etree.fromstring(xml_content)
        note = xml_tree.find('.//cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason', self.ubl_namespaces)
        self.assertEqual(note.text, 'Test note')
