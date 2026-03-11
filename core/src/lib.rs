pub mod ai;
pub mod dropbox;
pub mod entry;
pub mod google_drive;
pub mod index;
pub mod storage;
pub mod sync;
pub mod telemetry;

use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};

use ai::{AiProvider, ChatMessage};
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
        log::info!("[silt] opening data dir: {}", data_dir.display());
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
        log::info!("[silt] ready");
        Ok(silt)
    }

    pub fn new_entry(&self, body: &str) -> Result<Entry> {
        let entry = Entry::new(body);
        log::info!("[silt] new entry id={}", entry.id);
        self.storage.write(&entry)?;
        self.index.upsert(&entry)?;
        log::debug!("[silt] entry {} written and indexed", entry.id);
        Ok(entry)
    }

    pub fn edit_entry(&self, id: &str, new_body: &str) -> Result<Entry> {
        log::info!("[silt] editing entry id={}", id);
        let entry = self.storage.update_body(id, new_body)?;
        self.index.upsert(&entry)?;
        log::debug!("[silt] entry {} updated and re-indexed", id);
        Ok(entry)
    }

    pub fn delete_entry(&self, id: &str) -> Result<()> {
        log::info!("[silt] soft-deleting entry id={}", id);
        self.storage.soft_delete(id)?;
        let entry = self.storage.read(id)?;
        self.index.upsert(&entry)?;
        log::debug!("[silt] entry {} marked deleted, index updated", id);
        Ok(())
    }

    pub fn search(&self, query: &str) -> Result<Vec<Entry>> {
        log::debug!("[silt] search query={:?}", query);
        let results = self.index.search(query)?;
        log::debug!("[silt] search returned {} results", results.len());
        Ok(results)
    }

    pub fn list_entries(&self) -> Result<Vec<Entry>> {
        let entries = self.index.list()?;
        log::debug!("[silt] list returned {} entries", entries.len());
        Ok(entries)
    }

    pub fn rebuild_index(&mut self) -> Result<()> {
        log::info!("[silt] rebuilding index from files");
        self.index.clear()?;
        let ids = self.storage.list()?;
        let mut indexed = 0u32;
        let mut skipped = 0u32;
        for id in &ids {
            match self.storage.read(id) {
                Ok(entry) => {
                    self.index.upsert(&entry)?;
                    indexed += 1;
                }
                Err(e) => {
                    log::warn!("[silt] skipping entry {} during rebuild: {}", id, e);
                    skipped += 1;
                }
            }
        }
        log::info!(
            "[silt] rebuild complete: {} indexed, {} skipped out of {} files",
            indexed,
            skipped,
            ids.len()
        );
        Ok(())
    }

    pub fn list_all_entries(&self) -> Result<Vec<Entry>> {
        let entries = self.index.list_all()?;
        log::debug!("[silt] list_all returned {} entries", entries.len());
        Ok(entries)
    }

    pub fn ai_query(&self, query: &str, provider: &dyn AiProvider) -> Result<String> {
        log::info!("[silt] ai_query: {:?}", query);
        let entries = self.index.list_all()?;
        if entries.is_empty() {
            return Err(anyhow!("No entries found. Write some entries first."));
        }

        let context = build_rag_context(&entries);
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: context,
            },
            ChatMessage {
                role: "user".to_string(),
                content: query.to_string(),
            },
        ];

        log::info!(
            "[silt] sending {} entries as context ({} chars)",
            entries.len(),
            messages.iter().map(|m| m.content.len()).sum::<usize>()
        );

        provider.chat(&messages)
    }

    pub fn entries_dir(&self) -> &Path {
        &self.entries_dir
    }
}

fn build_rag_context(entries: &[Entry]) -> String {
    let mut ctx = String::from(
        "You are an AI assistant for Silt, a personal write-only log app. \
         The user writes short markdown entries as a journal/log. \
         Below are ALL of the user's entries, in chronological order. \
         Use them to answer the user's question accurately.\n\n\
         --- ENTRIES ---\n\n",
    );

    for entry in entries {
        // Extract just the date portion from the ISO timestamp
        let date = entry.created_at.split('T').next().unwrap_or(&entry.created_at);
        ctx.push_str(&format!("[{}]\n{}\n\n", date, entry.body));
    }

    ctx.push_str("--- END ENTRIES ---");
    ctx
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
