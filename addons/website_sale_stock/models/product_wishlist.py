# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ProductWishlist(models.Model):
    _inherit = "product.wishlist"

    stock_notification = fields.Boolean(
        compute="_compute_stock_notification", default=False, required=True
    )

    @api.depends("product_id", "partner_id")
    def _compute_stock_notification(self):
        for record in self:
            record.stock_notification = record.product_id._has_stock_notification(record.partner_id)

    def _inverse_stock_notification(self):
        website = self.env["website"].get_current_website()
        for record in self:
            if record.stock_notification and record.partner_id.email:
                record.product_id.sudo()._add_stock_notification(
                    partner=record.partner_id, website=website
                )
