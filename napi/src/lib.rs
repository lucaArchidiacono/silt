use std::cell::RefCell;
use std::fs;
use std::path::PathBuf;

use napi::bindgen_prelude::AsyncTask;
use napi::Task;
use napi_derive::napi;
use silt_core::dropbox::DropboxSync;
use silt_core::sync::SyncAdapter;
use silt_core::Silt;

// --- Entry data transfer object ---

#[napi(object)]
pub struct JsEntry {
    pub id: String,
    pub body: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

impl From<silt_core::entry::Entry> for JsEntry {
    fn from(e: silt_core::entry::Entry) -> Self {
        Self {
            id: e.id,
            body: e.body,
            created_at: e.created_at,
            deleted_at: e.deleted_at,
        }
    }
}

// --- Silt session (stateful) ---

#[napi]
pub struct SiltSession {
    inner: RefCell<Silt>,
}

fn data_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| ".".into()).join(".silt")
}

#[napi]
impl SiltSession {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        let silt = Silt::open(&data_dir())?;
        Ok(Self {
            inner: RefCell::new(silt),
        })
    }

    #[napi]
    pub fn new_entry(&self, body: String) -> napi::Result<JsEntry> {
        let entry = self.inner.borrow().new_entry(&body)?;
        Ok(entry.into())
    }

    #[napi]
    pub fn list_entries(&self) -> napi::Result<Vec<JsEntry>> {
        let entries = self.inner.borrow().list_entries()?;
        Ok(entries.into_iter().map(Into::into).collect())
    }

    #[napi]
    pub fn search(&self, query: String) -> napi::Result<Vec<JsEntry>> {
        let entries = self.inner.borrow().search(&query)?;
        Ok(entries.into_iter().map(Into::into).collect())
    }

    #[napi]
    pub fn edit_entry(&self, id: String, body: String) -> napi::Result<JsEntry> {
        let entry = self.inner.borrow().edit_entry(&id, &body)?;
        Ok(entry.into())
    }

    #[napi]
    pub fn delete_entry(&self, id: String) -> napi::Result<()> {
        self.inner.borrow().delete_entry(&id)?;
        Ok(())
    }

    #[napi]
    pub fn rebuild_index(&self) -> napi::Result<()> {
        self.inner.borrow_mut().rebuild_index()?;
        Ok(())
    }

    #[napi]
    pub fn entries_dir(&self) -> String {
        self.inner.borrow().entries_dir().to_string_lossy().into()
    }

    #[napi]
    pub fn sync_push(&self) -> napi::Result<u32> {
        let silt = self.inner.borrow();
        let sync = make_dropbox_sync(silt.entries_dir())?;
        let original_token = sync.current_token();

        let paths: Vec<PathBuf> = std::fs::read_dir(silt.entries_dir())
            .map_err(anyhow::Error::from)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
            .collect();

        let count = paths.len() as u32;
        sync.push(&paths).map_err(anyhow::Error::from)?;
        save_refreshed_token(&sync, &original_token);
        Ok(count)
    }

    #[napi]
    pub fn sync_pull(&self) -> napi::Result<u32> {
        let sync = {
            let silt = self.inner.borrow();
            make_dropbox_sync(silt.entries_dir())?
        };
        let original_token = sync.current_token();

        let pulled = sync.pull().map_err(anyhow::Error::from)?;
        save_refreshed_token(&sync, &original_token);

        if !pulled.is_empty() {
            self.inner.borrow_mut().rebuild_index()?;
        }
        Ok(pulled.len() as u32)
    }
}

// --- Async sync tasks ---

pub struct SyncPushTask {
    token: String,
    refresh_token: Option<String>,
    entries_dir: PathBuf,
    file_paths: Vec<PathBuf>,
}

impl Task for SyncPushTask {
    type Output = u32;
    type JsValue = u32;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let sync = DropboxSync::new(self.token.clone(), &self.entries_dir);
        let sync = if let Some(ref refresh) = self.refresh_token {
            sync.with_refresh(refresh.clone(), DROPBOX_APP_KEY.to_string())
        } else {
            sync
        };

