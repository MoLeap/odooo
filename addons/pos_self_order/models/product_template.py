# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    def _load_pos_self_data_search_read(self, data, config):
        result = super()._load_pos_self_data_search_read(data, config)
        # Also load delivery products referenced by active presets (may be archived)
        preset_data = data.get('pos.preset', [])
        delivery_product_ids = [
            p['delivery_product_id']
            for p in preset_data
            if p.get('delivery_product_id')
        ]
        if delivery_product_ids:
            existing_ids = {r['id'] for r in result}
            missing_ids = [pid for pid in delivery_product_ids if pid not in existing_ids]
            if missing_ids:
                additional_records = self.with_context(active_test=False).browse(missing_ids)
                fields = list(set(self._load_pos_self_data_fields(config)))
                extra_data = additional_records.read(fields, load=False)
                self._process_pos_self_ui_products(extra_data)
                result.extend(extra_data)
        return result
