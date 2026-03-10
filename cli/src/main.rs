use anyhow::{anyhow, Result};
use serde::Serialize;
use silt_core::entry::Entry;
use silt_core::sync::SyncAdapter;
use silt_core::Silt;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
struct EntryJson {
    id: String,
    body: String,
    created_at: String,
    deleted_at: Option<String>,
}

impl From<Entry> for EntryJson {
    fn from(e: Entry) -> Self {
        Self {
            id: e.id,
            body: e.body,
            created_at: e.created_at,
            deleted_at: e.deleted_at,
        }
    }
}

fn data_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| ".".into()).join(".silt")
}

fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

fn read_settings() -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(settings: &serde_json::Map<String, serde_json::Value>) -> Result<()> {
    let dir = data_dir();
    fs::create_dir_all(&dir)?;
    fs::write(settings_path(), serde_json::to_string_pretty(settings)?)?;
    Ok(())
}

fn get_dropbox_token() -> Result<String> {
    // Settings file first, then env var fallback
    if let Some(serde_json::Value::String(token)) = read_settings().get("dropbox_token") {
        if !token.is_empty() {
            return Ok(token.clone());
        }
    }
    env::var("SILT_DROPBOX_TOKEN")
        .map_err(|_| anyhow!("no Dropbox token configured. Use `silt config set dropbox_token <token>` or set SILT_DROPBOX_TOKEN"))
}

