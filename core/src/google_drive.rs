use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};

use crate::sync::{SyncAdapter, SyncStatus};

const FOLDER_NAME: &str = "silt";
const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// --- Google Drive API types ---

#[derive(serde::Deserialize)]
struct FileList {
    files: Vec<DriveFile>,
    #[serde(default)]
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub size: Option<String>, // Google returns size as string
}

#[derive(serde::Serialize)]
struct FileMetadata {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    parents: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
}

#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(serde::Deserialize)]
struct CreateResponse {
    id: String,
}

// --- GoogleDriveSync ---

pub struct GoogleDriveSync {
    token: Mutex<String>,
    refresh_token: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
    entries_dir: PathBuf,
    folder_id: Mutex<Option<String>>,
    client: reqwest::blocking::Client,
    status: Mutex<SyncStatus>,
}

impl GoogleDriveSync {
    pub fn new(token: String, entries_dir: &Path) -> Self {
        Self {
            token: Mutex::new(token),
            refresh_token: None,
            client_id: None,
            client_secret: None,
            entries_dir: entries_dir.to_path_buf(),
            folder_id: Mutex::new(None),
            client: reqwest::blocking::Client::new(),
            status: Mutex::new(SyncStatus::Idle),
        }
    }

    pub fn with_refresh(
        mut self,
        refresh_token: String,
        client_id: String,
        client_secret: String,
    ) -> Self {
        self.refresh_token = Some(refresh_token);
        self.client_id = Some(client_id);
        self.client_secret = Some(client_secret);
        self
    }

    pub fn with_folder_id(self, folder_id: String) -> Self {
        *self.folder_id.lock().unwrap() = Some(folder_id);
        self
    }

    pub fn current_token(&self) -> String {
        self.token.lock().unwrap().clone()
    }

    /// Returns the folder ID (if it was resolved during sync).
    pub fn current_folder_id(&self) -> Option<String> {
        self.folder_id.lock().unwrap().clone()
    }

    fn get_token(&self) -> String {
        self.token.lock().unwrap().clone()
    }

