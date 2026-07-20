BEGIN;

CREATE OR REPLACE FUNCTION public.immutable_array_to_string(arr text[], sep text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT array_to_string(arr, sep);
$$;

CREATE TABLE IF NOT EXISTS public.governance_kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.governance_kb_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  body_markdown text NOT NULL DEFAULT '' CHECK (char_length(body_markdown) <= 50000),
  category_id uuid NOT NULL REFERENCES public.governance_kb_categories(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('question', 'guide', 'procedure', 'decision', 'incident')),
  tags text[] NOT NULL DEFAULT '{}',
  publication_status text NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published', 'archived')),
  resolution_status text CHECK (resolution_status IN ('open', 'resolved')),
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_reply_id uuid,
  is_official boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_change_summary text,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(body_markdown, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(public.immutable_array_to_string(tags, ' '), '')), 'C')
  ) STORED,
  CONSTRAINT governance_kb_topics_resolution_check CHECK (
    (kind IN ('question', 'incident') AND resolution_status IN ('open', 'resolved'))
    OR (kind NOT IN ('question', 'incident') AND resolution_status IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.governance_kb_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.governance_kb_topics(id) ON DELETE RESTRICT,
  body_markdown text NOT NULL CHECK (char_length(btrim(body_markdown)) BETWEEN 1 AND 30000),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'removed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_change_summary text,
  published_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.governance_kb_topics
  DROP CONSTRAINT IF EXISTS governance_kb_topics_accepted_reply_fkey;
ALTER TABLE public.governance_kb_topics
  ADD CONSTRAINT governance_kb_topics_accepted_reply_fkey
  FOREIGN KEY (accepted_reply_id) REFERENCES public.governance_kb_replies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.governance_kb_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.governance_kb_topics(id) ON DELETE RESTRICT,
  reply_id uuid REFERENCES public.governance_kb_replies(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  alt_text text NOT NULL CHECK (char_length(btrim(alt_text)) BETWEEN 3 AND 240),
  upload_status text NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'ready', 'failed')),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.governance_kb_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('topic', 'reply')),
  entity_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_summary text NOT NULL CHECK (char_length(btrim(change_summary)) BETWEEN 3 AND 240),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (entity_type, entity_id, revision_number)
);

CREATE INDEX IF NOT EXISTS governance_kb_topics_search_idx
  ON public.governance_kb_topics USING gin (search_document);
CREATE INDEX IF NOT EXISTS governance_kb_topics_listing_idx
  ON public.governance_kb_topics (publication_status, is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS governance_kb_topics_category_idx
  ON public.governance_kb_topics (category_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS governance_kb_replies_topic_idx
  ON public.governance_kb_replies (topic_id, status, created_at);
CREATE INDEX IF NOT EXISTS governance_kb_attachments_topic_idx
  ON public.governance_kb_attachments (topic_id, upload_status, created_at);
CREATE INDEX IF NOT EXISTS governance_kb_revisions_entity_idx
  ON public.governance_kb_revisions (entity_type, entity_id, revision_number DESC);

ALTER TABLE public.governance_kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_kb_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_kb_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_kb_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_kb_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Governance reads knowledge categories" ON public.governance_kb_categories;
CREATE POLICY "Governance reads knowledge categories"
  ON public.governance_kb_categories FOR SELECT TO authenticated
  USING (public.is_governance_user());

DROP POLICY IF EXISTS "Owner manages knowledge categories" ON public.governance_kb_categories;
CREATE POLICY "Owner manages knowledge categories"
  ON public.governance_kb_categories FOR ALL TO authenticated
  USING (public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]));

DROP POLICY IF EXISTS "Governance reads knowledge topics" ON public.governance_kb_topics;
CREATE POLICY "Governance reads knowledge topics"
  ON public.governance_kb_topics FOR SELECT TO authenticated
  USING (
    public.is_governance_user()
    AND (
      publication_status = 'published'
      OR public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    )
  );

DROP POLICY IF EXISTS "Editors create knowledge topics" ON public.governance_kb_topics;
CREATE POLICY "Editors create knowledge topics"
  ON public.governance_kb_topics FOR INSERT TO authenticated
  WITH CHECK (
    public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    AND author_id = (SELECT auth.uid())
    AND is_official = false
    AND is_pinned = false
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND publication_status IN ('draft', 'published')
  );

DROP POLICY IF EXISTS "Editors update knowledge topics" ON public.governance_kb_topics;
CREATE POLICY "Editors update knowledge topics"
  ON public.governance_kb_topics FOR UPDATE TO authenticated
  USING (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));

