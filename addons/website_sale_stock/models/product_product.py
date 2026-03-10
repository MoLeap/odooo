# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class ProductProduct(models.Model):
    _inherit = "product.product"

    stock_notification_ids = fields.One2many(
        "product.stock.notification", "product_id", string="Back in stock Notifications"
    )

    def _has_stock_notification(self, partner, website=None):
        self.ensure_one()
        website = website or self.env["website"].get_current_website()
        return bool(
            self
            .env["product.stock.notification"]
            .sudo()
            .search_count([
                ("product_id", "=", self.id),
                ("partner_id", "=", partner.id),
                ("website_id", "=", website.id),
            ])
        )

    def _add_stock_notification(self, partner, website=None):
        self.ensure_one()
        website = website or self.env["website"].get_current_website()
        self.env["product.stock.notification"].sudo().create({
            "product_id": self.id,
            "partner_id": partner.id,
            "website_id": website.id,
        })

    def _get_qty_on_hand_for_website_company(self, website):
        self.ensure_one()
        company = website.company_id
        return (
            self.with_company(company).with_context(allowed_company_ids=[company.id]).qty_available
        )

    def _get_max_quantity(self, website, sale_order, **kwargs):
        """Return The max quantity of a product.
        It is the difference between the quantity that's free to use and the quantity that's already
        been added to the cart.

        Note: self.ensure_one()

        :param website website: The website for which to compute the max quantity.
        :return: The max quantity of the product.
        :rtype: float | None
        """
        self.ensure_one()
        if self.is_storable and not self.allow_out_of_stock_order:
            free_qty = website._get_product_available_qty(self.sudo(), **kwargs)
            cart_qty = sale_order._get_cart_qty(self.id)
            return free_qty - cart_qty
        return None

    def _is_sold_out(self, website=None):
        """Return whether the product is sold out (no available quantity).

        If a product inventory is not tracked, or if it's allowed to be sold regardless
        of availabilities, the product is never considered sold out.

        :return: whether the product can still be sold
        :rtype: bool
        """
        self.ensure_one()
        if not self.is_storable or self.allow_out_of_stock_order:
            return False
        website = website or self.env["website"].get_current_website()
        free_qty = website._get_product_available_qty(self.sudo())
        return free_qty <= 0

    def _website_show_quick_add(self):
        return not self._is_sold_out() and super()._website_show_quick_add()

    def _send_availability_email(self):
        notifications = self.env["product.stock.notification"].sudo().search([])
        self.env["ir.cron"]._commit_progress(remaining=len(notifications))

        for notification in notifications:
            product = notification.product_id
            website = notification.website_id
            qty_on_hand = product._get_qty_on_hand_for_website_company(website)
            if qty_on_hand <= 0:
                self.env["ir.cron"]._commit_progress(1)
                continue

            partner = notification.partner_id
            if not partner.email_formatted:
                self.env["ir.cron"]._commit_progress(1)
                continue
            lang = partner.lang or self.env.lang
            self_ctxt = self.with_context(lang=lang, website_id=website.id).with_user(
                website.salesperson_id
            )
            product_ctxt = product.with_context(lang=lang, website_id=website.id)
            body_html = self_ctxt.env["mail.render.mixin"]._render_template(
                "website_sale_stock.availability_email_body",
                "res.partner",
                partner.ids,
                engine="qweb_view",
                add_context={"product": product_ctxt, "website": website},
                options={"post_process": True},
            )[partner.id]
            full_mail = product_ctxt.env["mail.render.mixin"]._render_encapsulate(
                "mail.mail_notification_light",
                body_html,
                add_context={
                    "company": website.company_id,
                    "model_description": self_ctxt.env._("Product"),
                },
                context_record=product_ctxt,
            )
            mail_values = {
                "subject": self_ctxt.env._(
                    "%(product_name)s is back in stock", product_name=product_ctxt.name
                ),
                "email_from": (
                    website.company_id.partner_id.email_formatted
                    or self_ctxt.env.user.email_formatted
                ),
                "email_to": partner.email_formatted,
                "body_html": full_mail,
            }
            mail = self_ctxt.env["mail.mail"].sudo().create(mail_values)
            mail.send(raise_exception=False)

            notification.unlink()
            self.env["ir.cron"]._commit_progress(1)

    def _to_markup_data(self, website):
        """Override of `website_sale` to include the product availability in the offer."""
        markup_data = super()._to_markup_data(website)
        if self.is_product_variant and self.is_storable:
            if not self._is_sold_out():
                availability = "https://schema.org/InStock"
            else:
                availability = "https://schema.org/OutOfStock"
            markup_data["offers"]["availability"] = availability
        return markup_data
