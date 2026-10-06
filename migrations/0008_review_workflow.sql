ALTER TABLE review_points
  ADD COLUMN owner_role text,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN resolution_revision integer,
  ADD COLUMN dependency_hash text NOT NULL DEFAULT '',
  ADD CONSTRAINT review_points_category_check CHECK (category IN ('confirm','fyi','pending','correction','information_required')),
  ADD CONSTRAINT review_points_status_check CHECK (review_status IN ('open','waiting','resolved','not_applicable')),
  ADD CONSTRAINT review_points_owner_check CHECK (owner_role IS NULL OR owner_role IN ('taxpayer','spouse','return')),
  ADD CONSTRAINT review_points_resolution_check CHECK (
    (review_status IN ('open','waiting') AND resolution IS NULL AND resolved_by_id IS NULL AND resolved_at IS NULL AND resolution_revision IS NULL)
    OR
    (review_status IN ('resolved','not_applicable') AND length(trim(COALESCE(resolution,''))) > 0 AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution_revision IS NOT NULL)
  );

ALTER TABLE review_points
  ADD CONSTRAINT review_points_source_record_fk FOREIGN KEY (source_record_id) REFERENCES source_form_records(id),
  ADD CONSTRAINT review_points_activity_fk FOREIGN KEY (related_activity_id) REFERENCES activities(id);

CREATE INDEX review_points_year_status_idx ON review_points(tax_year_id,review_status,created_at DESC);
