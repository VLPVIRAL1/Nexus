CREATE INDEX clients_firm_active_code_idx ON clients(firm_id,lower(client_code) text_pattern_ops) WHERE archived_at IS NULL;
CREATE INDEX clients_firm_active_name_idx ON clients(firm_id,lower(display_name) text_pattern_ops) WHERE archived_at IS NULL;
CREATE INDEX tax_years_client_updated_idx ON tax_years(client_id,updated_at DESC);
