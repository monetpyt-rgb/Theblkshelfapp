CREATE TABLE `reader_dismissed_releases` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`dismissed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`)
);
--> statement-breakpoint
CREATE TABLE `reader_favorite_authors` (
	`user_id` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `author_id`)
);
