-- Knowledge records use archived_at/deleted_at and audited RPCs. Supabase's
-- platform default grants include DELETE on new tables, so revoke hard delete
-- explicitly instead of relying on a particular bootstrap's default ACL.
REVOKE DELETE ON TABLE
  public.governance_kb_categories,
  public.governance_kb_topics,
  public.governance_kb_replies,
  public.governance_kb_attachments,
  public.governance_kb_revisions
FROM anon, authenticated;
