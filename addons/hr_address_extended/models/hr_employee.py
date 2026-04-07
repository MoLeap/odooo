# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    @api.onchange('private_zip', 'private_country_id')
    def _onchange_private_zip(self):
        for employee in self:
            employee.version_id._onchange_private_zip()
