# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import api, fields, models
from odoo.fields import Domain

MAX_FAILURE_COUNT = 5  # The maximum number of processing attempts before giving up

_logger = logging.getLogger(__name__)


class PaymentData(models.Model):
    _name = "payment.data"
    _description = "Pending payment data payload to process"
    _order = "id"

    transaction_id = fields.Many2one(
        string="Transaction",
        comodel_name="payment.transaction",
        ondelete="restrict",
        required=True,
        index=True,
    )
    payload = fields.Json(string="Payload", required=True)
    failure_count = fields.Integer(string="Failure Count")

    @api.model
    def _cron_process(self):
        """Execute the processing of pending payment data.

        Payment data payloads are processed in insertion order to ensure older payments are handled
        first. After processing, the record is deleted. If processing fails, the record is retried
        on the next run. Records that have reached the maximum failure count are filtered out and
        left for manual intervention.

        :return: None
        """
        print("Starting processing cron; sleeping 10s")  # TODO ANV remove

        # Search for all pending payment data and initialize the remaining count
        pending_payment_data_domain = Domain("failure_count", "<", MAX_FAILURE_COUNT)
        pending_payment_data = self.env["payment.data"].search(pending_payment_data_domain)
        IrCron = self.env["ir.cron"]
        IrCron._commit_progress(remaining=len(pending_payment_data))

        import time  # TODO ANV remove
        time.sleep(10)

        for payment_data in pending_payment_data:
            # Lock the current record to prevent concurrent processing and restrict pre-fetching
            payment_data = payment_data.try_lock_for_update()
            if not payment_data:  # The lock could not be acquired
                continue  # Skip for now, will be retried on the next run

            # Process the payment data
            tx = payment_data.transaction_id
            try:
                tx._process(payment_data.payload)
            except Exception:
                self.env.cr.rollback()
                payment_data.failure_count += 1
                _logger.exception(
                    "Failed to process payment data %s for transaction %s (attempt %s/%s).",
                    payment_data.id,
                    tx.reference,
                    payment_data.failure_count,
                    MAX_FAILURE_COUNT,
                )
            else:
                payment_data.unlink()

            # Commit the progress and check if we should stop
            remaining_time = IrCron._commit_progress(processed=1)
            if not remaining_time:
                break

        # Update the remaining count with the number of pending payment data missed by the cron
        IrCron._commit_progress(
            remaining=self.env["payment.data"].search_count(pending_payment_data_domain)
        )

        # TODO ANV merge the post-processing within the processing instead
        # Trigger the post-processing cron to run ASAP after the processing
        # if pending_payment_data:
        #     self.env.ref("payment.cron_post_process_payment_tx")._trigger()
