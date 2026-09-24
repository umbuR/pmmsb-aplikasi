ALTER TABLE "loans" ADD COLUMN "kind" text DEFAULT 'drop' NOT NULL;--> statement-breakpoint
-- Saldo nasabah lama yang masih tercatat di master nasabah diangkat menjadi
-- transaksi resmi berjenis 'lama'. Sejak migrasi ini, sisa tagihannya hidup di
-- tabel loans sehingga setiap angsuran berikutnya otomatis mengurangi saldo itu
-- dan ikut terhitung di Angsuran, Storting, Tunai, dan Perkembangan.
--
-- principal disamakan dengan total_due: uangnya sudah keluar di pembukuan lama,
-- jadi tidak ada drop kas baru dan porsi jasanya tidak diakui ulang sebagai laba.
-- Jatuh tempo diberi tenggang 30 hari supaya tunggakan lama tidak langsung
-- berstatus Macet sebelum kolektor sempat menagih.
INSERT INTO "loans" ("customer_id", "kind", "drop_date", "principal", "total_due", "due_date", "approval")
SELECT c."id", 'lama', c."joined_at", c."legacy_balance", c."legacy_balance",
       GREATEST(c."joined_at", CURRENT_DATE) + 30, 'Disetujui'
FROM "customers" c
WHERE c."legacy_balance" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "loans" l WHERE l."customer_id" = c."id" AND l."kind" = 'lama'
  );
