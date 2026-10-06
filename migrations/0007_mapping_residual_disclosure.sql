ALTER TABLE source_mappings
  ADD COLUMN receives_rounding_residual boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT source_mappings_residual_method_check CHECK (NOT receives_rounding_residual OR allocation_method = 'percentage');
