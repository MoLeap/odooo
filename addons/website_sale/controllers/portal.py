# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.exceptions import AccessError, MissingError
from odoo.http import request, route

from odoo.addons.sale.controllers.portal import CustomerPortal as SaleCustomerPortal


class CustomerPortal(SaleCustomerPortal):
    @route()
    def portal_order_page(
        self,
        order_id,
        report_type=None,
        access_token=None,
        message=False,
        download=False,
        payment_amount=None,
        amount_selection=None,
        **kw,
    ):
        try:
            order_sudo = self._document_check_access(
                "sale.order", order_id, access_token=access_token
            )
        except (AccessError, MissingError):
            return request.redirect("/my")

        if order_sudo.website_id:
            # Force the website in the request to be the one linked on the SO
            request.website = order_sudo.website_id

        return super().portal_order_page(
            order_id=order_id,
            report_type=report_type,
            access_token=access_token,
            message=message,
            download=download,
            payment_amount=payment_amount,
            amount_selection=amount_selection,
            **kw,
        )
