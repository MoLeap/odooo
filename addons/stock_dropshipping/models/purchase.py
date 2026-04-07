# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from collections import defaultdict

from odoo import api, models, fields


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    dropship_picking_count = fields.Integer("Dropship Count", compute='_compute_incoming_picking_count')

    @api.depends('picking_ids.is_dropship')
    def _compute_incoming_picking_count(self):
        super()._compute_incoming_picking_count()
        for order in self:
            dropship_count = len(order.picking_ids.filtered(lambda p: p.is_dropship))
            order.incoming_picking_count -= dropship_count
            order.dropship_picking_count = dropship_count

    def action_view_picking(self):
        return self._get_action_view_picking(self.picking_ids.filtered(lambda p: not p.is_dropship))

    def action_view_dropship(self):
        return self._get_action_view_picking(self.picking_ids.filtered(lambda p: p.is_dropship))

    def _prepare_group_vals(self):
        res = super()._prepare_group_vals()
        sale_orders = self.order_line.sale_order_id
        if len(sale_orders) == 1:
            res['sale_id'] = sale_orders.id
        return res

    def _create_picking(self):
        res = super()._create_picking()
        for picking in self.picking_ids.filtered(
            lambda p: p.is_dropship and p.state not in ('done', 'cancel')
        ):
            moves_by_so = defaultdict(lambda: self.env['stock.move'])
            for move in picking.move_ids:
                if move.sale_line_id.order_id:
                    moves_by_so[move.sale_line_id.order_id] |= move
            if len(moves_by_so) <= 1:
                continue
            for so, so_moves in list(moves_by_so.items())[1:]:
                new_picking = picking.copy({'move_ids': [], 'move_line_ids': []})
                so_moves.write({'picking_id': new_picking.id, 'group_id': so.procurement_group_id.id})
                so_moves.move_line_ids.write({'picking_id': new_picking.id})
        return res
