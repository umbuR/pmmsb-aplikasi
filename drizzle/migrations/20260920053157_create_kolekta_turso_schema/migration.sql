CREATE TABLE `cash_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`report_date` text NOT NULL UNIQUE,
	`kasbon` integer DEFAULT 0 NOT NULL,
	`titipan` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classification_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`loan_id` integer NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'otomatis' NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT `fk_classification_logs_loan_id_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`member_number` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`nik` text DEFAULT '' NOT NULL,
	`business_type` text DEFAULT '' NOT NULL,
	`business_address` text DEFAULT '' NOT NULL,
	`collector` text NOT NULL,
	`resort` text DEFAULT 'Resort Utama' NOT NULL,
	`joined_at` text NOT NULL,
	`status` text DEFAULT 'Aktif' NOT NULL,
	`legacy_opening` integer DEFAULT 0 NOT NULL,
	`legacy_balance` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`report_date` text NOT NULL UNIQUE,
	`resort` text NOT NULL,
	`collection_target` integer NOT NULL,
	`drop_target` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`expense_date` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`customer_id` integer NOT NULL,
	`kind` text DEFAULT 'drop' NOT NULL,
	`drop_date` text NOT NULL,
	`principal` integer NOT NULL,
	`total_due` integer NOT NULL,
	`due_date` text NOT NULL,
	`approval` text DEFAULT 'Disetujui' NOT NULL,
	`classification` text DEFAULT 'PB' NOT NULL,
	`classification_source` text DEFAULT 'otomatis' NOT NULL,
	`classified_at` text,
	`closed_period` text,
	`last_payment_date` text,
	`recovered_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT `fk_loans_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
	CONSTRAINT "loans_classification_valid" CHECK("classification" in ('PB', 'L', 'CM', 'Macet'))
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`loan_id` integer NOT NULL,
	`payment_date` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT `fk_payments_loan_id_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`)
);
