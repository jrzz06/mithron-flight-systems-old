-- GST invoice serial tracking and immutable invoice storage

CREATE SEQUENCE IF NOT EXISTS invoice_serial_seq START WITH 1;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  serial_number bigint NOT NULL UNIQUE,
  financial_year text NOT NULL,
  invoice_number text NOT NULL UNIQUE,
  invoice_html text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON invoices(order_id);
CREATE INDEX IF NOT EXISTS invoices_generated_at_idx ON invoices(generated_at DESC);

CREATE OR REPLACE FUNCTION generate_invoice_serial()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('invoice_serial_seq');
$$;

REVOKE ALL ON FUNCTION generate_invoice_serial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_invoice_serial() TO service_role;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_service_role_all ON invoices;
CREATE POLICY invoices_service_role_all ON invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
