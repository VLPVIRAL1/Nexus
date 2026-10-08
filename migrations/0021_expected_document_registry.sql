ALTER TABLE expected_documents ADD COLUMN registry_id text;

CREATE INDEX expected_documents_registry_idx ON expected_documents(tax_year_id,registry_id) WHERE registry_id IS NOT NULL;