        let original_token = sync.current_token();
        let count = self.file_paths.len() as u32;
        sync.push(&self.file_paths)
            .map_err(|e| napi::Error::from_reason(format!("{e}")))?;
        save_refreshed_token(&sync, &original_token);
        Ok(count)
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct SyncPullTask {
    token: String,
    refresh_token: Option<String>,
    entries_dir: PathBuf,
}

impl Task for SyncPullTask {
    type Output = u32;
    type JsValue = u32;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let sync = DropboxSync::new(self.token.clone(), &self.entries_dir);
        let sync = if let Some(ref refresh) = self.refresh_token {
            sync.with_refresh(refresh.clone(), DROPBOX_APP_KEY.to_string())
        } else {
            sync
        };

        let original_token = sync.current_token();
        let pulled = sync.pull()
            .map_err(|e| napi::Error::from_reason(format!("{e}")))?;
        save_refreshed_token(&sync, &original_token);
        Ok(pulled.len() as u32)
    }

    fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

/// Read Dropbox credentials from settings. Returns (token, refresh_token) or error.
fn get_dropbox_credentials() -> napi::Result<(String, Option<String>)> {
    let settings = read_settings();
    let token = settings
        .get("dropbox_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| napi::Error::from_reason("No Dropbox token configured"))?
        .to_string();
    let refresh = settings
        .get("dropbox_refresh_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Ok((token, refresh))
}

#[napi]
pub fn sync_push_entries(ids: Vec<String>) -> napi::Result<AsyncTask<SyncPushTask>> {
    let (token, refresh_token) = get_dropbox_credentials()?;
    let entries_dir = data_dir().join("entries");
    let file_paths: Vec<PathBuf> = ids
        .iter()
        .map(|id| entries_dir.join(format!("{id}.md")))
        .filter(|p| p.exists())
        .collect();
    Ok(AsyncTask::new(SyncPushTask {
        token,
        refresh_token,
        entries_dir,
        file_paths,
    }))
}

#[napi]
pub fn sync_pull_async() -> napi::Result<AsyncTask<SyncPullTask>> {
    let (token, refresh_token) = get_dropbox_credentials()?;
    let entries_dir = data_dir().join("entries");
    Ok(AsyncTask::new(SyncPullTask {
        token,
        refresh_token,
        entries_dir,
    }))
}

// --- Dropbox sync helpers ---

const DROPBOX_APP_KEY: &str = "yo99v8km1tmfhjj";

fn make_dropbox_sync(entries_dir: &std::path::Path) -> napi::Result<DropboxSync> {
    let settings = read_settings();
    let token = settings
        .get("dropbox_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| napi::Error::from_reason("No Dropbox token configured — connect Dropbox first"))?
        .to_string();

    let sync = DropboxSync::new(token, entries_dir);

    let refresh = settings
        .get("dropbox_refresh_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if let Some(refresh) = refresh {
        Ok(sync.with_refresh(refresh, DROPBOX_APP_KEY.to_string()))
    } else {
        Ok(sync)
    }
}

fn save_refreshed_token(sync: &DropboxSync, original_token: &str) {
    let current = sync.current_token();
    if current != original_token {
        let mut settings = read_settings();
        settings.insert("dropbox_token".into(), serde_json::Value::String(current));
        let _ = write_settings(&settings);
    }
}

// --- Config (standalone, same settings.json as CLI) ---

fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

fn read_settings() -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(settings: &serde_json::Map<String, serde_json::Value>) -> anyhow::Result<()> {
    let dir = data_dir();
    fs::create_dir_all(&dir)?;
    fs::write(settings_path(), serde_json::to_string_pretty(settings)?)?;
    Ok(())
}

#[napi]
pub fn get_config(key: String) -> Option<String> {
    read_settings()
        .get(&key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

#[napi]
pub fn set_config(key: String, value: String) -> napi::Result<()> {
    let mut settings = read_settings();
    settings.insert(key, serde_json::Value::String(value));
    write_settings(&settings)?;
    Ok(())
}
