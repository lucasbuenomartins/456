-- E-mail deixa de ser canal de contato com o cliente. Registros antigos são preservados
-- (histórico de consentimento), mas novos só aceitam WhatsApp e SMS.
ALTER TABLE client_consents DROP CONSTRAINT client_consents_channel_ck;
--> statement-breakpoint
ALTER TABLE client_consents ADD CONSTRAINT client_consents_channel_ck CHECK (channel IN ('whatsapp', 'sms')) NOT VALID;
