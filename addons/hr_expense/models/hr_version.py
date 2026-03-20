from odoo import models, fields


class HrVersion(models.Model):
    _inherit = 'hr.version'

    company_country_id = fields.Many2one(related='company_id.account_fiscal_country_id')
