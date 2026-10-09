CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertId` varchar(64) NOT NULL,
	`level` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
	`title` varchar(128) NOT NULL,
	`message` text NOT NULL,
	`acknowledged` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `alerts_alertId_unique` UNIQUE(`alertId`)
);
--> statement-breakpoint
CREATE TABLE `detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackingId` varchar(64) NOT NULL,
	`vehicleId` varchar(64),
	`confidence` float NOT NULL,
	`distance` float,
	`visibility` float,
	`sensorStatus` varchar(128),
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `detections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `environment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visibility` float NOT NULL,
	`temperature` float,
	`humidity` float,
	`weather` varchar(128),
	`wind` float,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `environment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `near_misses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`vehicleId` varchar(64) NOT NULL,
	`objectLabel` varchar(128) NOT NULL,
	`distance` float,
	`ttc` float,
	`speed` float,
	`visibility` float,
	`riskScore` int,
	`zone` varchar(128),
	`detail` text,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `near_misses_id` PRIMARY KEY(`id`),
	CONSTRAINT `near_misses_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `objects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackingId` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`objectType` varchar(64) NOT NULL,
	`confidence` float NOT NULL,
	`distance` float,
	`relativeSpeed` float,
	`direction` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objects_id` PRIMARY KEY(`id`),
	CONSTRAINT `objects_trackingId_unique` UNIQUE(`trackingId`)
);
--> statement-breakpoint
CREATE TABLE `risk_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` varchar(64) NOT NULL,
	`trackingId` varchar(64) NOT NULL,
	`riskLevel` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
	`riskScore` int NOT NULL,
	`ttc` float,
	`zoneViolation` boolean NOT NULL DEFAULT false,
	`reason` text,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` varchar(64) NOT NULL,
	`status` enum('ACTIVE','IDLE','OFFLINE') NOT NULL DEFAULT 'ACTIVE',
	`speed` float NOT NULL DEFAULT 0,
	`direction` varchar(32),
	`zone` varchar(128),
	`safetyScore` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`zoneType` varchar(64) NOT NULL,
	`restricted` boolean NOT NULL DEFAULT false,
	`geometry` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zones_id` PRIMARY KEY(`id`),
	CONSTRAINT `zones_name_unique` UNIQUE(`name`)
);
