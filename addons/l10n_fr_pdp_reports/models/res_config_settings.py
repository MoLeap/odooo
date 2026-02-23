from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    l10n_fr_pdp_reports_enabled = fields.Boolean(
        related='company_id.l10n_fr_pdp_reports_enabled',
        string="Enable PDP E-reporting",
        help="Activate Flux 10 e-reporting generation for this company.",
        readonly=False,
    )