DROP POLICY IF EXISTS "Governance reads knowledge replies" ON public.governance_kb_replies;
CREATE POLICY "Governance reads knowledge replies"
  ON public.governance_kb_replies FOR SELECT TO authenticated
  USING (
    public.is_governance_user()
    AND (
      status = 'published'
      OR public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    )
  );

DROP POLICY IF EXISTS "Editors create knowledge replies" ON public.governance_kb_replies;
CREATE POLICY "Editors create knowledge replies"
  ON public.governance_kb_replies FOR INSERT TO authenticated
  WITH CHECK (
    public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    AND author_id = (SELECT auth.uid())
    AND status IN ('draft', 'published')
  );

DROP POLICY IF EXISTS "Authors and owners update knowledge replies" ON public.governance_kb_replies;
CREATE POLICY "Authors and owners update knowledge replies"
  ON public.governance_kb_replies FOR UPDATE TO authenticated
  USING (
    public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[])
    OR (
      author_id = (SELECT auth.uid())
      AND public.is_governance_user(ARRAY['SaaS_Editor']::public.governance_role_enum[])
    )
  )
  WITH CHECK (
    public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[])
    OR (
      author_id = (SELECT auth.uid())
      AND public.is_governance_user(ARRAY['SaaS_Editor']::public.governance_role_enum[])
    )
  );

DROP POLICY IF EXISTS "Governance reads knowledge attachments" ON public.governance_kb_attachments;
CREATE POLICY "Governance reads knowledge attachments"
  ON public.governance_kb_attachments FOR SELECT TO authenticated
  USING (
    public.is_governance_user()
    AND (
      public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
      OR EXISTS (
        SELECT 1 FROM public.governance_kb_topics topic
        WHERE topic.id = topic_id AND topic.publication_status = 'published'
      )
    )
    AND (
      reply_id IS NULL
      OR public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
      OR EXISTS (
        SELECT 1 FROM public.governance_kb_replies reply
        WHERE reply.id = reply_id AND reply.status = 'published'
      )
    )
  );

DROP POLICY IF EXISTS "Editors create knowledge attachments" ON public.governance_kb_attachments;
CREATE POLICY "Editors create knowledge attachments"
  ON public.governance_kb_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    AND uploaded_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Editors update knowledge attachments" ON public.governance_kb_attachments;
CREATE POLICY "Editors update knowledge attachments"
  ON public.governance_kb_attachments FOR UPDATE TO authenticated
  USING (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));

DROP POLICY IF EXISTS "Governance reads knowledge revisions" ON public.governance_kb_revisions;
CREATE POLICY "Governance reads knowledge revisions"
  ON public.governance_kb_revisions FOR SELECT TO authenticated
  USING (
    public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    OR (
      public.is_governance_user()
      AND (
        (entity_type = 'topic' AND EXISTS (
          SELECT 1 FROM public.governance_kb_topics topic
          WHERE topic.id = entity_id AND topic.publication_status = 'published'
        ))
        OR (entity_type = 'reply' AND EXISTS (
          SELECT 1 FROM public.governance_kb_replies reply
          JOIN public.governance_kb_topics topic ON topic.id = reply.topic_id
          WHERE reply.id = entity_id
            AND reply.status = 'published'
            AND topic.publication_status = 'published'
        ))
      )
    )
  );

CREATE OR REPLACE FUNCTION public.governance_kb_touch_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_touch_category_trigger ON public.governance_kb_categories;
CREATE TRIGGER governance_kb_touch_category_trigger
  BEFORE UPDATE ON public.governance_kb_categories
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_touch_category();

CREATE OR REPLACE FUNCTION public.governance_kb_validate_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reply_topic_id uuid;
BEGIN
  IF NEW.reply_id IS NOT NULL THEN
    SELECT topic_id INTO reply_topic_id
      FROM public.governance_kb_replies
      WHERE id = NEW.reply_id;
    IF reply_topic_id IS NULL OR reply_topic_id <> NEW.topic_id THEN
      RAISE EXCEPTION 'attachment_reply_topic_mismatch';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.topic_id IS DISTINCT FROM OLD.topic_id
      OR NEW.reply_id IS DISTINCT FROM OLD.reply_id
      OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
      OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
      OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    THEN
      RAISE EXCEPTION 'attachment_identity_is_immutable';
    END IF;
    NEW.updated_at := timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_validate_attachment_trigger ON public.governance_kb_attachments;
CREATE TRIGGER governance_kb_validate_attachment_trigger
  BEFORE INSERT OR UPDATE ON public.governance_kb_attachments
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_validate_attachment();

