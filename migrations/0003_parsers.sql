CREATE TABLE `parsers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `devices` ADD `parser_id` text REFERENCES parsers(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `parsed` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `parse_error` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `parsed_at` integer;