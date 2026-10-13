CREATE TABLE `device_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`time` integer NOT NULL,
	`severity` text NOT NULL,
	`info` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_events_device_time_unique` ON `device_events` (`device_id`,`time`);--> statement-breakpoint
CREATE INDEX `device_events_time_idx` ON `device_events` (`time`);