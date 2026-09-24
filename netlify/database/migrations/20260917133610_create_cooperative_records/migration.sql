CREATE TABLE "customers" (
	"id" serial PRIMARY KEY,
	"member_number" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"collector" text NOT NULL,
	"resort" text DEFAULT 'Resort Utama' NOT NULL,
	"joined_at" date NOT NULL,
	"status" text DEFAULT 'Aktif' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_targets" (
	"id" serial PRIMARY KEY,
	"report_date" date NOT NULL UNIQUE,
	"resort" text NOT NULL,
	"collection_target" integer NOT NULL,
	"drop_target" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY,
	"customer_id" integer NOT NULL,
	"drop_date" date NOT NULL,
	"principal" integer NOT NULL,
	"total_due" integer NOT NULL,
	"due_date" date NOT NULL,
	"approval" text DEFAULT 'Disetujui' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY,
	"loan_id" integer NOT NULL,
	"payment_date" date NOT NULL,
	"amount" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_loans_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id");