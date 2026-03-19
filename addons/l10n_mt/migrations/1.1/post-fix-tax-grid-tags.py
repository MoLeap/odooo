import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def _replace_tag(line, old_tag, new_tag):
    new_tags = (line.tax_tag_ids - old_tag) | new_tag
    line.tax_tag_ids = [(6, 0, new_tags.ids)]
    return True


def migrate(cr, version):
    """Updates the tax grid in the journal items by assigning the correct tax tags for 7% and 5% Malta sales taxes."""
    env = api.Environment(cr, SUPERUSER_ID, {})

    tax_7 = env['account.tax']
    tax_5 = env['account.tax']

    companies = env['res.company'].search([('account_fiscal_country_id.code', '=', 'MT')])

    for company in companies:
        tax_7 |= env.ref(f'account.{company.id}_VAT_S_IN_MT_7_G', raise_if_not_found=False)
        tax_7 |= env.ref(f'account.{company.id}_VAT_S_IN_MT_7_S', raise_if_not_found=False)
        tax_5 |= env.ref(f'account.{company.id}_VAT_S_IN_MT_5_G', raise_if_not_found=False)
        tax_5 |= env.ref(f'account.{company.id}_VAT_S_IN_MT_5_S', raise_if_not_found=False)

    tag_iii_1_base = env['account.account.tag'].search([('name', '=', 'III.1_base'), ('country_id', '=', 'MT')], limit=1)
    tag_iii_1_tax = env['account.account.tag'].search([('name', '=', 'III.1_tax'), ('country_id', '=', 'MT')], limit=1)
    tag_iii_2_base = env['account.account.tag'].search([('name', '=', 'III.2_base'), ('country_id', '=', 'MT')], limit=1)
    tag_iii_2_tax = env['account.account.tag'].search([('name', '=', 'III.2_tax'), ('country_id', '=', 'MT')], limit=1)
    tag_iii_3_base = env['account.account.tag'].search([('name', '=', 'III.3_base'), ('country_id', '=', 'MT')], limit=1)
    tag_iii_3_tax = env['account.account.tag'].search([('name', '=', 'III.3_tax'), ('country_id', '=', 'MT')], limit=1)

    updated_7_base = 0
    updated_7_tax = 0
    updated_5_base = 0
    updated_5_tax = 0

    cr.execute("""
        SELECT DISTINCT aml.id
        FROM account_move_line aml LEFT JOIN account_move_line_account_tax_rel rel
            ON rel.account_move_line_id = aml.id
        WHERE aml.tax_line_id = ANY(%s) OR rel.account_tax_id = ANY(%s)
    """, [tax_7.ids, tax_7.ids])
    lines_7_ids = [row[0] for row in cr.fetchall()]
    lines_7 = env['account.move.line'].browse(lines_7_ids)

    cr.execute("""
        SELECT DISTINCT aml.id
        FROM account_move_line aml LEFT JOIN account_move_line_account_tax_rel rel
            ON rel.account_move_line_id = aml.id
        WHERE aml.tax_line_id = ANY(%s) OR rel.account_tax_id = ANY(%s)
    """, [tax_5.ids, tax_5.ids])
    lines_5_ids = [row[0] for row in cr.fetchall()]
    lines_5 = env['account.move.line'].browse(lines_5_ids)

    for line in lines_7.with_context(check_move_validity=False):
        if line.tax_line_id in tax_7:
            if _replace_tag(line, tag_iii_1_tax, tag_iii_2_tax):
                updated_7_tax += 1
        elif tax_7 & line.tax_ids:
            if _replace_tag(line, tag_iii_1_base, tag_iii_2_base):
                updated_7_base += 1

    for line in lines_5.with_context(check_move_validity=False):
        if line.tax_line_id in tax_5:
            if _replace_tag(line, tag_iii_1_tax, tag_iii_3_tax):
                updated_5_tax += 1
        elif tax_5 & line.tax_ids:
            if _replace_tag(line, tag_iii_1_base, tag_iii_3_base):
                updated_5_base += 1

    _logger.info('Updated Malta tax grids: 7%% base=%s, 7%% tax=%s, 5%% base=%s, 5%% tax=%s', updated_7_base, updated_7_tax, updated_5_base, updated_5_tax)
