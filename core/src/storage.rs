use anyhow::Result;
use std::fs;
use std::path::{Path, PathBuf};

use crate::entry::Entry;

pub struct FileStorage {
    dir: PathBuf,
}

impl FileStorage {
    pub fn new(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir)?;
        Ok(Self {
            dir: dir.to_path_buf(),
        })
    }

    fn entry_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.md"))
    }

    pub fn write(&self, entry: &Entry) -> Result<()> {
        let path = self.entry_path(&entry.id);
        fs::write(&path, entry.to_markdown())?;
        Ok(())
    }

    pub fn read(&self, id: &str) -> Result<Entry> {
        let path = self.entry_path(id);
        let text = fs::read_to_string(&path)?;
        Entry::from_markdown(&text)
    }

    pub fn list(&self) -> Result<Vec<String>> {
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    ids.push(stem.to_string());
                }
            }
        }
        ids.sort();
        ids.reverse(); // newest first (ULIDs sort chronologically)
        Ok(ids)
    }

    pub fn update_body(&self, id: &str, new_body: &str) -> Result<Entry> {
        let mut entry = self.read(id)?;
        entry.body = new_body.to_string();
        self.write(&entry)?;
        Ok(entry)
    }

    pub fn soft_delete(&self, id: &str) -> Result<()> {
        let mut entry = self.read(id)?;
        entry.deleted_at = Some(chrono::Utc::now().to_rfc3339());
        self.write(&entry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entry::Entry;

    #[test]
    fn write_read_list_delete() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FileStorage::new(dir.path()).unwrap();

        let entry = Entry::new("test entry");
        let id = entry.id.clone();
        storage.write(&entry).unwrap();

        let read = storage.read(&id).unwrap();
        assert_eq!(read.body, "test entry");
        assert_eq!(storage.list().unwrap().len(), 1);

        storage.soft_delete(&id).unwrap();
        let deleted = storage.read(&id).unwrap();
        assert!(deleted.is_deleted());
    }
}
