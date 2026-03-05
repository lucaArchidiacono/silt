pub mod ai;
pub mod entry;
pub mod index;
pub mod storage;
pub mod sync;

use anyhow::Result;
use std::path::{Path, PathBuf};

use entry::Entry;
use index::Index;
use storage::FileStorage;

pub struct Silt {
    storage: FileStorage,
    index: Index,
    entries_dir: PathBuf,
}

impl Silt {
    pub fn open(data_dir: &Path) -> Result<Self> {
        let entries_dir = data_dir.join("entries");
        let index_path = data_dir.join("index.db");

        let storage = FileStorage::new(&entries_dir)?;
        let index = Index::open(&index_path)?;

        let mut silt = Self {
            storage,
            index,
            entries_dir,
        };
        silt.rebuild_index()?;
        Ok(silt)
    }

    pub fn new_entry(&self, body: &str) -> Result<Entry> {
        let entry = Entry::new(body);
        self.storage.write(&entry)?;
        self.index.upsert(&entry)?;
        Ok(entry)
    }

    pub fn edit_entry(&self, id: &str, new_body: &str) -> Result<Entry> {
        let entry = self.storage.update_body(id, new_body)?;
        self.index.upsert(&entry)?;
        Ok(entry)
    }

    pub fn delete_entry(&self, id: &str) -> Result<()> {
        self.storage.soft_delete(id)?;
        let entry = self.storage.read(id)?;
        self.index.upsert(&entry)?;
        Ok(())
    }

    pub fn search(&self, query: &str) -> Result<Vec<Entry>> {
        self.index.search(query)
    }

    pub fn list_entries(&self) -> Result<Vec<Entry>> {
        self.index.list()
    }

    pub fn rebuild_index(&mut self) -> Result<()> {
        self.index.clear()?;
        let ids = self.storage.list()?;
        for id in ids {
            if let Ok(entry) = self.storage.read(&id) {
                self.index.upsert(&entry)?;
            }
        }
        Ok(())
    }

    pub fn entries_dir(&self) -> &Path {
        &self.entries_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_lifecycle() {
        let dir = tempfile::tempdir().unwrap();
        let mut silt = Silt::open(dir.path()).unwrap();

        // Write entries
        let e1 = silt.new_entry("first thought").unwrap();
        silt.new_entry("second thought about rust").unwrap();
        assert_eq!(silt.list_entries().unwrap().len(), 2);

        // Search
        assert_eq!(silt.search("rust").unwrap().len(), 1);

        // Delete
        silt.delete_entry(&e1.id).unwrap();
        assert_eq!(silt.list_entries().unwrap().len(), 1);

        // Edit
        let e2 = silt.list_entries().unwrap().into_iter().next().unwrap();
        silt.edit_entry(&e2.id, "edited thought").unwrap();
        let edited = silt.search("edited").unwrap();
        assert_eq!(edited.len(), 1);
        assert_eq!(edited[0].body, "edited thought");

        // Rebuild index from files
        silt.rebuild_index().unwrap();
        assert_eq!(silt.list_entries().unwrap().len(), 1);
    }
}