fn get_dropbox_refresh_token() -> Option<String> {
    read_settings()
        .get("dropbox_refresh_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

const DROPBOX_APP_KEY: &str = "yo99v8km1tmfhjj";

fn make_dropbox_sync(token: String, entries_dir: &std::path::Path) -> silt_core::dropbox::DropboxSync {
    let sync = silt_core::dropbox::DropboxSync::new(token, entries_dir);
    if let Some(refresh) = get_dropbox_refresh_token() {
        sync.with_refresh(refresh, DROPBOX_APP_KEY.to_string())
    } else {
        sync
    }
}

/// If the access token was refreshed during sync, persist the new one.
fn save_refreshed_token(sync: &silt_core::dropbox::DropboxSync, original_token: &str) {
    let current = sync.current_token();
    if current != original_token {
        let mut settings = read_settings();
        settings.insert("dropbox_token".into(), serde_json::Value::String(current));
        let _ = write_settings(&settings);
    }
}

// --- Google Drive helpers ---

const GDRIVE_CLIENT_ID: &str = "472212712976-0re1irdle5up1o6cm1v1ujma9eppufr3.apps.googleusercontent.com";
const GDRIVE_CLIENT_SECRET: &str = "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";

fn get_gdrive_token() -> Option<String> {
    read_settings()
        .get("google_drive_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn make_gdrive_sync(token: String, entries_dir: &std::path::Path) -> silt_core::google_drive::GoogleDriveSync {
    let settings = read_settings();
    let sync = silt_core::google_drive::GoogleDriveSync::new(token, entries_dir);

    let refresh = settings
        .get("google_drive_refresh_token")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let sync = if let Some(refresh) = refresh {
        sync.with_refresh(refresh, GDRIVE_CLIENT_ID.to_string(), GDRIVE_CLIENT_SECRET.to_string())
    } else {
        sync
    };

    let folder_id = settings
        .get("google_drive_folder_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if let Some(fid) = folder_id {
        sync.with_folder_id(fid)
    } else {
        sync
    }
}

fn save_refreshed_gdrive_token(sync: &silt_core::google_drive::GoogleDriveSync, original_token: &str) {
    let mut changed = false;
    let mut settings = read_settings();

    let current = sync.current_token();
    if current != original_token {
        settings.insert("google_drive_token".into(), serde_json::Value::String(current));
        changed = true;
    }

    if let Some(folder_id) = sync.current_folder_id() {
        let existing = settings
            .get("google_drive_folder_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if existing != folder_id {
            settings.insert("google_drive_folder_id".into(), serde_json::Value::String(folder_id));
            changed = true;
        }
    }

    if changed {
        let _ = write_settings(&settings);
    }
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("help");

    match cmd {
        "new" => {
            let body = args.get(2).ok_or_else(|| anyhow!("usage: silt new <body>"))?;
            let silt = Silt::open(&data_dir())?;
            let entry = silt.new_entry(body)?;
            println!("{}", serde_json::to_string(&EntryJson::from(entry))?);
        }
        "list" => {
            let silt = Silt::open(&data_dir())?;
            let entries: Vec<EntryJson> = silt.list_entries()?.into_iter().map(Into::into).collect();
            println!("{}", serde_json::to_string(&entries)?);
        }
        "search" => {
            let query = args.get(2).ok_or_else(|| anyhow!("usage: silt search <query>"))?;
            let silt = Silt::open(&data_dir())?;
            let entries: Vec<EntryJson> = silt.search(query)?.into_iter().map(Into::into).collect();
            println!("{}", serde_json::to_string(&entries)?);
        }
        "edit" => {
            let id = args.get(2).ok_or_else(|| anyhow!("usage: silt edit <id> <body>"))?;
            let body = args.get(3).ok_or_else(|| anyhow!("usage: silt edit <id> <body>"))?;
            let silt = Silt::open(&data_dir())?;
            let entry = silt.edit_entry(id, body)?;
            println!("{}", serde_json::to_string(&EntryJson::from(entry))?);
        }
        "delete" => {
            let id = args.get(2).ok_or_else(|| anyhow!("usage: silt delete <id>"))?;
            let silt = Silt::open(&data_dir())?;
            silt.delete_entry(id)?;
            println!("{{\"deleted\":\"{id}\"}}");
        }
        "config" => {
            let action = args.get(2).map(|s| s.as_str()).unwrap_or("help");
            match action {
                "get" => {
                    let key = args.get(3).ok_or_else(|| anyhow!("usage: silt config get <key>"))?;
                    let settings = read_settings();
                    let value = settings.get(key.as_str())
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    println!("{}", serde_json::to_string(&serde_json::json!({
                        "key": key,
                        "value": value,
                    }))?);
                }
                "set" => {
                    let key = args.get(3).ok_or_else(|| anyhow!("usage: silt config set <key> <value>"))?;
                    let value = args.get(4).ok_or_else(|| anyhow!("usage: silt config set <key> <value>"))?;
                    let mut settings = read_settings();
                    settings.insert(key.clone(), serde_json::Value::String(value.clone()));
                    write_settings(&settings)?;
                    println!("{}", serde_json::to_string(&serde_json::json!({
                        "key": key,
                        "value": value,
                    }))?);
                }
                _ => {
                    eprintln!("usage: silt config <get|set> <key> [value]");
                    std::process::exit(1);
                }
            }
        }
        "sync" => {
            let action = args.get(2).map(|s| s.as_str()).unwrap_or("help");
            let has_dropbox = get_dropbox_token().is_ok();
            let has_gdrive = get_gdrive_token().is_some();

            if !has_dropbox && !has_gdrive {
                return Err(anyhow!("no sync provider configured. Connect Dropbox or Google Drive first."));
            }

            match action {
                "push" => {
                    let silt = Silt::open(&data_dir())?;
                    let paths: Vec<PathBuf> = std::fs::read_dir(silt.entries_dir())?
                        .filter_map(|e| e.ok())
                        .map(|e| e.path())
                        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
                        .collect();
                    let mut total = 0u32;

                    if let Ok(token) = get_dropbox_token() {
                        let sync = make_dropbox_sync(token.clone(), silt.entries_dir());
                        sync.push(&paths)?;
                        save_refreshed_token(&sync, &token);
                        total += paths.len() as u32;
                    }

                    if let Some(token) = get_gdrive_token() {
                        let sync = make_gdrive_sync(token.clone(), silt.entries_dir());
                        sync.push(&paths)?;
                        save_refreshed_gdrive_token(&sync, &token);
                        total += paths.len() as u32;
                    }

                    println!("{{\"pushed\":{}}}", total);
                }
                "pull" => {
                    let mut silt = Silt::open(&data_dir())?;
                    let mut all_pulled = Vec::new();

                    if let Ok(token) = get_dropbox_token() {
                        let sync = make_dropbox_sync(token.clone(), silt.entries_dir());
                        let pulled = sync.pull()?;
                        save_refreshed_token(&sync, &token);
                        all_pulled.extend(pulled);
                    }

                    if let Some(token) = get_gdrive_token() {
                        let sync = make_gdrive_sync(token.clone(), silt.entries_dir());
                        let pulled = sync.pull()?;
                        save_refreshed_gdrive_token(&sync, &token);
                        all_pulled.extend(pulled);
                    }

                    if !all_pulled.is_empty() {
                        silt.rebuild_index()?;
                    }
                    let filenames: Vec<&str> = all_pulled
                        .iter()
                        .filter_map(|p| p.file_name()?.to_str())
                        .collect();
                    println!(
                        "{}",
                        serde_json::to_string(&serde_json::json!({
                            "pulled": filenames.len(),
                            "files": filenames,
                        }))?
                    );
                }
                "status" => {
                    let silt = Silt::open(&data_dir())?;
                    let mut providers = serde_json::Map::new();

                    if let Ok(token) = get_dropbox_token() {
                        let sync = make_dropbox_sync(token, silt.entries_dir());
                        let s = match sync.status() {
                            silt_core::sync::SyncStatus::Idle => "idle",
                            silt_core::sync::SyncStatus::Syncing => "syncing",
                            silt_core::sync::SyncStatus::Error(_) => "error",
                        };
                        providers.insert("dropbox".into(), serde_json::Value::String(s.into()));
                    }

                    if let Some(token) = get_gdrive_token() {
                        let sync = make_gdrive_sync(token, silt.entries_dir());
                        let s = match sync.status() {
                            silt_core::sync::SyncStatus::Idle => "idle",
                            silt_core::sync::SyncStatus::Syncing => "syncing",
                            silt_core::sync::SyncStatus::Error(_) => "error",
                        };
                        providers.insert("google_drive".into(), serde_json::Value::String(s.into()));
                    }

                    println!("{}", serde_json::to_string(&providers)?);
                }
                _ => {
                    eprintln!("usage: silt sync <push|pull|status>");
                    std::process::exit(1);
                }
            }
        }
        _ => {
            eprintln!("usage: silt <new|list|search|edit|delete|sync|config> [args]");
            std::process::exit(1);
        }
    }

    Ok(())
}
