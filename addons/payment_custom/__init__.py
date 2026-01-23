# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers, models
from odoo.addons.payment import reset_payment_provider, setup_provider


def post_init_hook(env):
    setup_provider(env, "custom", custom_mode="wire_transfer")
    env.ref("payment_custom.cron_auto_confirm_paid_wire_transfer_txs").active = True


def uninstall_hook(env):
    reset_payment_provider(env, "custom", custom_mode="wire_transfer")
