CREATE TABLE ag04_probe (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value text NOT NULL);
INSERT INTO ag04_probe(value) VALUES ('synthetic-fixture-one'), ('synthetic-fixture-two');
CREATE TABLE ag04_receipts (id integer PRIMARY KEY, hash text NOT NULL);
INSERT INTO ag04_receipts VALUES (1, 'fixture-receipt');
