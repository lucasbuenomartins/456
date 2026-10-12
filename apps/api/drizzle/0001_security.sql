-- Isolamento entre empresas (multi-tenant) com Row Level Security.
--
-- A aplicação das clínicas conecta como "clinica_app" e, em cada transação,
-- define app.tenant_id e app.user_id (set_config(..., true) = vale só na transação).
-- Sem essas variáveis nenhuma linha de dados de empresa é visível.
-- Rotas de autenticação e o painel do SaaS usam a conexão do dono das tabelas.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Chaves compostas impedem vincular registros a unidades de outra empresa.
ALTER TABLE membership_roles
  ADD CONSTRAINT membership_roles_unit_same_tenant_fk
  FOREIGN KEY (tenant_id, unit_id) REFERENCES units (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE clients
  ADD CONSTRAINT clients_unit_same_tenant_fk
  FOREIGN KEY (tenant_id, preferred_unit_id) REFERENCES units (tenant_id, id);
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_tenant_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE membership_roles
  ADD CONSTRAINT membership_roles_membership_same_tenant_fk
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE roles ADD CONSTRAINT roles_tenant_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE membership_roles
  ADD CONSTRAINT membership_roles_role_same_tenant_fk
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE clients ADD CONSTRAINT clients_tenant_id_uq UNIQUE (tenant_id, id);
--> statement-breakpoint
ALTER TABLE client_consents
  ADD CONSTRAINT client_consents_client_same_tenant_fk
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint

-- Valores permitidos
ALTER TABLE tenants ADD CONSTRAINT tenants_status_ck CHECK (status IN ('trial', 'active', 'suspended', 'cancelled'));
--> statement-breakpoint
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_status_ck CHECK (status IN ('active', 'trial', 'read_only', 'disabled'));
--> statement-breakpoint
ALTER TABLE clients ADD CONSTRAINT clients_status_ck CHECK (status IN ('active', 'inactive'));
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_status_ck CHECK (status IN ('active', 'disabled'));
--> statement-breakpoint
ALTER TABLE tour_progress ADD CONSTRAINT tour_progress_status_ck CHECK (status IN ('seen', 'completed', 'dismissed'));
--> statement-breakpoint
ALTER TABLE news_receipts ADD CONSTRAINT news_receipts_action_ck CHECK (action IN ('seen', 'opened', 'later', 'dismissed'));
--> statement-breakpoint
ALTER TABLE client_consents ADD CONSTRAINT client_consents_channel_ck CHECK (channel IN ('whatsapp', 'email', 'sms'));
--> statement-breakpoint

-- Privilégios do papel da aplicação ---------------------------------------
GRANT USAGE ON SCHEMA public TO clinica_app;
--> statement-breakpoint
GRANT SELECT ON plans, news TO clinica_app;
--> statement-breakpoint
GRANT SELECT ON tenants, tenant_modules, tenant_history TO clinica_app;
--> statement-breakpoint
-- A empresa só altera os próprios dados cadastrais. Situação, plano e módulos: apenas o painel do SaaS.
GRANT UPDATE (name, legal_name, document, phone, email, updated_at) ON tenants TO clinica_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON units, memberships, roles, membership_roles, invites, clients, idempotency_keys TO clinica_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tour_progress, news_receipts TO clinica_app;
--> statement-breakpoint
-- Históricos são somente inclusão (append-only) para a aplicação.
GRANT SELECT, INSERT ON client_consents, audit_events TO clinica_app;
--> statement-breakpoint
GRANT SELECT ON users TO clinica_app;
--> statement-breakpoint
GRANT UPDATE (name, password_hash) ON users TO clinica_app;
--> statement-breakpoint

-- Políticas de RLS ------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_modules USING (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_history USING (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON units USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON roles USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON membership_roles USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invites USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON clients USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE client_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON client_consents USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_events USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON idempotency_keys USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint

-- Dados por usuário: cada pessoa só vê o próprio progresso de tours e novidades.
ALTER TABLE tour_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_rows ON tour_progress
  USING (realm = 'clinic' AND user_id = app_user_id())
  WITH CHECK (realm = 'clinic' AND user_id = app_user_id());
--> statement-breakpoint
ALTER TABLE news_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_rows ON news_receipts USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint

-- Usuários: visíveis apenas se fizerem parte da empresa atual (ou se for o próprio usuário).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY same_tenant_read ON users FOR SELECT USING (
  id = app_user_id()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.tenant_id = app_tenant_id())
);
--> statement-breakpoint
CREATE POLICY self_update ON users FOR UPDATE USING (id = app_user_id()) WITH CHECK (id = app_user_id());
--> statement-breakpoint

-- Somente publicadas são visíveis para a aplicação.
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY published_only ON news FOR SELECT USING (status = 'published' AND published_at <= now());
--> statement-breakpoint
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY readable ON plans FOR SELECT USING (true);
