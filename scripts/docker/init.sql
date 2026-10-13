-- Executado uma única vez quando o contêiner do banco é criado.
CREATE ROLE clinica_owner LOGIN PASSWORD 'clinica_owner_dev';
CREATE ROLE clinica_app LOGIN PASSWORD 'clinica_app_dev' NOBYPASSRLS;
CREATE DATABASE clinica OWNER clinica_owner;
CREATE DATABASE clinica_test OWNER clinica_owner;
CREATE DATABASE clinica_e2e OWNER clinica_owner;
\c clinica
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT CONNECT ON DATABASE clinica TO clinica_app;
\c clinica_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT CONNECT ON DATABASE clinica_test TO clinica_app;
\c clinica_e2e
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT CONNECT ON DATABASE clinica_e2e TO clinica_app;
