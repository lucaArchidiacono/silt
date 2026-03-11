use anyhow::{anyhow, Result};
use chrono::Utc;
use ulid::Ulid;

#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub body: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

impl Entry {
    pub fn new(body: &str) -> Self {
        Self {
            id: Ulid::new().to_string(),
            body: body.to_string(),
            created_at: Utc::now().to_rfc3339(),
            deleted_at: None,
        }
    }

    pub fn to_markdown(&self) -> String {
        let deleted_line = match &self.deleted_at {
            Some(d) => format!("deleted: {d}"),
            None => "deleted:".to_string(),
        };
        format!(
            "---\nid: {}\ncreated: {}\n{deleted_line}\n---\n{}",
            self.id, self.created_at, self.body
        )
    }

    pub fn from_markdown(text: &str) -> Result<Self> {
        let text = text.trim();
        if !text.starts_with("---") {
            log::warn!("[entry] parse failed: missing frontmatter");
            return Err(anyhow!("missing frontmatter"));
        }

        let rest = &text[3..];
        let end = rest.find("---").ok_or_else(|| {
            log::warn!("[entry] parse failed: missing closing ---");
            anyhow!("missing closing ---")
        })?;
        let frontmatter = &rest[..end];
        let body = rest[end + 3..].trim().to_string();

        let mut id = None;
        let mut created_at = None;
        let mut deleted_at = None;

        for line in frontmatter.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some((key, val)) = line.split_once(':') {
                let key = key.trim();
                let val = val.trim();
                match key {
                    "id" => id = Some(val.to_string()),
                    "created" => created_at = Some(val.to_string()),
                    "deleted" => {
                        if !val.is_empty() {
                            deleted_at = Some(val.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(Self {
            id: id.ok_or_else(|| anyhow!("missing id"))?,
            body,
            created_at: created_at.ok_or_else(|| anyhow!("missing created"))?,
            deleted_at,
        })
    }

    pub fn is_deleted(&self) -> bool {
        self.deleted_at.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let entry = Entry::new("hello world");
        let md = entry.to_markdown();
        let parsed = Entry::from_markdown(&md).unwrap();
        assert_eq!(parsed.id, entry.id);
        assert_eq!(parsed.body, entry.body);
        assert_eq!(parsed.created_at, entry.created_at);
        assert!(parsed.deleted_at.is_none());
    }

    #[test]
    fn roundtrip_with_soft_delete() {
        let mut entry = Entry::new("to be deleted");
        entry.deleted_at = Some("2025-03-05T00:00:00+00:00".to_string());
        let parsed = Entry::from_markdown(&entry.to_markdown()).unwrap();
        assert!(parsed.is_deleted());
        assert_eq!(parsed.deleted_at, entry.deleted_at);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(Entry::from_markdown("no frontmatter").is_err());
        assert!(Entry::from_markdown("---\n---\n").is_err()); // missing id
    }
}
