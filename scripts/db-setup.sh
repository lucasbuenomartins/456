#!/usr/bin/env bash
# Cria os papéis e bancos de desenvolvimento/teste no PostgreSQL local.
# - clinica_owner: dono das tabelas; usado para migrações e pelas rotas privilegiadas
#   (autenticação e painel do SaaS). Por ser dono, não é filtrado por RLS.
# - clinica_app: usado pela operação das clínicas. Sem BYPASSRLS: cada consulta só
#   enxerga a empresa definida em app.tenant_id.
set -euo pipefail
PSQL=${PSQL:-"sudo -u postgres psql -v ON_ERROR_STOP=1"}
OWNER_PASSWORD=${OWNER_PASSWORD:-clinica_owner_dev}
APP_PASSWORD=${APP_PASSWORD:-clinica_app_dev}

$PSQL <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinica_owner') THEN
    CREATE ROLE clinica_owner LOGIN PASSWORD '${OWNER_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinica_app') THEN
    CREATE ROLE clinica_app LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS;
  END IF;
END
\$\$;
SQL

for db in clinica clinica_test clinica_e2e; do
  if ! $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    $PSQL -c "CREATE DATABASE $db OWNER clinica_owner"
  fi
  $PSQL -d "$db" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm" -c "GRANT CONNECT ON DATABASE $db TO clinica_app"
done
echo "Bancos prontos: clinica, clinica_test e clinica_e2e"
