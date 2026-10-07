import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("INSERT INTO firms(id,name) VALUES('10000000-0000-4000-8000-000000000001','Meridian Tax Group') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO users(id,email,display_name) VALUES('20000000-0000-4000-8000-000000000001','maya@example.invalid','Maya Chen'),('20000000-0000-4000-8000-000000000002','david@example.invalid','David Ross'),('20000000-0000-4000-8000-000000000003','admin@example.invalid','Alex Morgan') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO memberships(firm_id,user_id,role) VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','preparer'),('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','reviewer'),('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','admin') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO clients(id,firm_id,client_code,display_name) VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','000123','John Sample & Jane Sample') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO client_assignments(client_id,user_id,kind) VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','preparer'),('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','reviewer') ON CONFLICT DO NOTHING");
  await client.query("INSERT INTO tax_years(id,client_id,tax_year,revision,preparation_status,canonical_snapshot) VALUES('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2025,1,'in_preparation',$1::jsonb) ON CONFLICT DO NOTHING", [JSON.stringify({ schemaVersion: "1.0.0", synthetic: true })]);
  await client.query("INSERT INTO people(id,tax_year_id,role,legal_name,address,facts) VALUES('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','taxpayer','John Sample',$1::jsonb,$2::jsonb),('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','spouse','Jane Sample',$1::jsonb,$2::jsonb) ON CONFLICT DO NOTHING", [JSON.stringify({ city: "Example City", stateProvince: "UT", country: "US" }), JSON.stringify({ synthetic: true })]);
  await client.query(
    `INSERT INTO source_form_records(tax_year_id,form_type,form_year,external_source_id,owner_role,owner_person_id,normalized_data,raw_fields,unmapped_fields,corrected,void,effective,version)
     VALUES('40000000-0000-4000-8000-000000000001','1099-NEC',2025,'synthetic:1099-nec:acme','taxpayer','50000000-0000-4000-8000-000000000001',$1::jsonb,'[]'::jsonb,'[]'::jsonb,false,false,true,1)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify({ id: "60000000-0000-4000-8000-000000000001", formType: "1099-NEC", payer: { name: "Acme Advisory LLC" }, boxes: { nonemployeeCompensation: "100000.00", federalWithholding: "2500.00", directSales: false, excessGoldenParachutePayments: null }, synthetic: true })],
  );
  await client.query("COMMIT");
  process.stdout.write("Seeded synthetic firm, users, client and 2025 tax year.\n");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { await client.end(); }
