from collections import defaultdict

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class MailCallArtifact(models.Model):
    """
    A Call Artifact represents a discrete "product" or digital footprint of a call (e.g., a 30s audio chunk,
    a text transcription, etc.)

    For media artifact each artifact acts as a thin metadata wrapper (timing, source, etc.) for exactly
    one media file (`ir.attachment`). This separation keeps the generic ir_attachment table lean.
    """
    _name = 'mail.call.artifact'
    _description = 'Call Artifact'

    OVERLAP_TOLERANCE_MS = 500

    discuss_call_history_id = fields.Many2one('discuss.call.history', string='Discuss Call History', ondelete='cascade', required=False, index=True)
    media_id = fields.Many2one('ir.attachment', string='Media Attachment', compute='_compute_media_id')
    start_ms = fields.Integer(string='Start (ms)', default=0, required=True, help="Offset from the start of the call in milliseconds")
    end_ms = fields.Integer(string='End (ms)', default=0, required=True, help="Offset from the start of the call in milliseconds")

    # ---------------------------------------------------------------------
    # Constraints

    @api.constrains('discuss_call_history_id')
    def _constrains_artifact_has_possessor(self):
        if any(not record.discuss_call_history_id for record in self):
            raise ValidationError(self.env._("Artifact must be linked to a call source."))

    @api.constrains('start_ms', 'end_ms')
    def _constrains_start_before_end(self):
        if any(artifact.end_ms <= artifact.start_ms for artifact in self):
            raise ValidationError(self.env._("End time must be greater than start time."))

    @api.constrains('start_ms', 'end_ms', 'discuss_call_history_id')
    def _constrains_artifacts_overlap(self):
        """ Check that artifacts within the same call do not overlap significantly.
        """
        grouped_artifacts = self._get_artifacts_grouped_by_call()

        for key, artifacts in grouped_artifacts.items():
            if not key:
                continue
            self._check_artifacts_overlap(artifacts)

    def _get_artifacts_grouped_by_call(self):
        """Returns a dict of { call_key: call.artifact() recordset }
        Where the call_key should be a (model_name, id)"""
        grouped = defaultdict(lambda: self.env['mail.call.artifact'])

        discuss_call_ids = self.mapped('discuss_call_history_id').ids
        if discuss_call_ids:
            artifacts = self.search([('discuss_call_history_id', 'in', discuss_call_ids)])
            for artifact in artifacts:
                key = ('discuss.call.history', artifact.discuss_call_history_id.id)
                grouped[key] |= artifact

        return grouped

    def _is_overlap_candidate(self):
        """Hook to determine if self should be checked for overlap."""
        return True

    def _check_artifacts_overlap(self, artifacts):
        """Validates a set of artifacts belonging to a single call."""
        media_candidates = sorted(
            [a for a in artifacts if a._is_overlap_candidate()],
            key=lambda x: x.start_ms
        )
        for i in range(len(media_candidates) - 1):
            if media_candidates[i].end_ms > media_candidates[i + 1].start_ms + self.OVERLAP_TOLERANCE_MS:
                raise ValidationError(self.env._("Media artifacts overlap significantly."))

    # ---------------------------------------------------------------------
    # Computes

    def _compute_media_id(self):
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', self._name),
            ('res_id', 'in', self.ids),
        ])
        attachment_by_res_id = {a.res_id: a for a in attachments}
        for artifact in self:
            artifact.media_id = attachment_by_res_id.get(artifact.id)
