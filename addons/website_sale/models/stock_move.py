# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import models

_logger = logging.getLogger(__name__)


class StockMove(models.Model):
    _inherit = "stock.move"

    def _action_done(self, cancel_backorder=False):
        """Override to trigger auto-publish check after stock moves are confirmed.

        Skipped when called from _apply_inventory (which sets ignore_dest_packages=True),
        because StockQuant._apply_inventory handles that path after all quants are committed.
        """
        # Capture templates before super() — _action_done returns backorder moves, not done moves.
        templates = self.product_id.product_tmpl_id
        res = super()._action_done(cancel_backorder=cancel_backorder)
        if not self.env.context.get("ignore_dest_packages") and templates:
            try:
                templates._sync_website_published_state()
            except Exception:
                _logger.exception("Error during auto-publish check after stock move confirmation")
        return res
