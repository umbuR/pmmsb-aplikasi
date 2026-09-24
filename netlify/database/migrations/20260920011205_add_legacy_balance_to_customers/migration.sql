ALTER TABLE "customers" ADD COLUMN "legacy_opening" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "legacy_balance" integer DEFAULT 0 NOT NULL;