    fn refresh_access_token(&self) -> Result<String> {
        let refresh = self
            .refresh_token
            .as_ref()
            .ok_or_else(|| anyhow!("no refresh token — please re-authorize Google Drive"))?;
        let client_id = self
            .client_id
            .as_ref()
            .ok_or_else(|| anyhow!("no client_id for token refresh"))?;
        let client_secret = self
            .client_secret
            .as_ref()
            .ok_or_else(|| anyhow!("no client_secret for token refresh"))?;

        let resp = self
            .client
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh.as_str()),
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
            ])
            .send()
            .context("Google token refresh request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!(
                "Google token refresh failed ({}): {} — please re-authorize",
                status,
                body
            ));
        }

        let data: TokenResponse = resp.json().context("parsing token refresh response")?;
        *self.token.lock().unwrap() = data.access_token.clone();
        Ok(data.access_token)
    }

    fn set_status(&self, s: SyncStatus) {
        *self.status.lock().unwrap() = s;
    }

    // --- Folder management ---

    /// Find or create the `silt` folder at Drive root. Caches the ID.
    fn ensure_folder(&self) -> Result<String> {
        if let Some(ref id) = *self.folder_id.lock().unwrap() {
            return Ok(id.clone());
        }

        let id = self.ensure_folder_inner(true)?;
        *self.folder_id.lock().unwrap() = Some(id.clone());
        Ok(id)
    }

    fn ensure_folder_inner(&self, allow_retry: bool) -> Result<String> {
        // Search for existing folder
        let query = format!(
            "name='{}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
            FOLDER_NAME
        );

        let resp = self
            .client
            .get(format!("{}/files", DRIVE_API))
            .bearer_auth(&self.get_token())
            .query(&[
                ("q", query.as_str()),
                ("fields", "files(id,name)"),
                ("pageSize", "1"),
            ])
            .send()
            .context("searching for silt folder")?;

        if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
            self.refresh_access_token()?;
            return self.ensure_folder_inner(false);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("Drive folder search error ({}): {}", status, body));
        }

        let list: FileList = resp.json().context("parsing folder search")?;
        if let Some(folder) = list.files.first() {
            return Ok(folder.id.clone());
        }

        // Create folder
        let meta = FileMetadata {
            name: FOLDER_NAME.to_string(),
            parents: Some(vec!["root".to_string()]),
            mime_type: Some("application/vnd.google-apps.folder".to_string()),
        };

        let resp = self
            .client
            .post(format!("{}/files", DRIVE_API))
            .bearer_auth(&self.get_token())
            .json(&meta)
            .send()
            .context("creating silt folder")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("Drive folder create error ({}): {}", status, body));
        }

        let created: CreateResponse = resp.json().context("parsing folder create response")?;
        Ok(created.id)
    }

    // --- File operations ---

    fn list_remote_files(&self) -> Result<Vec<DriveFile>> {
        let folder_id = self.ensure_folder()?;
        self.list_remote_files_in_folder(&folder_id, true)
    }

    fn list_remote_files_in_folder(
        &self,
        folder_id: &str,
        allow_retry: bool,
    ) -> Result<Vec<DriveFile>> {
        let query = format!(
            "'{}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false",
            folder_id
        );

        let mut all_files = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut params = vec![
                ("q", query.as_str()),
                ("fields", "files(id,name,size),nextPageToken"),
                ("pageSize", "1000"),
            ];
            let pt_owned;
            if let Some(ref pt) = page_token {
                pt_owned = pt.clone();
                params.push(("pageToken", &pt_owned));
            }

            let resp = self
                .client
                .get(format!("{}/files", DRIVE_API))
                .bearer_auth(&self.get_token())
                .query(&params)
                .send()
                .context("listing Drive files")?;

            if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
                self.refresh_access_token()?;
                return self.list_remote_files_in_folder(folder_id, false);
            }

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(anyhow!("Drive list error ({}): {}", status, body));
            }

            let list: FileList = resp.json().context("parsing Drive file list")?;
            all_files.extend(
                list.files
                    .into_iter()
                    .filter(|f| f.name.ends_with(".md")),
            );

            match list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }

        Ok(all_files)
    }

    /// Find a file by name in the silt folder. Returns its Drive file ID.
    fn find_file_by_name(&self, folder_id: &str, filename: &str) -> Result<Option<String>> {
        let query = format!(
            "name='{}' and '{}' in parents and trashed=false",
            filename, folder_id
        );

        let resp = self
            .client
            .get(format!("{}/files", DRIVE_API))
            .bearer_auth(&self.get_token())
            .query(&[
                ("q", query.as_str()),
                ("fields", "files(id,name,size)"),
                ("pageSize", "1"),
            ])
            .send()
            .context("searching for file by name")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("Drive file search error ({}): {}", status, body));
        }

        let list: FileList = resp.json().context("parsing file search")?;
        Ok(list.files.first().map(|f| f.id.clone()))
    }

    fn upload_file(&self, local_path: &Path) -> Result<()> {
        self.upload_file_inner(local_path, true)
    }

    fn upload_file_inner(&self, local_path: &Path, allow_retry: bool) -> Result<()> {
        let filename = local_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("invalid filename: {:?}", local_path))?;

        let folder_id = self.ensure_folder()?;
        let data = fs::read(local_path)
            .with_context(|| format!("reading {}", local_path.display()))?;

        // Check if file already exists (update vs create)
        let existing_id = self.find_file_by_name(&folder_id, filename)?;

        let resp = if let Some(ref file_id) = existing_id {
            // Update existing file
            self.client
                .patch(format!(
                    "{}/files/{}?uploadType=media",
                    UPLOAD_API, file_id
                ))
                .bearer_auth(&self.get_token())
                .header("Content-Type", "text/markdown")
                .body(data)
                .send()
                .with_context(|| format!("updating {}", filename))?
        } else {
            // Create new file with multipart upload
            let metadata = serde_json::json!({
                "name": filename,
                "parents": [folder_id],
            });

            let form = reqwest::blocking::multipart::Form::new()
                .part(
                    "metadata",
                    reqwest::blocking::multipart::Part::text(metadata.to_string())
                        .mime_str("application/json")?,
                )
                .part(
                    "file",
                    reqwest::blocking::multipart::Part::bytes(data)
                        .file_name(filename.to_string())
                        .mime_str("text/markdown")?,
                );

            self.client
                .post(format!("{}/files?uploadType=multipart", UPLOAD_API))
                .bearer_auth(&self.get_token())
                .multipart(form)
                .send()
                .with_context(|| format!("uploading {}", filename))?
        };

        if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
            self.refresh_access_token()?;
            return self.upload_file_inner(local_path, false);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!(
                "upload error for {} ({}): {}",
                filename,
                status,
                body
            ));
        }

        Ok(())
    }

    fn download_file(&self, filename: &str, file_id: &str) -> Result<PathBuf> {
        self.download_file_inner(filename, file_id, true)
    }

    fn download_file_inner(
        &self,
        filename: &str,
        file_id: &str,
        allow_retry: bool,
    ) -> Result<PathBuf> {
        let resp = self
            .client
            .get(format!("{}/files/{}", DRIVE_API, file_id))
            .bearer_auth(&self.get_token())
            .query(&[("alt", "media")])
            .send()
            .with_context(|| format!("downloading {}", filename))?;

        if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
            self.refresh_access_token()?;
            return self.download_file_inner(filename, file_id, false);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!(
                "download error for {} ({}): {}",
                filename,
                status,
                body
            ));
        }

        let bytes = resp.bytes().context("reading download body")?;
        let local_path = self.entries_dir.join(filename);
        fs::write(&local_path, &bytes)
            .with_context(|| format!("writing {}", local_path.display()))?;

        Ok(local_path)
    }
}

