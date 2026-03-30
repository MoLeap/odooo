import re
from collections import defaultdict
from lxml import etree


from odoo import _, api, fields, models
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.l10n_fr_pdp_reports.utils import drom_com_territories


G1_05_RE = re.(r'^(?! )(?!.*  )[A-Za-z0-9+\-_/ ]{1,20}(?<! )$')  # can't start with space, can't have 2 consecutive spaces, max 20 chars, allowed chars are alphanumeric, space, -, _, /, can't end with space

MOVE_ERRORS = {
    'delivery' = {
        'LineOne': "Missing address street (line 1)",
        'CityName': "Missing address city",
        'PostalZone': "Missing address zip",
        'CountryId': "Missing address country",
    },
}
class PdpFlow10Buider(models.AbstractModel):
    """Build Flow 10 payloads for a flow"""
    _name = "pdp.flow.10.builder"
    _description = "Flow 10 XML Builder"

    @api.model
    def _build_payload(self, flow):
        valid_moves = flow.move_ids - flow.error_move_ids
        if not valid_moves:
            return False


        node = {
            '_tag': 'Report',
        }

        if flow.report_type == 'transaction':
            self._add_transacitons(node, flow, valid_moves)  # TB-2
        # else:
        #     body = self._get_payments(flow)

        xml = dict_to_xml(
            node=documnent,
            nsmap={'xsi': 'http://www.w3.org/2001/XMLSchema-instance'},
        )
        payload = etree.tostring(xml, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()
        return payload

    @api.model
    def _add_transacitons(self, payload, flow, moves):
        invoices = []
        error_move_ids = []
        for move in moves:
            is_purchase = move.is_purchase_document(include_receipts=False)
            seller = move.commercial_partner_id if is_purchase else move.company_id.partner_id
            buyer = move.company_id.partner_id if is_purchase else move.commercial_partner_id
            document_node = {}
            vals = defaultdict(dict)
            vals.update({
                'invoice': move,
                'document_type': 'invoice',
                'currency_id': move.currency_id,
            })
            invoice = {
                '_tag': 'Invoice',
                'Id': {'_text': move.name},
                'IssueDate': {'_text': self._format_date(move.invoice_date)},
                'TypeCode': {'_text': self._get_move_typecode(move)},
                'CurrencyCode': {'_text': move.currency_id.name},
                'DueDate': {'_text': self._format_date(move.invoice_date_due or move.invoice_date or move.date)},
            }
            if any(
                self._add_invoice_due_date_type_code(invoice, move)
                self._add_invoice_notes(invoice, move)
                self._add_invoice_business_process(invoice, move)
                self._add_invoice_referenced_documents(invoice, move)
                self._add_invoice_partner_vals(payload, seller, 'Seller')
                self._add_invoice_partner_vals(payload, buyer, 'Buyer')
                self._add_invoice_delivery_vals(invoice, move)
                self._add_invoice_invoice_period(invoice, move, flow)
                self._add_invoice_seller_tax_representative(invoice, move)
            ):
                error_move_ids.append(move.id)
                continue

            invoices.append(invoice)
            if invoices:
                payload['TransactionsReport'] = [{
                    '_tag': 'ReportPeriod',  # TG-7
                    'StartDate' : {'_text': self._format_date(flow.period_start or flow.reporting_date)},
                    'EndDate': {'_text': self._format_date(flow.period_end or flow.reporting_date)},
                }] + invoices
        return error_move_ids

    def _add_invoice_due_date_type_code(self, invoice, move):
        # TODO: implement logic
        # Should only be '5' when invoice is service (or mixed ?) and some services are subject to VAT invoice date.
        # Should be UNTDID 2475 Subset:
        # 5 Date of invoice
        # 29 Date of delivery of goods to establishments/domicile/site
        # 72 Payment date
        code = '5'
        if code:
            invoice['TaxDueDateTypeCode'] = {'_text': tax_due_date_type_code}

    def _add_invoice_notes(self, invoice, move):
        # TODO: implement logic
        pass

    def _add_invoice_business_process(self, invoice, move):
        """Determine billing framework ID (TT-28) from invoice"""
        product_lines = move.invoice_line_ids.filtered(lambda ln: ln.display_type == 'product')
        scopes = set(product_lines.tax_ids.mapped('tax_scope'))
        if 'service' in scopes:
            if 'consu' in scopes:
                prefix = 'M'
            else:
                prefix = 'S'
        else:
            prefix = 'B'
        if move._is_downpayment():
            if any(line.display_type == 'product' and not line.is_downpayment for line in move.invoice_line_ids):
                suffix = '4'
            else:
                suffix = '2' if move.payment_state in ('paid', 'reversed') else '1'
        else:
            suffix = '1'
        invoice['BusinessProcess'] = {
            'Id': {'_texte': f'{prefix}{suffix}'},
            'TypeID': {'_texte': 'urn.cpro.gouv.fr:1p0:ereporting'},
        }

    def _add_invoice_referenced_documents(self, invoice, move):
        referenced_documents = []  # TODO implement logic to find referenced documents
        if referenced_documents:
            invoice['ReferencedDocument'] = [{
                'Id': {'_text': id},
                'IssueDate': {'_text': self._format_date(issuedate)}
            } for id, issuedate in referenced_documents]

    def _add_invoice_partner_vals(self, invoice, partner, tag):
        # Country codes for DROM-COM territories are mapped to 'FR' for PPF transmission
        mapped_country_code = drom_com_territories.map_country_code_for_ppf(partner.country_id.code)
        # Check for specific identifier schemes (RIDET, TAHITI, etc.)
        specific_scheme = drom_com_territories.get_specific_identifier_scheme(partner.country_id.code)

        # Determine company scheme and ID
        if specific_scheme and partner.ref:
            # Use specific identifier for territories like NC (RIDET), PF (TAHITI), WF
            company_scheme = specific_scheme['qualifier']
            company_id = partner.ref
        elif partner.siret:
            # Standard French SIREN
            company_scheme = '0002'
            company_id = partner.siret[:9]
        elif partner.vat:
            # VAT scheme
            company_scheme = '0223'
            company_id = partner.vat
        else:
            company_scheme = False
            company_id = partner.ref or ''

        partner_vals = {
            'CompanyId': {
                '_text': company_id,
                'schemeId': company_scheme,
            }
        }
        if partner.vat:
            partner_vals['TaxRegistrationId'] = {
                '_text': partner.vat
                'qualifyingId': 'VAT',
            }
        if mapped_country_code:
            partner_vals['PostalAddress'] = {'CountryId': {
                '_text': mapped_country_code,
            }}

        invoice[tag] = partner_vals

    def _add_invoice_delivery_vals(self, invoice, move):
        if move.partner_shipping_id:
            location = {
                'LineOne': {'_text': move.partner_shipping_id.street},
                **({'LineTwo': {'_text': move.partner_shipping_id.street2}} if move.partner_shipping_id.street2 else {}),
                'CityName': {'_text': move.partner_shipping_id.city},
                'PostalZone': {'_text': move.partner_shipping_id.zip},
                **({'CountrySubentity': {'_text': move.partner_shipping_id.state_id}} if move.partner_shipping_id.state_id else {}),
                'CountryId': {'_text': move.partner_shipping_id.country_id.code},
            }
            errors = []
            for key, message in MOVE_ERRORS['delivery'].items():
                if not location[key]['_text']:
                    errors.append(_(message))
            invoice['Delivery'] = {
                'Date': {'_text': self._format_date(or move.invoice_date or move.date)},
                'Location':location,
            }
            return errors

    def _add_invoice_invoice_period(self, invoice, move, flow):
        invoice['InvoicePeriod'] = {
            'StartDate': {'_text': flow._format_date(flow.period_start or move.invoice_date or move.date)},
            'EndDate': {'_text': flow._format_date(flow.period_end or move.invoice_date_due or move.invoice_date or move.date)},
        }

    def _add_invoice_seller_tax_representative(self, invoice, move):
        # TODO: implement
        pass

    def _get_move_business_process_id(self, move):
        """Determine billing framework code (TT-28) from invoice"""
        product_lines = move.invoice_line_ids.filtered(lambda ln: ln.display_type == 'product')
        scopes = set(product_lines.tax_ids.mapped('tax_scope'))
        if 'service' in scopes:
            if 'consu' in scopes:
                prefix = 'M'
            else:
                prefix = 'S'
        else:
            prefix = 'B'

        if move._is_downpayment():
            if any(line.display_type == 'product' and not line.is_downpayment for line in move.invoice_line_ids):
                suffix = '4'
            else:
                suffix = '2' if move.payment_state in ('paid', 'reversed') else '1'
        else:
            suffix = '1'
        return f'{prefix}{suffix}'


    @api.model
    def _get_move_typecode(self, move):
        if move.journal_id.is_self_billing:
            return '389' if move.is_inbound() else '261'
        else:
            return '380' if move.is_inbound() else '381'

    @api.model
    def _get_payments(self, flow):
        return {
            'PaymentsReport': {
                **self._get_report_period(flow),
            }
        }

    @api.model
    def _get_report_period(self, flow):
        return {
            'ReportPeriod': {
                'StartDate': self._format_date(flow.period_start or flow.reporting_date),
                'EndDate': self._format_date(flow.period_end or flow.reporting_date),
            }
        }

    # @api.model
    # def _report_document(self, flow):
    #     flow._ensure_tracking_id()
    #     return {
    #         'ReportDocument': {
    #             'Id': {'_text': flow.tracking_id},
    #             'Name': 'Flux 10 Report 2025-09-01',
    #         }
    #     }
    def _format_date(self, date):
        # TODO: date can be falsy ? can be str ?
        """Format date as YYYYMMDD string."""
        if not date:
            return ''
        if isinstance(date, str):
            date = fields.Date.from_string(date)
        return date.strftime('%Y%m%d')

    def _is_g1.05_compliant(self, move_name):
        """Determine if move name is compliant with G1.05 requirements for invoice identifiers."""