CREATE OR REPLACE FUNCTION public.governance_kb_guard_topic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  content_changed boolean;
  owner_request boolean;
BEGIN
  owner_request := public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]);

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'immutable_topic_fields';
  END IF;

  IF NOT owner_request AND (
    NEW.is_official IS DISTINCT FROM OLD.is_official
    OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.publication_status = 'archived' AND OLD.publication_status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'owner_permission_required';
  END IF;

  content_changed :=
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.publication_status IS DISTINCT FROM OLD.publication_status
    OR NEW.resolution_status IS DISTINCT FROM OLD.resolution_status
    OR NEW.accepted_reply_id IS DISTINCT FROM OLD.accepted_reply_id;

  IF NEW.accepted_reply_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.governance_kb_replies reply
    WHERE reply.id = NEW.accepted_reply_id
      AND reply.topic_id = NEW.id
      AND reply.status = 'published'
  ) THEN
    RAISE EXCEPTION 'invalid_solution';
  END IF;

  IF content_changed THEN
    IF OLD.publication_status = 'published'
      AND char_length(btrim(coalesce(NEW.last_change_summary, ''))) < 3
    THEN
      RAISE EXCEPTION 'change_summary_required';
    END IF;

    INSERT INTO public.governance_kb_revisions (
      entity_type,
      entity_id,
      revision_number,
      snapshot,
      changed_by,
      change_summary
    ) VALUES (
      'topic',
      OLD.id,
      OLD.version,
      jsonb_build_object(
        'slug', OLD.slug,
        'title', OLD.title,
        'body_markdown', OLD.body_markdown,
        'category_id', OLD.category_id,
        'kind', OLD.kind,
        'tags', OLD.tags,
        'publication_status', OLD.publication_status,
        'resolution_status', OLD.resolution_status,
        'accepted_reply_id', OLD.accepted_reply_id
      ),
      (SELECT auth.uid()),
      coalesce(nullif(btrim(NEW.last_change_summary), ''), 'Atualização de rascunho')
    );

    NEW.version := OLD.version + 1;
    NEW.is_official := false;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
  ELSE
    NEW.version := OLD.version;
  END IF;

  IF NEW.publication_status = 'published' AND OLD.publication_status <> 'published' THEN
    NEW.published_at := timezone('utc', now());
    NEW.archived_at := NULL;
  ELSIF NEW.publication_status = 'archived' AND OLD.publication_status <> 'archived' THEN
    NEW.archived_at := timezone('utc', now());
  END IF;

  NEW.updated_at := timezone('utc', now());

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    CASE WHEN content_changed THEN 'knowledge.topic_updated' ELSE 'knowledge.topic_moderated' END,
    NEW.id,
    'governance_kb_topic',
    jsonb_build_object(
      'title', NEW.title,
      'version', NEW.version,
      'publication_status', NEW.publication_status,
      'is_official', NEW.is_official,
      'is_pinned', NEW.is_pinned
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_guard_topic_update_trigger ON public.governance_kb_topics;
CREATE TRIGGER governance_kb_guard_topic_update_trigger
  BEFORE UPDATE ON public.governance_kb_topics
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_guard_topic_update();

CREATE OR REPLACE FUNCTION public.governance_kb_audit_topic_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.topic_created',
    NEW.id,
    'governance_kb_topic',
    jsonb_build_object('title', NEW.title, 'publication_status', NEW.publication_status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_audit_topic_insert_trigger ON public.governance_kb_topics;
CREATE TRIGGER governance_kb_audit_topic_insert_trigger
  AFTER INSERT ON public.governance_kb_topics
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_audit_topic_insert();

CREATE OR REPLACE FUNCTION public.governance_kb_guard_reply_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  content_changed boolean;
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'immutable_reply_fields';
  END IF;

  IF NEW.status = 'removed'
    AND OLD.status <> 'removed'
    AND NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[])
  THEN
    RAISE EXCEPTION 'owner_permission_required';
  END IF;

  content_changed := NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.status IS DISTINCT FROM OLD.status;

  IF content_changed THEN
    IF OLD.status = 'published'
      AND char_length(btrim(coalesce(NEW.last_change_summary, ''))) < 3
    THEN
      RAISE EXCEPTION 'change_summary_required';
    END IF;

    INSERT INTO public.governance_kb_revisions (
      entity_type,
      entity_id,
      revision_number,
      snapshot,
      changed_by,
      change_summary
    ) VALUES (
      'reply',
      OLD.id,
      OLD.version,
      jsonb_build_object('body_markdown', OLD.body_markdown, 'status', OLD.status),
      (SELECT auth.uid()),
      coalesce(nullif(btrim(NEW.last_change_summary), ''), 'Atualização de rascunho')
    );
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;

  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    NEW.published_at := timezone('utc', now());
    NEW.removed_at := NULL;
  ELSIF NEW.status = 'removed' AND OLD.status <> 'removed' THEN
    NEW.removed_at := timezone('utc', now());
  END IF;
  NEW.updated_at := timezone('utc', now());

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.reply_updated',
    NEW.id,
    'governance_kb_reply',
    jsonb_build_object('topic_id', NEW.topic_id, 'version', NEW.version, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_guard_reply_update_trigger ON public.governance_kb_replies;
CREATE TRIGGER governance_kb_guard_reply_update_trigger
  BEFORE UPDATE ON public.governance_kb_replies
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_guard_reply_update();

CREATE OR REPLACE FUNCTION public.governance_kb_audit_reply_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.reply_created',
    NEW.id,
    'governance_kb_reply',
    jsonb_build_object('topic_id', NEW.topic_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS governance_kb_audit_reply_insert_trigger ON public.governance_kb_replies;
CREATE TRIGGER governance_kb_audit_reply_insert_trigger
  AFTER INSERT ON public.governance_kb_replies
  FOR EACH ROW EXECUTE FUNCTION public.governance_kb_audit_reply_insert();

CREATE OR REPLACE FUNCTION public.search_governance_kb_topics(
  search_query text DEFAULT NULL,
  filter_category uuid DEFAULT NULL,
  filter_kind text DEFAULT NULL,
  filter_status text DEFAULT NULL,
  page_number integer DEFAULT 1,
  page_size integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  excerpt text,
  kind text,
  tags text[],
  publication_status text,
  resolution_status text,
  is_official boolean,
  is_pinned boolean,
  reviewed_at timestamptz,
  author_name text,
  category_id uuid,
  category_name text,
  category_slug text,
  reply_count bigint,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  can_edit boolean;
BEGIN
  IF NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  can_edit := public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      topic.id,
      topic.slug,
      topic.title,
      left(regexp_replace(topic.body_markdown, '[#*_>`~\[\]()]', '', 'g'), 220) AS excerpt,
      topic.kind,
      topic.tags,
      topic.publication_status,
      topic.resolution_status,
      topic.is_official,
      topic.is_pinned,
      topic.reviewed_at,
      coalesce(profile.name, 'Equipe CutSync') AS author_name,
      category.id AS category_id,
      category.name AS category_name,
      category.slug AS category_slug,
      (SELECT count(*) FROM public.governance_kb_replies reply
        WHERE reply.topic_id = topic.id AND reply.status = 'published') AS reply_count,
      topic.version,
      topic.created_at,
      topic.updated_at
    FROM public.governance_kb_topics topic
    JOIN public.governance_kb_categories category ON category.id = topic.category_id
    LEFT JOIN public.profiles profile ON profile.id = topic.author_id
    WHERE (can_edit OR topic.publication_status = 'published')
      AND (filter_status IS NULL OR topic.publication_status = filter_status)
      AND (filter_category IS NULL OR topic.category_id = filter_category)
      AND (filter_kind IS NULL OR topic.kind = filter_kind)
      AND (
        search_query IS NULL
        OR btrim(search_query) = ''
        OR topic.search_document @@ websearch_to_tsquery('portuguese', btrim(search_query))
      )
  )
  SELECT filtered.*, count(*) OVER () AS total_count
  FROM filtered
  ORDER BY is_pinned DESC, is_official DESC, updated_at DESC
  LIMIT LEAST(GREATEST(page_size, 1), 50)
  OFFSET (GREATEST(page_number, 1) - 1) * LEAST(GREATEST(page_size, 1), 50);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_governance_kb_topic(target_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  can_edit boolean;
  topic_payload jsonb;
BEGIN
  IF NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  can_edit := public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]);

  SELECT jsonb_build_object(
    'id', topic.id,
    'slug', topic.slug,
    'title', topic.title,
    'body_markdown', topic.body_markdown,
    'kind', topic.kind,
    'tags', topic.tags,
    'publication_status', topic.publication_status,
    'resolution_status', topic.resolution_status,
    'accepted_reply_id', topic.accepted_reply_id,
    'is_official', topic.is_official,
    'is_pinned', topic.is_pinned,
    'reviewed_at', topic.reviewed_at,
    'version', topic.version,
    'created_at', topic.created_at,
    'updated_at', topic.updated_at,
    'author_id', topic.author_id,
    'author_name', coalesce(profile.name, 'Equipe CutSync'),
    'category', jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug)
  ) INTO topic_payload
  FROM public.governance_kb_topics topic
  JOIN public.governance_kb_categories category ON category.id = topic.category_id
  LEFT JOIN public.profiles profile ON profile.id = topic.author_id
  WHERE topic.id = target_topic_id
    AND (can_edit OR topic.publication_status = 'published');

  IF topic_payload IS NULL THEN
    RAISE EXCEPTION 'topic_not_found';
  END IF;

  RETURN jsonb_build_object(
    'topic', topic_payload,
    'replies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', reply.id,
        'topic_id', reply.topic_id,
        'body_markdown', reply.body_markdown,
        'author_id', reply.author_id,
        'author_name', coalesce(profile.name, 'Membro da Governança'),
        'status', reply.status,
        'version', reply.version,
        'created_at', reply.created_at,
        'updated_at', reply.updated_at
      ) ORDER BY reply.created_at)
      FROM public.governance_kb_replies reply
      LEFT JOIN public.profiles profile ON profile.id = reply.author_id
      WHERE reply.topic_id = target_topic_id
        AND (can_edit OR reply.status = 'published')
    ), '[]'::jsonb),
    'attachments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'topic_id', attachment.topic_id,
        'reply_id', attachment.reply_id,
        'storage_path', attachment.storage_path,
        'original_name', attachment.original_name,
        'mime_type', attachment.mime_type,
        'size_bytes', attachment.size_bytes,
        'width', attachment.width,
        'height', attachment.height,
        'alt_text', attachment.alt_text,
        'upload_status', attachment.upload_status,
        'created_at', attachment.created_at
      ) ORDER BY attachment.created_at)
      FROM public.governance_kb_attachments attachment
      WHERE attachment.topic_id = target_topic_id
        AND attachment.upload_status = 'ready'
        AND (
          attachment.reply_id IS NULL
          OR can_edit
          OR EXISTS (
            SELECT 1 FROM public.governance_kb_replies visible_reply
            WHERE visible_reply.id = attachment.reply_id AND visible_reply.status = 'published'
          )
        )
    ), '[]'::jsonb),
    'revisions', CASE WHEN can_edit THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', revision.id,
        'entity_type', revision.entity_type,
        'entity_id', revision.entity_id,
        'revision_number', revision.revision_number,
        'snapshot', revision.snapshot,
        'changed_by', revision.changed_by,
        'changed_by_name', coalesce(profile.name, 'Equipe CutSync'),
        'change_summary', revision.change_summary,
        'created_at', revision.created_at
      ) ORDER BY revision.created_at DESC)
      FROM public.governance_kb_revisions revision
      LEFT JOIN public.profiles profile ON profile.id = revision.changed_by
      WHERE (revision.entity_type = 'topic' AND revision.entity_id = target_topic_id)
        OR (revision.entity_type = 'reply' AND revision.entity_id IN (
          SELECT id FROM public.governance_kb_replies WHERE topic_id = target_topic_id
        ))
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_governance_kb_solution(
  target_topic_id uuid,
  target_reply_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  topic_kind text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT kind INTO topic_kind FROM public.governance_kb_topics WHERE id = target_topic_id;
  IF topic_kind NOT IN ('question', 'incident') THEN
    RAISE EXCEPTION 'topic_cannot_be_resolved';
  END IF;

  IF target_reply_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.governance_kb_replies
    WHERE id = target_reply_id AND topic_id = target_topic_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'invalid_solution';
  END IF;

  UPDATE public.governance_kb_topics
  SET accepted_reply_id = target_reply_id,
      resolution_status = CASE WHEN target_reply_id IS NULL THEN 'open' ELSE 'resolved' END,
      last_change_summary = CASE WHEN target_reply_id IS NULL THEN 'Tópico reaberto' ELSE 'Solução aceita' END
  WHERE id = target_topic_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_governance_kb_topic(
  target_topic_id uuid,
  requested_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  CASE requested_action
    WHEN 'mark_official' THEN
      UPDATE public.governance_kb_topics
      SET is_official = true,
          reviewed_at = timezone('utc', now()),
          reviewed_by = (SELECT auth.uid()),
          last_change_summary = 'Conteúdo revisado e marcado como oficial'
      WHERE id = target_topic_id AND publication_status = 'published';
    WHEN 'remove_official' THEN
      UPDATE public.governance_kb_topics
      SET is_official = false,
          reviewed_at = NULL,
          reviewed_by = NULL,
          last_change_summary = 'Selo oficial removido'
      WHERE id = target_topic_id;
    WHEN 'pin' THEN
      UPDATE public.governance_kb_topics SET is_pinned = true WHERE id = target_topic_id;
    WHEN 'unpin' THEN
      UPDATE public.governance_kb_topics SET is_pinned = false WHERE id = target_topic_id;
    WHEN 'archive' THEN
      UPDATE public.governance_kb_topics
      SET publication_status = 'archived', last_change_summary = 'Tópico arquivado pela moderação'
      WHERE id = target_topic_id;
    WHEN 'republish' THEN
      UPDATE public.governance_kb_topics
      SET publication_status = 'published', last_change_summary = 'Tópico republicado pela moderação'
      WHERE id = target_topic_id;
    ELSE
      RAISE EXCEPTION 'invalid_moderation_action';
  END CASE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topic_not_found_or_invalid_state';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_governance_kb_revision(
  target_revision_id bigint,
  requested_change_summary text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  revision_record public.governance_kb_revisions%ROWTYPE;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(coalesce(requested_change_summary, ''))) < 3 THEN
    RAISE EXCEPTION 'change_summary_required';
  END IF;

  SELECT * INTO revision_record
  FROM public.governance_kb_revisions
  WHERE id = target_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_not_found';
  END IF;

  IF revision_record.entity_type = 'topic' THEN
    UPDATE public.governance_kb_topics
    SET slug = revision_record.snapshot->>'slug',
        title = revision_record.snapshot->>'title',
        body_markdown = revision_record.snapshot->>'body_markdown',
        category_id = (revision_record.snapshot->>'category_id')::uuid,
        kind = revision_record.snapshot->>'kind',
        tags = ARRAY(SELECT jsonb_array_elements_text(revision_record.snapshot->'tags')),
        publication_status = revision_record.snapshot->>'publication_status',
        resolution_status = revision_record.snapshot->>'resolution_status',
        accepted_reply_id = nullif(revision_record.snapshot->>'accepted_reply_id', '')::uuid,
        last_change_summary = btrim(requested_change_summary)
    WHERE id = revision_record.entity_id;
  ELSE
    UPDATE public.governance_kb_replies
    SET body_markdown = revision_record.snapshot->>'body_markdown',
        status = revision_record.snapshot->>'status',
        last_change_summary = btrim(requested_change_summary)
    WHERE id = revision_record.entity_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_governance_kb_attachment(
  target_topic_id uuid,
  target_reply_id uuid,
  requested_original_name text,
  requested_mime_type text,
  requested_size_bytes bigint,
  requested_width integer,
  requested_height integer,
  requested_alt_text text
)
RETURNS TABLE (attachment_id uuid, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
  extension text;
  new_path text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.governance_kb_topics WHERE id = target_topic_id) THEN
    RAISE EXCEPTION 'topic_not_found';
  END IF;
  IF requested_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'unsupported_image_type';
  END IF;
  IF requested_size_bytes <= 0 OR requested_size_bytes > 5242880 THEN
    RAISE EXCEPTION 'image_size_invalid';
  END IF;
  IF char_length(btrim(coalesce(requested_alt_text, ''))) < 3 THEN
    RAISE EXCEPTION 'alt_text_required';
  END IF;

  extension := CASE requested_mime_type
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
  END;
  new_path := target_topic_id::text || '/' || new_id::text || '.' || extension;

  INSERT INTO public.governance_kb_attachments (
    id, topic_id, reply_id, storage_path, original_name, mime_type,
    size_bytes, width, height, alt_text, uploaded_by
  ) VALUES (
    new_id, target_topic_id, target_reply_id, new_path,
    left(btrim(requested_original_name), 255), requested_mime_type,
    requested_size_bytes, requested_width, requested_height,
    btrim(requested_alt_text), (SELECT auth.uid())
  );

  RETURN QUERY SELECT new_id, new_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_governance_kb_attachment(target_attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  attachment_path text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT storage_path INTO attachment_path
  FROM public.governance_kb_attachments
  WHERE id = target_attachment_id;
  IF attachment_path IS NULL THEN
    RAISE EXCEPTION 'attachment_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'governance-kb' AND name = attachment_path
  ) THEN
    RAISE EXCEPTION 'attachment_object_not_found';
  END IF;

  UPDATE public.governance_kb_attachments
  SET upload_status = 'ready'
  WHERE id = target_attachment_id;

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  SELECT (SELECT auth.uid()), 'knowledge.attachment_uploaded', attachment.id,
    'governance_kb_attachment',
    jsonb_build_object('topic_id', attachment.topic_id, 'mime_type', attachment.mime_type, 'size_bytes', attachment.size_bytes)
  FROM public.governance_kb_attachments attachment
  WHERE attachment.id = target_attachment_id;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'governance-kb',
  'governance-kb',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Governance reads private knowledge images" ON storage.objects;
CREATE POLICY "Governance reads private knowledge images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'governance-kb'
    AND public.is_governance_user()
    AND EXISTS (
      SELECT 1
      FROM public.governance_kb_attachments attachment
      JOIN public.governance_kb_topics topic ON topic.id = attachment.topic_id
      LEFT JOIN public.governance_kb_replies reply ON reply.id = attachment.reply_id
      WHERE attachment.storage_path = name
        AND attachment.upload_status = 'ready'
        AND (
          public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
          OR (
            topic.publication_status = 'published'
            AND (attachment.reply_id IS NULL OR reply.status = 'published')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Editors upload private knowledge images" ON storage.objects;
CREATE POLICY "Editors upload private knowledge images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'governance-kb'
    AND public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
    AND EXISTS (
      SELECT 1 FROM public.governance_kb_attachments attachment
      WHERE attachment.storage_path = name
        AND attachment.upload_status = 'pending'
        AND attachment.uploaded_by = (SELECT auth.uid())
    )
  );

INSERT INTO public.governance_kb_categories (id, slug, name, description, sort_order)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'seguranca-e-acesso', 'Segurança e acesso', 'Permissões, autenticação e proteção da plataforma.', 10),
  ('a0000000-0000-4000-8000-000000000002', 'operacao-e-suporte', 'Operação e suporte', 'Procedimentos para sustentação da operação.', 20),
  ('a0000000-0000-4000-8000-000000000003', 'privacidade-e-conformidade', 'Privacidade e conformidade', 'LGPD, auditoria e controles regulatórios.', 30),
  ('a0000000-0000-4000-8000-000000000004', 'banco-e-infraestrutura', 'Banco e infraestrutura', 'Banco de dados, observabilidade e manutenção.', 40),
  ('a0000000-0000-4000-8000-000000000005', 'desenvolvimento-e-integracoes', 'Desenvolvimento e integrações', 'Padrões técnicos e integrações do CutSync.', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.governance_kb_topics (
  id, slug, title, body_markdown, category_id, kind, tags,
  publication_status, resolution_status, author_id, is_official,
  is_pinned, reviewed_at, reviewed_by, published_at, last_change_summary
)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'niveis-de-permissoes-rbac',
    'Níveis de Permissões (RBAC)',
    E'# Níveis de Permissões\n\nA Central de Governança utiliza acesso baseado em cargos.\n\n- **SaaS_Viewer:** consulta tópicos publicados, estabelecimentos e trilha de auditoria.\n- **SaaS_Editor:** executa operações autorizadas e colabora na base de conhecimento.\n- **SaaS_Owner:** administra membros, modera a base e marca conteúdo oficial.\n\nConceda sempre o menor privilégio necessário.',
    'a0000000-0000-4000-8000-000000000001',
    'guide', ARRAY['rbac', 'segurança'], 'published', NULL, NULL, false, true, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado migrado para revisão'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'circuit-breaker-de-inadimplencia',
    'Circuit Breaker de Inadimplência',
    E'# Estados da conta\n\n- **active:** o estabelecimento aparece na descoberta e clientes podem criar agendamentos.\n- **pending_verification:** operações internas autorizadas podem continuar, mas novos agendamentos de clientes e a exposição no Explore exigem estado `active`.\n- **delinquent** e **blocked:** novas operações protegidas são interrompidas pelas políticas do banco.\n\nA interface deve refletir as mesmas regras das políticas RLS; não use somente bloqueios visuais.',
    'a0000000-0000-4000-8000-000000000002',
    'procedure', ARRAY['circuit-breaker', 'rls'], 'published', NULL, NULL, false, true, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado corrigido e migrado para revisão'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'direito-de-exclusao-lgpd',
    'Direito de Exclusão e Anonimização LGPD',
    E'# Anonimização\n\nA RPC abaixo anonimiza o perfil preservando a integridade referencial necessária:\n\n```sql\nSELECT public.anonymize_user_profile(''ID_DO_USUARIO'');\n```\n\nO procedimento substitui identificadores pessoais, remove dados opcionais, revoga vínculos ativos e registra o evento na trilha de auditoria. Confirme a identidade e a base legal antes da execução.',
    'a0000000-0000-4000-8000-000000000003',
    'procedure', ARRAY['lgpd', 'privacidade'], 'published', NULL, NULL, false, false, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado migrado para revisão'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'onboarding-cnpj-automatizado',
    'Onboarding CNPJ Automatizado',
    E'# Validação cadastral\n\nO onboarding valida situação cadastral e elegibilidade antes de criar o estabelecimento. Quando aprovado, a RPC `create_establishment_and_promote_owner` cria a unidade e promove o solicitante de forma atômica.\n\nFalhas de integração externa devem manter a solicitação sem promoção automática e produzir uma mensagem operacional clara.',
    'a0000000-0000-4000-8000-000000000002',
    'guide', ARRAY['cnpj', 'onboarding'], 'published', NULL, NULL, false, false, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado migrado para revisão'
  ),
  (
    'b0000000-0000-4000-8000-000000000005',
    'consultas-sql-uteis-para-auditoria',
    'Consultas SQL Úteis para Auditoria',
    E'# Consultas somente leitura\n\n## Logs recentes\n\n```sql\nSELECT *\nFROM public.security_audit_logs\nORDER BY created_at DESC\nLIMIT 50;\n```\n\n## Acessos de Governança\n\n```sql\nSELECT gu.role, p.name, p.email, gu.granted_at\nFROM public.governance_users gu\nJOIN public.profiles p ON p.id = gu.profile_id;\n```\n\n## Contas com circuit breaker\n\n```sql\nSELECT id, name, slug, account_status\nFROM public.establishments\nWHERE account_status IN (''blocked'', ''delinquent'');\n```',
    'a0000000-0000-4000-8000-000000000003',
    'guide', ARRAY['sql', 'auditoria'], 'published', NULL, NULL, false, false, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado migrado para revisão'
  ),
  (
    'b0000000-0000-4000-8000-000000000006',
    'performance-e-manutencao-do-banco',
    'Performance e Manutenção do Banco',
    E'# Diagnóstico\n\nUse `pg_stat_statements` para identificar consultas de maior custo e valide índices com planos de execução.\n\n```sql\nSELECT query, calls, total_exec_time, mean_exec_time, rows\nFROM pg_stat_statements\nORDER BY total_exec_time DESC\nLIMIT 10;\n```\n\nA tabela `security_audit_logs` é imutável por definição. Não execute `DELETE` ou `UPDATE` nela. Qualquer política futura de retenção deve ser implementada por uma migração explícita, revisada pela Governança.',
    'a0000000-0000-4000-8000-000000000004',
    'guide', ARRAY['dba', 'sre', 'performance'], 'published', NULL, NULL, false, false, NULL, NULL,
    timezone('utc', now()), 'Instrução inválida de exclusão removida durante a migração'
  ),
  (
    'b0000000-0000-4000-8000-000000000007',
    'guia-de-integracao-e-padronizacao',
    'Guia de Integração e Padronização',
    E'# Padrões de desenvolvimento\n\n- Não altere migrations já aplicadas; crie uma nova migration.\n- Toda tabela exposta deve habilitar RLS e possuir políticas explícitas.\n- Eventos de segurança devem ser registrados por triggers ou RPCs autorizadas; o cliente não deve inserir diretamente na trilha imutável.\n- Não registre tokens, senhas, documentos ou conteúdo integral de tópicos nos logs.\n\n```bash\nsupabase migration new nome_da_mudanca\n```',
    'a0000000-0000-4000-8000-000000000005',
    'guide', ARRAY['desenvolvimento', 'migrations', 'rls'], 'published', NULL, NULL, false, false, NULL, NULL,
    timezone('utc', now()), 'Conteúdo legado corrigido e migrado para revisão'
  )
ON CONFLICT (slug) DO NOTHING;

GRANT SELECT ON public.governance_kb_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.governance_kb_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.governance_kb_replies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.governance_kb_attachments TO authenticated;
GRANT SELECT ON public.governance_kb_revisions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.governance_kb_revisions_id_seq TO authenticated;

REVOKE ALL ON FUNCTION public.search_governance_kb_topics(text, uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_governance_kb_topic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_governance_kb_solution(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_governance_kb_topic(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_governance_kb_revision(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_governance_kb_attachment(uuid, uuid, text, text, bigint, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_governance_kb_attachment(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_governance_kb_topics(text, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_governance_kb_topic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_governance_kb_solution(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_governance_kb_topic(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_governance_kb_revision(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_governance_kb_attachment(uuid, uuid, text, text, bigint, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_governance_kb_attachment(uuid) TO authenticated;

COMMIT;
