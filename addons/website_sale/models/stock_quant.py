# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class StockQuant(models.Model):
    _inherit = "stock.quant"

    def _apply_inventory(self, date=None):
        """Override to trigger OOS publish sync after manual inventory adjustments.

        Template IDs are captured before the super() call because _apply_inventory
        clears inventory_quantity on the quants as part of its work.
        """
        template_ids = self.mapped("product_id.product_tmpl_id").ids
        res = super()._apply_inventory(date=date)
        # Flush quant writes so the new quantities are visible to the sync.
        self.env["stock.quant"].flush_model()
        self._trigger_website_published_sync(template_ids)
        return res

    def _trigger_website_published_sync(self, template_ids=None):
        """Collect affected product templates and call the publish-state sync.

        :param template_ids: optional list of product.template IDs to sync; when
            omitted the IDs are derived from self.
        """
        if template_ids is None:
            templates = self.mapped("product_id.product_tmpl_id")
        else:
            templates = self.env["product.template"].browse(template_ids)
        if templates:
            templates._sync_website_published_state()
