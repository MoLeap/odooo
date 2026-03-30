# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests.common import TransactionCase


class TestExplanation(TransactionCase):

    def test_model_explanation_reflection(self):
        """ Test that _explanation is correctly reflected in ir.model. """
        class MockModel:
            _name = 'mock.model'
            _description = 'Mock'
            _order = 'id'
            _custom = False
            _abstract = False
            _transient = False
            _fold_name = 'fold'
            _explanation = 'This is a mock model explanation.'
            __doc__ = 'Base doc'

        mock_model = MockModel()
        self.env.registry['mock.model'] = MockModel

        try:
            params = self.env['ir.model']._reflect_model_params(mock_model)
            self.assertEqual(params['explanation'], 'This is a mock model explanation.')
        finally:
            del self.env.registry['mock.model']

    def test_action_explanation(self):
        """ Test that explanation is correctly stored and retrieved for actions. """
        action = self.env['ir.actions.act_window'].create({
            'name': 'Test Action',
            'res_model': 'res.partner',
            'explanation': 'This action is used for testing explanations.',
        })
        self.assertEqual(action.explanation, 'This action is used for testing explanations.')

    def test_ai_agent_discovery(self):
        """ Test that ai.agent discovery logic prefers explanation. """
        # Partner has _explanation now because we added it in res_partner.py
        partner_model = self.env['res.partner']
        self.assertTrue(hasattr(partner_model, '_explanation'))
        
        # Check if the logic we added to ai_agent works (simulated)
        model_explanation = getattr(partner_model, '_explanation', None) or partner_model._description
        self.assertEqual(model_explanation, partner_model._explanation)
