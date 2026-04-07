from odoo import api, SUPERUSER_ID
from psycopg2.extras import execute_values

# (rec_name, rec_active, rec_amount, rec_sequence)
TAX_VALUES_MAPPING = [
    (
        '_sa_ph_pe_hs_tax_15',
        False,
        0,
        None,
    ),
    (
        '_sa_local_sales_tax_0',
        False,
        None,
        17,
    ),
    (
        '_sa_qualifying_transport_tax_0',
        False,
        None,
        None,
    ),
    (
        '_sa_international_transport_goods_tax_0',
        False,
        None,
        None,
    ),

]


def migrate(cr, version):
    execute_values(
        cr, """
        WITH data(rec_name, rec_active, rec_amount, rec_sequence) AS (
            VALUES %s
        )
        UPDATE account_tax AS t
        SET
            active = data.rec_active,
            amount = COALESCE(data.rec_amount::numeric, t.amount),
            sequence =  COALESCE(data.rec_sequence::integer, t.sequence)
        FROM ir_model_data AS imd
        JOIN data ON imd.name ~ data.rec_name
        WHERE imd.model = 'account.tax'
        AND imd.res_id = t.id;
        """, TAX_VALUES_MAPPING,
    )

    cr.execute(
        """
        DELETE FROM account_account_tag_account_tax_repartition_line_rel rel
        WHERE rel.account_tax_repartition_line_id IN (
            SELECT rl.id
            FROM account_tax_repartition_line rl
            WHERE rl.tax_id = (
            SELECT res_id
            FROM ir_model_data
            WHERE model = 'account.tax'
            AND name ~ '_sa_local_sales_tax_0'
            LIMIT 1)
        AND rel.account_account_tag_id = (
            SELECT id
            FROM account_account_tag
            WHERE applicability = 'taxes'
            AND name ->> 'en_US' = '3(B)')
        );
        """,
    )

    env = api.Environment(cr, SUPERUSER_ID, {})
    for company in env['res.company'].search([('chart_template', '=', 'sa')], order="parent_path"):
        env['account.chart.template'].try_loading('sa', company)
