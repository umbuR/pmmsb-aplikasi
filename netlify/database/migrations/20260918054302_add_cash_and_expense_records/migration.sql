CREATE TABLE "cash_books" (
	"id" serial PRIMARY KEY,
	"report_date" date NOT NULL UNIQUE,
	"kasbon" integer DEFAULT 0 NOT NULL,
	"titipan" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY,
	"expense_date" date NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
