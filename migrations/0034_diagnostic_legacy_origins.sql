UPDATE validation_issues SET origin='intake-2025',evaluation_stage='intake'
WHERE category='intake' AND origin='legacy_writer';

UPDATE validation_issues SET origin='source-mapping',evaluation_stage='mapping'
WHERE (category='mapping' OR code IN ('MAPPING_UNRESOLVED','MAPPING_TARGET_UNSUPPORTED','MAPPING_OVER_ALLOCATED'))
  AND origin='legacy_writer';

UPDATE validation_issues SET origin='federal-calculation-2025',evaluation_stage='calculation'
WHERE category='calculation_engine' AND origin='legacy_writer';

UPDATE validation_issues SET origin='manual-override',evaluation_stage='calculation'
WHERE code='OVERRIDE_RECALCULATION_REQUIRED' AND origin='legacy_writer';

UPDATE validation_issues SET origin='source-document-upload',evaluation_stage='source'
WHERE code='POSSIBLE_DUPLICATE_SOURCE' AND origin='legacy_writer';
