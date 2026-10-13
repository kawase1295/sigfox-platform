CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`time` integer NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`accuracy` real,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_message_source_unique` ON `locations` (`message_id`,`source`);--> statement-breakpoint
CREATE INDEX `locations_device_time_idx` ON `locations` (`device_id`,"time" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `locations_time_idx` ON `locations` (`time`);--> statement-breakpoint
ALTER TABLE `messages` ADD `lqi` text;--> statement-breakpoint
CREATE INDEX `messages_time_idx` ON `messages` (`time`);