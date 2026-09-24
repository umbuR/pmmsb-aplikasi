CREATE TABLE "classification_logs" (
	"id" serial PRIMARY KEY,
	"loan_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'otomatis' NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "classification" text DEFAULT 'PB' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "classification_source" text DEFAULT 'otomatis' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "classified_at" date;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "closed_period" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "last_payment_date" date;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "recovered_at" date;--> statement-breakpoint
ALTER TABLE "classification_logs" ADD CONSTRAINT "classification_logs_loan_id_loans_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id");--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_classification_valid" CHECK ("classification" in ('PB', 'L', 'CM', 'Macet'));--> statement-breakpoint
-- Status awal untuk tagihan yang sudah tercatat sebelum klasifikasi ada.
-- Aturannya sama dengan yang dipakai aplikasi: tagihan lunas menjadi 'L',
-- dropan bulan berjalan 'PB', satu bulan sebelumnya 'L', dua bulan 'CM',
-- tiga bulan atau lebih 'Macet'. Tagihan lama yang statusnya sudah menghitung
-- umur dropan ditandai periodenya sebagai sudah ditutup supaya tutup bulan
-- berikutnya tidak menurunkannya dua kali; dropan bulan berjalan dibiarkan
-- terbuka agar tetap naik PB -> L pada tanggal 30.
UPDATE "loans" AS l SET
	"last_payment_date" = x."last_date",
	"classification" = CASE
		WHEN x."paid" >= l."total_due" THEN 'L'
		WHEN x."umur" <= 0 THEN 'PB'
		WHEN x."umur" = 1 THEN 'L'
		WHEN x."umur" = 2 THEN 'CM'
		ELSE 'Macet'
	END,
	"classification_source" = 'otomatis',
	"classified_at" = x."today",
	"closed_period" = CASE WHEN x."umur" >= 1 THEN to_char(x."today", 'YYYY-MM') ELSE NULL END,
	"recovered_at" = CASE WHEN x."paid" >= l."total_due" AND x."umur" >= 2 THEN x."last_date" ELSE NULL END
FROM (
	SELECT
		l2."id",
		(SELECT COALESCE(SUM(p."amount"), 0) FROM "payments" p WHERE p."loan_id" = l2."id") AS "paid",
		(SELECT MAX(p."payment_date") FROM "payments" p WHERE p."loan_id" = l2."id") AS "last_date",
		((date_part('year', d."today") - date_part('year', l2."drop_date")) * 12
			+ (date_part('month', d."today") - date_part('month', l2."drop_date")))::int AS "umur",
		d."today"
	FROM "loans" l2
	CROSS JOIN (SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS "today") d
) x
WHERE l."id" = x."id";
