from odoo.fields import Command
from odoo.tests import tagged

from odoo.addons.crm.tests.common import TestCrmCommon


@tagged('at_install', '-post_install')
class TestCrmSaleOrderProject(TestCrmCommon):

    def test_sale_order_project_opportunity_link(self):
        action = self.lead_1.action_create_project()
        projects = self.env['project.project'].with_context(action['context']).create([
            {'name': 'Project 1'},
            {'name': 'Project 2'},
        ])
        product = self.env['product.product'].create({
            'name': 'Test Rental Product',
            'type': 'consu',
            'list_price': 15,
        })
        partner = self.env['res.partner'].create({'name': 'test partner'})
        self.lead_1.partner_id = partner
        sale_order_action = self.lead_1.action_sale_quotations_new()
        sale_order = self.env['sale.order'].with_context(sale_order_action['context']).create({
            'partner_id': partner.id,
            'order_line': [
                Command.create({
                    'product_id': product.id,
                    'product_uom_qty': 1,
                }),
            ],
        })
        self.assertEqual(sale_order.project_id, projects[1], "Sale Order should be linked to recent project.")
        self.assertEqual(sale_order.project_id.reinvoiced_sale_order_id, sale_order, "Project should be linked to recent sale order.")
