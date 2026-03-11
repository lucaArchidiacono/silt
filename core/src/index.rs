use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;

use crate::entry::Entry;

pub struct Index {
    conn: Connection,
}

impl Index {
    pub fn open(path: &Path) -> Result<Self> {
        log::debug!("[index] opening SQLite db: {}", path.display());
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                body,
                content=entries,
                content_rowid=rowid
            );
            CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
                INSERT INTO entries_fts(rowid, body) VALUES (new.rowid, new.body);
            END;
            CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, body) VALUES('delete', old.rowid, old.body);
            END;
            CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, body) VALUES('delete', old.rowid, old.body);
                INSERT INTO entries_fts(rowid, body) VALUES (new.rowid, new.body);
            END;",
        )?;
        Ok(Self { conn })
    }

    pub fn upsert(&self, entry: &Entry) -> Result<()> {
        log::debug!("[index] upsert id={} deleted={}", entry.id, entry.deleted_at.is_some());
        self.conn.execute(
            "INSERT INTO entries (id, body, created_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                body = excluded.body,
                deleted_at = excluded.deleted_at",
            (&entry.id, &entry.body, &entry.created_at, &entry.deleted_at),
        )?;
        Ok(())
    }

    pub fn remove(&self, id: &str) -> Result<()> {
        log::debug!("[index] removing id={}", id);
        self.conn
            .execute("DELETE FROM entries WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn search(&self, query: &str) -> Result<Vec<Entry>> {
        log::debug!("[index] FTS search for {:?}", query);
        // Add * to each term for prefix matching ("gro" matches "groceries")
        let fts_query: String = query
            .split_whitespace()
            .map(|term| format!("{term}*"))
            .collect::<Vec<_>>()
            .join(" ");

        let mut stmt = self.conn.prepare(
            "SELECT e.id, e.body, e.created_at, e.deleted_at
             FROM entries_fts f
             JOIN entries e ON e.rowid = f.rowid
             WHERE entries_fts MATCH ?1
             AND e.deleted_at IS NULL
             ORDER BY rank
             LIMIT 50",
        )?;
        let entries = stmt
            .query_map([&fts_query], |row| {
                Ok(Entry {
                    id: row.get(0)?,
                    body: row.get(1)?,
                    created_at: row.get(2)?,
                    deleted_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(entries)
    }

    pub fn list(&self) -> Result<Vec<Entry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, body, created_at, deleted_at
             FROM entries
             WHERE deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT 200",
        )?;
        let entries = stmt
            .query_map([], |row| {
                Ok(Entry {
                    id: row.get(0)?,
                    body: row.get(1)?,
                    created_at: row.get(2)?,
                    deleted_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(entries)
    }

    pub fn list_all(&self) -> Result<Vec<Entry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, body, created_at, deleted_at
             FROM entries
             WHERE deleted_at IS NULL
             ORDER BY created_at ASC",
        )?;
        let entries = stmt
            .query_map([], |row| {
                Ok(Entry {
                    id: row.get(0)?,
                    body: row.get(1)?,
                    created_at: row.get(2)?,
                    deleted_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(entries)
    }

    pub fn clear(&self) -> Result<()> {
        log::debug!("[index] clearing all entries");
        self.conn.execute("DELETE FROM entries", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entry::Entry;

    fn test_index() -> (Index, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let idx = Index::open(&dir.path().join("index.db")).unwrap();
        (idx, dir)
    }

    #[test]
    fn upsert_list_search() {
        let (idx, _dir) = test_index();
        let entry = Entry::new("buy groceries tomorrow");
        idx.upsert(&entry).unwrap();

        assert_eq!(idx.list().unwrap().len(), 1);
        assert_eq!(idx.search("groceries").unwrap().len(), 1);
        assert_eq!(idx.search("nonexistent").unwrap().len(), 0);
    }

    #[test]
    fn deleted_entries_excluded_from_search() {
        let (idx, _dir) = test_index();
        let mut entry = Entry::new("secret note");
        idx.upsert(&entry).unwrap();

        entry.deleted_at = Some("2025-01-01T00:00:00Z".to_string());
        idx.upsert(&entry).unwrap();

        assert_eq!(idx.search("secret").unwrap().len(), 0);
        assert_eq!(idx.list().unwrap().len(), 0);
    }
}
