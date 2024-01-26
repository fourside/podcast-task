CREATE TABLE `Tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`stationId` text NOT NULL,
	`title` text NOT NULL,
	`fromTime` text NOT NULL,
	`duration` text NOT NULL,
	`personality` text NOT NULL,
	`createdAt` text DEFAULT (DATETIME('now', 'localtime')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `` ON `Tasks` (`title`,`fromTime`);