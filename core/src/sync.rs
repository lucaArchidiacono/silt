use anyhow::Result;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum SyncStatus {
    Idle,
    Syncing,
    Error(String),
}

pub trait SyncAdapter {
    fn push(&self, changed: &[PathBuf]) -> Result<()>;
    fn pull(&self) -> Result<Vec<PathBuf>>;
    fn status(&self) -> SyncStatus;
}
