CREATE TABLE `reader_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reader_reviews` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`id` text NOT NULL,
	`rating` integer NOT NULL,
	`review` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_reader_reviews_book_updated` ON `reader_reviews` (`book_id`,`updated_at`);