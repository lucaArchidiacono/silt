use std::cell::RefCell;
use std::fs;
use std::path::PathBuf;

use napi_derive::napi;
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
