# Part of Odoo. See LICENSE file for full copyright and licensing details.

from unittest.mock import patch

from odoo.tests import tagged

from odoo.addons.base.tests.common import BaseCommon


@tagged("post_install", "-at_install")
class TestUnpublishOOS(BaseCommon):
    """Model-level tests for the 'Unpublish out-of-stock products' feature.

    All tests operate at model level only (no HTTP). Stock is manipulated via
    StockQuant._update_available_quantity so free_qty / qty_available are
    immediately correct within the same transaction.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env["res.company"].create({"name": "OOS Test Company"})
        cls.warehouse = cls.env["stock.warehouse"].search(
            [("company_id", "=", cls.company.id)], limit=1
        )
        if not cls.warehouse:
            cls.warehouse = cls.env["stock.warehouse"].create({
                "name": "OOS Test WH",
                "code": "OOSW",
                "company_id": cls.company.id,
            })

        cls.website = cls.env["website"].create({
            "name": "OOS Test Website",
            "company_id": cls.company.id,
            "website_sale_unpublish_out_of_stock": True,
        })
        cls.stock_location = cls.warehouse.lot_stock_id

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _create_storable(self, name, website=None, published=True):
        """Create a storable product template.

        :param str name: product name
        :param website: website record or None (all websites)
        :param bool published: initial published state
        :return: product.template record
        """
        return self.env["product.template"].create({
            "name": name,
            "type": "consu",
            "is_storable": True,
            "is_published": published,
            "website_id": website.id if website else False,
            "company_id": self.company.id,
        })

    def _set_qty(self, variant, qty):
        """Set on-hand quantity for a product.product variant.

        Zeroes any existing stock first, then adds the desired quantity.
        Flushes + invalidates the ORM cache afterwards.

        :param variant: product.product record
        :param float qty: desired absolute on-hand quantity
        """
        SQ = self.env["stock.quant"]
        existing = SQ.search([
            ("product_id", "=", variant.id),
            ("location_id", "=", self.stock_location.id),
        ])
        if existing:
            current = sum(existing.mapped("quantity"))
            if current:
                SQ._update_available_quantity(variant, self.stock_location, -current)
        if qty:
            SQ._update_available_quantity(variant, self.stock_location, qty)
        self.env.flush_all()
        self.env.invalidate_all()

    def _add_variant_attr(self, tmpl, attr_name, values):
        """Add an attribute line to tmpl, returning the created variants.

        :param tmpl: product.template record
        :param str attr_name: attribute name to create
        :param list[str] values: list of value names
        :return: product.product recordset of all variants after the addition
        """
        attr = self.env["product.attribute"].create({"name": attr_name})
        vals = self.env["product.attribute.value"].create([
            {"name": v, "attribute_id": attr.id} for v in values
        ])
        self.env["product.template.attribute.line"].create({
            "product_tmpl_id": tmpl.id,
            "attribute_id": attr.id,
            "value_ids": [(6, 0, vals.ids)],
        })
        return tmpl.product_variant_ids

    # ------------------------------------------------------------------
    # Tests
    # ------------------------------------------------------------------

    def test_single_variant_goes_oos_unpublishes(self):
        """A published product is auto-unpublished when its only variant hits 0 stock."""
        tmpl = self._create_storable("Single OOS", website=self.website)
        self._set_qty(tmpl.product_variant_id, 10)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published, "Product with stock should stay published.")

        self._set_qty(tmpl.product_variant_id, 0)
        tmpl._sync_website_published_state()
        self.assertFalse(tmpl.is_published, "OOS product should be auto-unpublished.")
        self.assertTrue(
            tmpl.website_sale_auto_unpublished,
            "website_sale_auto_unpublished must be set after auto-unpublish.",
        )

    def test_single_variant_back_in_stock_republishes(self):
        """An auto-unpublished product is republished when stock is restored."""
        tmpl = self._create_storable("Restock", website=self.website)
        self._set_qty(tmpl.product_variant_id, 0)
        tmpl._sync_website_published_state()
        self.assertFalse(tmpl.is_published)
        self.assertTrue(tmpl.website_sale_auto_unpublished)

        self._set_qty(tmpl.product_variant_id, 5)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published, "Restocked product should be republished.")
        self.assertFalse(tmpl.website_sale_auto_unpublished)

    def test_manual_republish_while_oos_is_respected(self):
        """A merchant-republished product stays published even when stock remains at 0."""
        tmpl = self._create_storable("Manual Republish", website=self.website)
        self._set_qty(tmpl.product_variant_id, 0)
        tmpl._sync_website_published_state()
        self.assertFalse(tmpl.is_published)

        # Merchant manually republishes while still OOS.
        tmpl.write({"is_published": True})
        self.assertTrue(tmpl.website_sale_manual_published)
        self.assertFalse(tmpl.website_sale_auto_unpublished)

        # Sync must NOT unpublish again.
        tmpl._sync_website_published_state()
        self.assertTrue(
            tmpl.is_published, "Manually republished product must not be auto-unpublished."
        )

    def test_manual_unpublish_while_in_stock_not_overridden(self):
        """A merchant-unpublished product stays unpublished even when it has stock."""
        tmpl = self._create_storable("Manual Unpublish", website=self.website)
        self._set_qty(tmpl.product_variant_id, 10)

        # Merchant explicitly unpublishes.
        tmpl.write({"is_published": False})
        self.assertFalse(tmpl.website_sale_manual_published)
        self.assertFalse(tmpl.website_sale_auto_unpublished)

        # Sync must NOT republish.
        tmpl._sync_website_published_state()
        self.assertFalse(
            tmpl.is_published, "Manually unpublished product must not be auto-republished."
        )

    def test_multi_variant_one_in_stock_stays_published(self):
        """Product stays published as long as at least one variant has stock."""
        tmpl = self._create_storable("Multi Partial", website=self.website)
        variants = self._add_variant_attr(tmpl, "Color", ["Red", "Blue"])
        self.assertEqual(len(variants), 2)

        self._set_qty(variants[0], 0)
        self._set_qty(variants[1], 5)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published, "Product with one variant in stock must stay published.")

    def test_multi_variant_all_oos_unpublishes(self):
        """Product is unpublished when all variants are OOS."""
        tmpl = self._create_storable("Multi All OOS", website=self.website)
        variants = self._add_variant_attr(tmpl, "Size", ["S", "M"])
        self.assertEqual(len(variants), 2)

        self._set_qty(variants[0], 0)
        self._set_qty(variants[1], 0)
        tmpl._sync_website_published_state()
        self.assertFalse(tmpl.is_published, "All-OOS product must be unpublished.")

    def test_multi_variant_one_restocked_republishes(self):
        """After all-OOS auto-unpublish, restocking one variant republishes the product."""
        tmpl = self._create_storable("Multi Restock", website=self.website)
        variants = self._add_variant_attr(tmpl, "Weight", ["1kg", "2kg"])
        self.assertEqual(len(variants), 2)

        self._set_qty(variants[0], 0)
        self._set_qty(variants[1], 0)
        tmpl._sync_website_published_state()
        self.assertFalse(tmpl.is_published)
        self.assertTrue(tmpl.website_sale_auto_unpublished)

        self._set_qty(variants[0], 3)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published, "Restocking one variant must republish.")
        self.assertFalse(tmpl.website_sale_auto_unpublished)

    def test_setting_disabled_no_auto_unpublish(self):
        """When website_sale_unpublish_out_of_stock is False no publish state change occurs."""
        website_off = self.env["website"].create({
            "name": "OOS Off Website",
            "company_id": self.company.id,
            "website_sale_unpublish_out_of_stock": False,
        })
        tmpl = self._create_storable("Setting Off", website=website_off)
        self._set_qty(tmpl.product_variant_id, 0)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published, "OOS setting disabled → product must stay published.")

    def test_multi_website_only_affects_enabled_website(self):
        """OOS sync on Website A must not affect products assigned to Website B."""
        website_b = self.env["website"].create({
            "name": "Website B",
            "company_id": self.company.id,
            "website_sale_unpublish_out_of_stock": False,
        })
        tmpl_a = self._create_storable("WA Product", website=self.website)
        tmpl_b = self._create_storable("WB Product", website=website_b)

        self._set_qty(tmpl_a.product_variant_id, 0)
        self._set_qty(tmpl_b.product_variant_id, 0)

        tmpl_a._sync_website_published_state()
        tmpl_b._sync_website_published_state()

        self.assertFalse(tmpl_a.is_published, "WA product (OOS ON) must be unpublished.")
        self.assertTrue(tmpl_b.is_published, "WB product (OOS OFF) must stay published.")

    def test_product_on_all_websites_uses_enabled_websites(self):
        """A product with no website_id is unpublished when an enabled website detects OOS."""
        tmpl = self._create_storable("All Websites", website=None)
        self._set_qty(tmpl.product_variant_id, 0)
        tmpl._sync_website_published_state()
        self.assertFalse(
            tmpl.is_published,
            "All-websites product must be unpublished when an enabled website is OOS.",
        )

    def test_no_recursive_write_on_sync(self):
        """The website_sale_syncing_published context guard must prevent recursion."""
        tmpl = self._create_storable("Recursion Guard", website=self.website)
        self._set_qty(tmpl.product_variant_id, 0)

        write_calls = []
        original_write = type(tmpl).write

        def counting_write(self_inner, vals):
            write_calls.append(vals)
            return original_write(self_inner, vals)

        with patch.object(type(tmpl), "write", counting_write):
            tmpl._sync_website_published_state()

        # Only 1 write call (the auto-unpublish) — no recursive second call.
        self.assertLessEqual(
            len(write_calls),
            1,
            "write() must be called at most once per sync cycle (no recursion).",
        )

    def test_stock_move_triggers_sync(self):
        """Validating a stock move that zeroes inventory must auto-unpublish the product."""
        tmpl = self._create_storable("Move Trigger", website=self.website)
        variant = tmpl.product_variant_id
        self._set_qty(variant, 5)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published)

        customer_loc = self.env.ref("stock.stock_location_customers")
        move = self.env["stock.move"].create({
            "product_id": variant.id,
            "product_uom_qty": 5,
            "uom_id": variant.uom_id.id,
            "location_id": self.stock_location.id,
            "location_dest_id": customer_loc.id,
            "picking_type_id": self.warehouse.out_type_id.id,
            "company_id": self.company.id,
        })
        move._action_confirm()
        move.quantity = 5
        move.picked = True
        move._action_done()

        self.env.flush_all()
        self.env.invalidate_all()
        tmpl.invalidate_recordset(["is_published"])
        self.assertFalse(
            tmpl.is_published, "Outbound move to zero stock must trigger auto-unpublish."
        )

    def test_inventory_adjustment_triggers_sync(self):
        """Using _apply_inventory to zero stock must auto-unpublish the product."""
        tmpl = self._create_storable("Inventory Adj Trigger", website=self.website)
        variant = tmpl.product_variant_id
        self._set_qty(variant, 10)
        tmpl._sync_website_published_state()
        self.assertTrue(tmpl.is_published)

        quant = self.env["stock.quant"].search(
            [("product_id", "=", variant.id), ("location_id", "=", self.stock_location.id)], limit=1
        )
        self.assertTrue(quant, "Expected a quant after setting qty.")
        quant.inventory_quantity = 0
        quant.inventory_quantity_set = True
        quant._apply_inventory()

        self.env.flush_all()
        self.env.invalidate_all()
        tmpl.invalidate_recordset(["is_published"])
        self.assertFalse(
            tmpl.is_published, "_apply_inventory zeroing stock must trigger auto-unpublish."
        )

    def test_enabling_setting_retroactively_unpublishes_oos(self):
        """Enabling the OOS setting must immediately unpublish existing out-of-stock products."""
        website_new = self.env["website"].create({
            "name": "Retro Website",
            "company_id": self.company.id,
            "website_sale_unpublish_out_of_stock": False,
        })
        tmpl = self._create_storable("Retroactive OOS", website=website_new)
        self._set_qty(tmpl.product_variant_id, 0)
        # Feature is off, product is still published.
        self.assertTrue(tmpl.is_published)

        website_new.write({"website_sale_unpublish_out_of_stock": True})
        self.env.flush_all()
        self.env.invalidate_all()
        tmpl.invalidate_recordset(["is_published"])
        self.assertFalse(
            tmpl.is_published,
            "Enabling OOS setting must immediately unpublish existing OOS products.",
        )
