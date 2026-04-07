from unittest.mock import patch

from odoo.tests import TransactionCase


class TestWebsiteMixin(TransactionCase):
    def setUpCase(cls):
        super().setUpCase()

        cls.website_1 = cls.env.ref('website.default_website')

    def test_create_website_published(self):
        """Ensure that creating a record with website_published set does not overwrite website_published."""
        og_write = self.registry['test.model.multi.website'].write

        def mock_write(records, vals):
            # read website_published, this should not cause any issue
            records.website_published
            og_write(records, vals)

        with patch('odoo.addons.test_website.models.model.TestModelMultiWebsite.write', new=mock_write):
            new_record = self.env['test.model.multi.website'].create({
                'name': 'Test Website Redirect',
                'website_published': True,
            })
        self.assertEqual(new_record.website_published, True)
        self.assertEqual(new_record.is_published, True)
