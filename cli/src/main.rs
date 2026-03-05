use anyhow::{anyhow, Result};
use serde::Serialize;
use silt_core::entry::Entry;
use silt_core::Silt;
use std::env;
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
        _ => {
            eprintln!("usage: silt <new|list|search|edit|delete> [args]");
            std::process::exit(1);
        }
    }

    Ok(())
}
