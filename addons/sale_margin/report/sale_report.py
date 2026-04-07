# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class SaleReport(models.Model):
    _inherit = "sale.report"

    margin = fields.Float("Margin", readonly=True)
    margin_percent = fields.Float("Margin (%)", aggregator=None, readonly=True)
    purchase_price = fields.Float(string="Expected Cost", readonly=True)

    def _select_additional_fields(self):
        res = super()._select_additional_fields()
        res["margin"] = "SUM(l.margin)"
        res["margin_percent"] = "MAX(l.margin_percent)"
        res["purchase_price"] = "CASE WHEN l.product_id IS NOT NULL THEN SUM(l.purchase_price * l.product_uom_qty) ELSE 0 END"
        return res
