# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import http
from odoo.exceptions import UserError
from odoo.http import request
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)
_logger = logging.getLogger(__name__)


class PaymentPostProcessing(http.Controller):
    """
    This controller is responsible for the monitoring and finalization of the post-processing of
    transactions. TODO ANV update

    It exposes the route `/payment/status`: All payment flows must go through this route at some
    point to allow the user checking on the transactions' status, and to trigger the finalization of
    their post-processing.
    """

    MONITORED_TX_ID_KEY = "__payment_monitored_tx_id__"

    @http.route(
        "/payment/status",
        type="http",
        auth="public",
        website=True,
        sitemap=False,
        list_as_website_content=_lt("Payment Status"),
    )
    def display_status(self, **_kwargs):
        """Fetch the transaction and display it on the payment status page.

        :param dict _kwargs: Optional data. This parameter is not used here
        :return: The rendered status page
        :rtype: str
        """
        monitored_tx = self._get_monitored_transaction()
        # The session might have expired, or the transaction never existed.
        if monitored_tx:
            notification_channel = monitored_tx.generate_notification_channel()
            values = {"tx": monitored_tx, "notification_channel": notification_channel}
        else:
            values = {"payment_not_found": True}
        return request.render("payment.payment_status", values)

    @http.route("/payment/process", type="jsonrpc", auth="public")
    def payment_process(self):
        """Perform the processing of the current transaction.

        :rtype: None
        """
        print("Entering /payment/process")  # TODO ANV remove
        monitored_tx_sudo = self._get_monitored_transaction()
        if monitored_tx_sudo.payment_data_count == 0:  # The transaction has already been processed
            return

        processing_cron = self.env.ref("payment.process_payment_data_cron")
        try:
            processing_cron.sudo().method_direct_trigger()  # In sudo mode to run as the cron user
        except UserError:  # The cron is already running
            print("Skipped cron call since already running")  # TODO ANV remove
            pass  # Nothing to do; the tx will eventually be processed

    @http.route("/payment/post_process", type="jsonrpc", auth="public")
    def payment_post_process(self, **_kwargs):
        """Fetch the transaction and trigger its post-processing.

        :return: The post-processing values of the transaction.
        :rtype: dict
        """
        print("Entering /payment/post_process")  # TODO ANV remove
        # We only call the payment post processing on existing transactions.
        monitored_tx = self._get_monitored_transaction()

        # Post-process the transaction before redirecting the user to the landing route and its
        # document.
        if not monitored_tx.is_post_processed:
            try:
                monitored_tx._post_process()
            except Exception as e:
                _logger.exception(
                    "Encountered an error while post-processing transaction with id %s:\n%s",
                    monitored_tx.id,
                    e,  # noqa: TRY401
                )
                raise
        return {
            "state": monitored_tx.state,
            "landing_route": monitored_tx.landing_route,
            "state_message": monitored_tx.state_message,
        }

    @classmethod
    def monitor_transaction(cls, transaction):
        """Make the provided transaction id monitored.

        :param payment.transaction transaction: The transaction to monitor.
        :return: None
        """
        request.session[cls.MONITORED_TX_ID_KEY] = transaction.id

    def _get_monitored_transaction(self):
        """Retrieve the user's last transaction from the session (the transaction being monitored).

        :return: the user's last transaction
        :rtype: payment.transaction
        """
        return (
            request
            .env["payment.transaction"]
            .sudo()
            .browse(request.session.get(self.MONITORED_TX_ID_KEY))
            .exists()
        )
