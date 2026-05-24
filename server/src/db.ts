import Database from "better-sqlite3";
import path from "path";

export interface Devbox {
  id: string;
  name: string;
  proxmox_vmid: number;
  ip: string | null;
  status: "provisioning" | "running" | "stopped" | "destroyed";
  created_at: string;
}

export interface ExposedPort {
  devbox_id: string;
  port: number;
  subdomain: string;
  created_at: string;
}

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "devbox.db");

let _db: Database.Database | null = null;

export const getDb = () => {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    migrate(_db);
  }
  return _db;
};

const migrate = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devboxes (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      proxmox_vmid INTEGER UNIQUE NOT NULL,
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'provisioning',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS exposed_ports (
      devbox_id TEXT NOT NULL,
      port INTEGER NOT NULL,
      subdomain TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (devbox_id, port),
      FOREIGN KEY (devbox_id) REFERENCES devboxes(id)
    );
  `);
};
