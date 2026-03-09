from odoo import fields, models


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    cashmatic_ip = fields.Char('Cash Machine IP')
    cashmatic_username = fields.Char('Cash Machine Username')
    cashmatic_password = fields.Char('Cash Machine Password')
    cashmatic_use_lna = fields.Boolean('Use Local Network Access')

    def _get_payment_method_type(self):
        return super()._get_payment_method_type() + [('cashmatic', 'Cash Machine (cashmatic)')]

    def _load_pos_data_fields(self, config_id):
        return super()._load_pos_data_fields(config_id) + ['cashmatic_ip', 'cashmatic_username', 'cashmatic_password', 'cashmatic_use_lna']
