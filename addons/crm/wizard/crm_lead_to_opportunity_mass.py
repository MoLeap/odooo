# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class CrmLead2opportunityPartnerMass(models.TransientModel):
    _name = 'crm.lead2opportunity.partner.mass'
    _description = 'Convert Lead to Opportunity (in mass)'

    allowed_options = fields.Json(compute="_compute_allowed_options")
    # All the found duplicates - displayed when using deduplicate
    duplicated_lead_ids = fields.Many2many(
        'crm.lead', context={'active_test': False}, compute='_compute_duplicated_lead_ids',
        store=True, compute_sudo=False, readonly=False)
    duplicated_leads_message = fields.Char('Leads With Duplicates Message', compute='_compute_duplicate_leads_message')
    # Matching opportunities, displayed when using convert_and_merge
    duplicated_opportunity_ids = fields.Many2many(
        'crm.lead', 'lead2opp_mass_duplicate_opportunities_rel', 'wizard_id', 'lead_id',
        context={'active_test': False}, compute='_compute_duplicated_lead_ids',
        store=True, compute_sudo=False, readonly=False)
    force_assignment = fields.Boolean('Even if assigned')
    lead_tomerge_ids = fields.Many2many(
        'crm.lead', 'crm_convert_lead_mass_lead_rel',
        string='Active Leads', context={'active_test': False},
        default=lambda self: self.env.context.get('active_ids', [])
    )
    link_to_matching_customer = fields.Boolean(string="Link to matching customers",
        help="Link these opportunities to customers by either finding a match or creating a new one.")
    name = fields.Selection([
        ('convert', 'Convert to Opportunities'),
        ('convert_and_merge', 'Convert & Merge with Opportunities'),
        ('deduplicate', 'Deduplicate leads')
    ], 'Conversion Action', default='convert', readonly=False, required=True)
    team_id = fields.Many2one('crm.team', 'Sales Team', compute='_compute_team_id',
        readonly=False, store=True, compute_sudo=False)
    user_ids = fields.Many2many('res.users', string='Salespersons')

    @api.depends('duplicated_lead_ids', 'duplicated_opportunity_ids')
    def _compute_allowed_options(self):
        allowed = ['convert']
        if self.duplicated_opportunity_ids:
            allowed.append('convert_and_merge')
        if self.duplicated_lead_ids:
            allowed.append('deduplicate')
        self.allowed_options = allowed

    @api.depends('lead_tomerge_ids')
    def _compute_duplicated_lead_ids(self):
        for convert in self:
            all_duplicates = self.env['crm.lead']
            for lead in convert.lead_tomerge_ids:
                duplicate_leads = self.env['crm.lead']._get_lead_duplicates(
                    partners=lead.partner_id,
                    email_list=[lead.partner_id and lead.partner_id.email or lead.email_from],
                    include_lost=False)
                if len(duplicate_leads) > 1:
                    all_duplicates |= duplicate_leads

            convert.duplicated_lead_ids = all_duplicates.ids
            convert.duplicated_opportunity_ids = all_duplicates.filtered(lambda l: l.type == 'opportunity').ids

    @api.depends('lead_tomerge_ids', 'name')
    def _compute_duplicate_leads_message(self):
        for convert in self:
            if len(convert.duplicated_opportunity_ids):
                convert.duplicated_leads_message = _(
                    'Potential duplicates found. Use "Convert & Merge" or "Deduplicate" to clean your data before converting.'
                )
            else:
                convert.duplicated_leads_message = _(
                    'Potential duplicates found. Use "Deduplicate" to clean your data before converting.'
                )

    @api.depends('user_ids')
    def _compute_team_id(self):
        """ When changing the user, also set a team_id or restrict team id
        to the ones user_id is member of. """
        for convert in self:
            # setting users as void should not trigger a new team computation
            if not convert.user_ids:
                continue
            user = convert.user_ids and convert.user_ids[0] or self.env.user
            if convert.team_id and user in convert.team_id.member_ids | convert.team_id.user_id:
                continue
            team = self.env['crm.team']._get_default_team_id(user_id=user.ids[0], domain=None)
            convert.team_id = team.id

    @api.onchange('duplicated_lead_ids')
    def _onchange_duplicated_lead_ids(self):
        if not self.duplicated_lead_ids:
            self.name = 'convert'

    @api.onchange('duplicated_opportunity_ids')
    def _onchange_duplicated_opportunity_ids(self):
        if not self.duplicated_opportunity_ids:
            self.name = 'convert'

    def action_apply(self):
        affected_leads_count = len(self.lead_tomerge_ids)
        if self.name == 'deduplicate':
            affected_leads_count = self._action_deduplicate()
        elif self.name == 'convert_and_merge':
            self._action_convert_and_merge()
        else:
            self._convert_and_allocate(self.lead_tomerge_ids)

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "type": "success",
                "message": self._get_success_toast_message(affected_leads_count),
                "sticky": False,
                "next": {"type": "ir.actions.act_window_close"},
            },
        }

    def _get_success_toast_message(self, affected_leads_count):
        if self.name == 'deduplicate':
            return _("%(duplicate_count)s leads have been deduplicated", duplicate_count=affected_leads_count)
        else:
            if affected_leads_count == 1:
                return _("1 lead has been converted")
            else:
                return _("%(converted_count)s leads have been converted", converted_count=affected_leads_count)

    def _action_deduplicate(self):
        """
        For each selected lead, merge all of its duplicates except those explicitly removed by the user
        @return: number of affected leads
        """
        merged_lead_ids = set()
        deduplicated_count = 0

        for lead in self.lead_tomerge_ids:
            if lead.id not in merged_lead_ids:
                # Because we don't store a mapping of each lead to it's duplicate, we recompute the duplicates
                # when the user submits the form. To apply the user's changes, we perform a union with the stored list
                # from which the user can remove records
                duplicated_leads = self.env['crm.lead']._get_lead_duplicates(
                    partners=lead.partner_id,
                    email_list=[lead.partner_id and lead.partner_id.email or lead.email_from],
                    include_lost=False
                ) & self.duplicated_lead_ids
                if len(duplicated_leads) > 1:
                    deduplicated_count += len(duplicated_leads)
                    duplicated_leads.merge_opportunity()
                    merged_lead_ids.update(duplicated_leads.ids)

        return deduplicated_count

    def _action_convert_and_merge(self):
        """Convert all selected leads. If any of them have a matching existing opportunity, merge it"""
        merge_result_opportunity_ids = self.env['crm.lead']
        leads_without_opportunity_ids = self.env['crm.lead']

        for lead in self.lead_tomerge_ids:
            if lead.id in merge_result_opportunity_ids.ids:
                continue

            # Because we don't store a mapping of each opportunity to it's duplicate, we recompute the duplicates
            # when the user submits the form. To apply the user's changes, we perform a union with the stored list
            # of opportunities from which the user can remove records
            duplicate_opportunities = self.env['crm.lead']._get_lead_duplicates(
                partners=lead.partner_id,
                email_list=[lead.partner_id and lead.partner_id.email or lead.email_from],
                include_lost=False
            ) & self.duplicated_opportunity_ids

            # Merge with first matching existing opportunity
            if len(duplicate_opportunities):
                merge_result_opportunity_ids += (duplicate_opportunities[0] + lead).merge_opportunity()
            else:
                merge_result_opportunity_ids += lead
                leads_without_opportunity_ids += lead

        # Convert leads that weren't merged with opportunities
        self._convert_and_allocate(leads_without_opportunity_ids)

    def _convert_and_allocate(self, leads):
        for lead in leads:
            if lead.active:
                self._convert_handle_partner(lead, lead.partner_id.id)
                lead.convert_opportunity(lead.partner_id, user_ids=False, team_id=False)

        if self.user_ids:
            leads_to_allocate = leads if self.force_assignment else leads.filtered(lambda l: not l.user_id)
            leads_to_allocate._handle_salesmen_assignment(self.user_ids.ids, team_id=self.team_id.id)

    def _convert_handle_partner(self, lead, partner_id):
        if self.link_to_matching_customer:
            partner_id = lead._find_matching_partner().id

        lead._handle_partner_assignment(
            force_partner_id=partner_id,
            create_missing=self.link_to_matching_customer,
        )
