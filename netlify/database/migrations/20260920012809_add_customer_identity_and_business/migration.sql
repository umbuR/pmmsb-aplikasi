ALTER TABLE "customers" ADD COLUMN "nik" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "business_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "business_address" text DEFAULT '' NOT NULL;