impl SyncAdapter for GoogleDriveSync {
    fn push(&self, changed: &[PathBuf]) -> Result<()> {
        self.set_status(SyncStatus::Syncing);

        for path in changed {
            if let Err(e) = self.upload_file(path) {
                let msg = format!("{}", e);
                self.set_status(SyncStatus::Error(msg));
                return Err(e);
            }
        }

        self.set_status(SyncStatus::Idle);
        Ok(())
    }

    fn pull(&self) -> Result<Vec<PathBuf>> {
        self.set_status(SyncStatus::Syncing);

        let remote_files = match self.list_remote_files() {
            Ok(files) => files,
            Err(e) => {
                let msg = format!("{}", e);
                self.set_status(SyncStatus::Error(msg));
                return Err(e);
            }
        };

        let mut downloaded = Vec::new();

        for file in &remote_files {
            let local_path = self.entries_dir.join(&file.name);
            let remote_size: u64 = file
                .size
                .as_ref()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let should_download = if local_path.exists() {
                match fs::metadata(&local_path) {
                    Ok(meta) => meta.len() != remote_size,
                    Err(_) => true,
                }
            } else {
                true
            };

            if should_download {
                match self.download_file(&file.name, &file.id) {
                    Ok(path) => downloaded.push(path),
                    Err(e) => {
                        let msg = format!("{}", e);
                        self.set_status(SyncStatus::Error(msg));
                        return Err(e);
                    }
                }
            }
        }

        self.set_status(SyncStatus::Idle);
        Ok(downloaded)
    }

    fn status(&self) -> SyncStatus {
        self.status.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_starts_idle() {
        let dir = tempfile::tempdir().unwrap();
        let sync = GoogleDriveSync::new("fake-token".into(), dir.path());
        assert!(matches!(sync.status(), SyncStatus::Idle));
    }

    #[test]
    fn folder_id_caching() {
        let dir = tempfile::tempdir().unwrap();
        let sync = GoogleDriveSync::new("fake-token".into(), dir.path())
            .with_folder_id("abc123".into());
        assert_eq!(sync.current_folder_id(), Some("abc123".to_string()));
    }

    #[test]
    fn file_metadata_serializes_correctly() {
        let meta = FileMetadata {
            name: "test.md".into(),
            parents: Some(vec!["folder123".into()]),
            mime_type: None,
        };
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("\"name\":\"test.md\""));
        assert!(json.contains("\"parents\":[\"folder123\"]"));
        assert!(!json.contains("mimeType"));
    }

    #[test]
    fn file_metadata_with_mime_type() {
        let meta = FileMetadata {
            name: "silt".into(),
            parents: Some(vec!["root".into()]),
            mime_type: Some("application/vnd.google-apps.folder".into()),
        };
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("application/vnd.google-apps.folder"));
    }

    #[test]
    fn drive_file_deserializes() {
        let json = r#"{"id":"abc","name":"test.md","size":"123"}"#;
        let file: DriveFile = serde_json::from_str(json).unwrap();
        assert_eq!(file.id, "abc");
        assert_eq!(file.name, "test.md");
        assert_eq!(file.size, Some("123".to_string()));
    }

    #[test]
    fn drive_file_without_size() {
        let json = r#"{"id":"abc","name":"test.md"}"#;
        let file: DriveFile = serde_json::from_str(json).unwrap();
        assert_eq!(file.size, None);
    }

    #[test]
    fn file_list_deserializes() {
        let json = r#"{"files":[{"id":"a","name":"x.md","size":"10"}]}"#;
        let list: FileList = serde_json::from_str(json).unwrap();
        assert_eq!(list.files.len(), 1);
        assert!(list.next_page_token.is_none());
    }

    #[test]
    fn file_list_with_pagination() {
        let json =
            r#"{"files":[{"id":"a","name":"x.md"}],"nextPageToken":"token123"}"#;
        let list: FileList = serde_json::from_str(json).unwrap();
        assert_eq!(list.next_page_token, Some("token123".to_string()));
    }
}
