DROP TABLE IF EXISTS Tasks;
CREATE TABLE IF NOT EXISTS Tasks (
	id TEXT PRIMARY KEY,
	stationId TEXT NOT NULL,
	title TEXT NOT NULL,
	fromTime TEXT NOT NULL,
	duration TEXT NOT NULL,
	personality TEXT NOT NULL,
	createdAt TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime'))
);
