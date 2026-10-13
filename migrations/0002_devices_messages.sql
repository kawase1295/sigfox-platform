CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_message_at` integer
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`time` integer NOT NULL,
	`seq_number` integer NOT NULL,
	`data` text NOT NULL,
	`receptions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_device_seq_time_unique` ON `messages` (`device_id`,`seq_number`,`time`);--> statement-breakpoint
CREATE INDEX `messages_device_time_idx` ON `messages` (`device_id`,"time" desc,"id" desc);