# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.tools import format_amount

VARIABLE_SELECTION = [
    ("weight", "Weight"),
    ("volume", "Volume"),
    ("wv", "Weight * Volume"),
    ("price", "Price"),
    ("quantity", "Quantity"),
]


class DeliveryPriceRule(models.Model):
    _name = "delivery.price.rule"
    _description = "Delivery Price Rules"
    _order = "sequence, list_price, id"

    @api.depends(
        "variable",
        "operator",
        "max_value",
        "list_base_price",
        "list_price",
        "variable_factor",
        "currency_id",
    )
    def _compute_name(self):
        for rule in self:
            name = "if %s %s %.02f %s then" % (
                rule.variable,
                rule.operator,
                rule.max_value,
                rule.max_value_uom_name,
            )
            if rule.currency_id:
                base_price = format_amount(self.env, rule.list_base_price, rule.currency_id)
                price = format_amount(self.env, rule.list_price, rule.currency_id)
            else:
                base_price = "%.2f" % rule.list_base_price
                price = "%.2f" % rule.list_price
            if rule.list_base_price and not rule.list_price:
                name = "%s fixed price %s" % (name, base_price)
            elif rule.list_price and not rule.list_base_price:
                name = "%s %s times %s" % (name, price, rule.variable_factor)
            else:
                name = "%s fixed price %s plus %s times %s" % (
                    name,
                    base_price,
                    price,
                    rule.variable_factor,
                )
            rule.name = name

    @api.depends(
        "variable", "carrier_id.weight_uom_name", "carrier_id.volume_uom_name", "currency_id"
    )
    def _compute_max_value_uom_name(self):
        for rule in self:
            if rule.variable == "weight":
                rule.max_value_uom_name = rule.carrier_id.weight_uom_name
            elif rule.variable == "volume":
                rule.max_value_uom_name = rule.carrier_id.volume_uom_name
            elif rule.variable == "wv":
                rule.max_value_uom_name = "%s * %s" % (
                    rule.carrier_id.weight_uom_name,
                    rule.carrier_id.volume_uom_name,
                )
            elif rule.variable == "price":
                rule.max_value_uom_name = rule.currency_id.symbol or rule.currency_id.name or ""
            else:
                rule.max_value_uom_name = "Units"

    name = fields.Char(compute="_compute_name")
    sequence = fields.Integer(required=True, default=10)
    carrier_id = fields.Many2one(
        comodel_name="delivery.carrier", ondelete="cascade", required=True, index=True
    )
    currency_id = fields.Many2one(related="carrier_id.currency_id")

    variable = fields.Selection(selection=VARIABLE_SELECTION, default="quantity", required=True)
    operator = fields.Selection(
        selection=[("==", "="), ("<=", "<="), ("<", "<"), (">=", ">="), (">", ">")],
        default="<=",
        required=True,
    )
    max_value = fields.Float(string="Maximum Value", required=True)
    max_value_uom_name = fields.Char(compute="_compute_max_value_uom_name", store=False)
    list_base_price = fields.Float(
        string="Sale Base Price", min_display_digits="Product Price", default=0.0, required=True
    )
    list_price = fields.Float(
        string="Sale Price", min_display_digits="Product Price", default=0.0, required=True
    )
    variable_factor = fields.Selection(
        selection=VARIABLE_SELECTION, default="weight", required=True
    )
