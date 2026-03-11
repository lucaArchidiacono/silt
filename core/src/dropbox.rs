use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};

use crate::sync::{SyncAdapter, SyncStatus};

const REMOTE_ENTRIES_PATH: &str = "/entries";

// --- Dropbox API types ---

#[derive(serde::Serialize)]
struct ListFolderRequest {
    path: String,
    recursive: bool,
    include_deleted: bool,
}

#[derive(serde::Serialize)]
struct ListFolderContinueRequest {
    cursor: String,
}

#[derive(serde::Deserialize)]
struct ListFolderResponse {
    entries: Vec<FileMetadata>,
    has_more: bool,
    cursor: String,
}

#[derive(serde::Deserialize)]
struct FileMetadata {
    #[serde(rename = ".tag")]
    tag: String,
    name: String,
    size: Option<u64>,
}

#[derive(serde::Serialize)]
struct UploadArg {
    path: String,
    mode: String,
    autorename: bool,
    mute: bool,
}

#[derive(serde::Serialize)]
struct DownloadArg {
    path: String,
}

// --- Token refresh types ---

#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
}

// --- DropboxSync ---

pub struct DropboxSync {
    token: Mutex<String>,
    refresh_token: Option<String>,
    app_key: Option<String>,
    entries_dir: PathBuf,
    client: reqwest::blocking::Client,
    status: Mutex<SyncStatus>,
}

impl DropboxSync {
    pub fn new(token: String, entries_dir: &Path) -> Self {
        Self {
            token: Mutex::new(token),
            refresh_token: None,
            app_key: None,
            entries_dir: entries_dir.to_path_buf(),
            client: reqwest::blocking::Client::new(),
            status: Mutex::new(SyncStatus::Idle),
        }
    }

    pub fn with_refresh(mut self, refresh_token: String, app_key: String) -> Self {
        self.refresh_token = Some(refresh_token);
        self.app_key = Some(app_key);
        self
    }

    /// Returns the current access token (may have been refreshed).
    pub fn current_token(&self) -> String {
        self.token.lock().unwrap().clone()
    }

    fn get_token(&self) -> String {
        self.token.lock().unwrap().clone()
    }

    /// Refresh the access token using the stored refresh token.
    /// Returns the new access token on success.
    fn refresh_access_token(&self) -> Result<String> {
        log::info!("[dropbox] refreshing access token");
        let refresh = self.refresh_token.as_ref()
            .ok_or_else(|| anyhow!("no refresh token available — please re-authorize Dropbox"))?;
        let app_key = self.app_key.as_ref()
            .ok_or_else(|| anyhow!("no app key available for token refresh"))?;

        let resp = self
            .client
            .post("https://api.dropboxapi.com/oauth2/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh.as_str()),
                ("client_id", app_key.as_str()),
            ])
            .send()
            .context("token refresh request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!(
                "token refresh failed ({}): {} — please re-authorize Dropbox",
                status,
                body
            ));
        }

        let token_data: TokenResponse = resp.json().context("parsing token refresh response")?;
        *self.token.lock().unwrap() = token_data.access_token.clone();
        Ok(token_data.access_token)
    }

    fn set_status(&self, s: SyncStatus) {
        *self.status.lock().unwrap() = s;
    }

    fn remote_path(filename: &str) -> String {
        format!("{}/{}", REMOTE_ENTRIES_PATH, filename)
    }

    /// Lists all .md files in /entries/ on Dropbox.
    /// Returns (filename, size) pairs. Handles pagination.
    /// Returns empty vec if the folder doesn't exist yet.
    fn list_remote_files(&self) -> Result<Vec<(String, u64)>> {
        log::debug!("[dropbox] listing remote files in {}", REMOTE_ENTRIES_PATH);
        let resp = self
            .client
            .post("https://api.dropboxapi.com/2/files/list_folder")
            .bearer_auth(&self.get_token())
            .json(&ListFolderRequest {
                path: REMOTE_ENTRIES_PATH.to_string(),
                recursive: false,
                include_deleted: false,
            })
            .send()
            .context("list_folder request failed")?;

        // 401 = expired token, try refresh
        if resp.status().as_u16() == 401 {
            if self.refresh_token.is_some() {
                self.refresh_access_token()?;
                return self.list_remote_files_inner();
            }
            return Err(anyhow!("Dropbox token expired — please re-authorize Dropbox"));
        }

        // 409 with path/not_found means the folder doesn't exist yet
        if resp.status().as_u16() == 409 {
            let body = resp.text().unwrap_or_default();
            if body.contains("not_found") {
                log::info!("[dropbox] remote /entries folder does not exist yet");
                return Ok(Vec::new());
            }
            return Err(anyhow!("Dropbox list_folder error (409): {}", body));
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("Dropbox list_folder error ({}): {}", status, body));
        }

        let mut result: ListFolderResponse = resp.json().context("parsing list_folder response")?;
        let mut files = Self::extract_md_files(&result.entries);
        log::debug!("[dropbox] initial page: {} .md files, has_more={}", files.len(), result.has_more);

        // Paginate
        while result.has_more {
            log::debug!("[dropbox] fetching next page of remote files");
            let resp = self
                .client
                .post("https://api.dropboxapi.com/2/files/list_folder/continue")
                .bearer_auth(&self.get_token())
                .json(&ListFolderContinueRequest {
                    cursor: result.cursor,
                })
                .send()
                .context("list_folder/continue request failed")?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(anyhow!(
                    "Dropbox list_folder/continue error ({}): {}",
                    status,
                    body
                ));
            }

            result = resp.json().context("parsing list_folder/continue response")?;
            files.extend(Self::extract_md_files(&result.entries));
        }

        Ok(files)
    }

    /// Inner list call used after token refresh (no further retry).
    fn list_remote_files_inner(&self) -> Result<Vec<(String, u64)>> {
        let resp = self
            .client
            .post("https://api.dropboxapi.com/2/files/list_folder")
            .bearer_auth(&self.get_token())
            .json(&ListFolderRequest {
                path: REMOTE_ENTRIES_PATH.to_string(),
                recursive: false,
                include_deleted: false,
            })
            .send()
            .context("list_folder request failed")?;

        if resp.status().as_u16() == 409 {
            let body = resp.text().unwrap_or_default();
            if body.contains("not_found") {
                return Ok(Vec::new());
            }
            return Err(anyhow!("Dropbox list_folder error (409): {}", body));
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("Dropbox list_folder error ({}): {}", status, body));
        }

        let mut result: ListFolderResponse = resp.json().context("parsing list_folder response")?;
        let mut files = Self::extract_md_files(&result.entries);

        while result.has_more {
            let resp = self
                .client
                .post("https://api.dropboxapi.com/2/files/list_folder/continue")
                .bearer_auth(&self.get_token())
                .json(&ListFolderContinueRequest {
                    cursor: result.cursor,
                })
                .send()
                .context("list_folder/continue request failed")?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(anyhow!(
                    "Dropbox list_folder/continue error ({}): {}",
                    status,
                    body
                ));
            }

            result = resp.json().context("parsing list_folder/continue response")?;
            files.extend(Self::extract_md_files(&result.entries));
        }

        Ok(files)
    }

    fn extract_md_files(entries: &[FileMetadata]) -> Vec<(String, u64)> {
        entries
            .iter()
            .filter(|e| e.tag == "file" && e.name.ends_with(".md"))
            .map(|e| (e.name.clone(), e.size.unwrap_or(0)))
            .collect()
    }

    fn upload_file(&self, local_path: &Path) -> Result<()> {
        self.upload_file_inner(local_path, true)
    }

    fn upload_file_inner(&self, local_path: &Path, allow_retry: bool) -> Result<()> {
        let filename = local_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("invalid filename: {:?}", local_path))?;

        log::info!("[dropbox] uploading {}", filename);
        let data = fs::read(local_path)
            .with_context(|| format!("reading {}", local_path.display()))?;

        let arg = UploadArg {
            path: Self::remote_path(filename),
            mode: "overwrite".into(),
            autorename: false,
            mute: true,
        };

        let resp = self
            .client
            .post("https://content.dropboxapi.com/2/files/upload")
            .bearer_auth(&self.get_token())
            .header(
                "Dropbox-API-Arg",
                serde_json::to_string(&arg).context("serializing upload arg")?,
            )
            .header("Content-Type", "application/octet-stream")
            .body(data)
            .send()
            .with_context(|| format!("uploading {}", filename))?;

        if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
            log::warn!("[dropbox] 401 on upload {}, refreshing token", filename);
            self.refresh_access_token()?;
            return self.upload_file_inner(local_path, false);
        }

        // Retry once on transient server errors
        if allow_retry && matches!(resp.status().as_u16(), 429 | 500 | 502 | 503) {
            let code = resp.status().as_u16();
            log::warn!("[dropbox] {} on upload {}, retrying in 1s", code, filename);
            std::thread::sleep(std::time::Duration::from_secs(1));
            return self.upload_file_inner(local_path, false);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            log::error!("[dropbox] upload failed for {} ({}): {}", filename, status, body);
            return Err(anyhow!("upload error for {} ({}): {}", filename, status, body));
        }

        log::info!("[dropbox] uploaded {}", filename);
        Ok(())
    }

    fn download_file(&self, filename: &str) -> Result<PathBuf> {
        self.download_file_inner(filename, true)
    }

    fn download_file_inner(&self, filename: &str, allow_retry: bool) -> Result<PathBuf> {
        let arg = DownloadArg {
            path: Self::remote_path(filename),
        };

        let resp = self
            .client
            .post("https://content.dropboxapi.com/2/files/download")
            .bearer_auth(&self.get_token())
            .header(
                "Dropbox-API-Arg",
                serde_json::to_string(&arg).context("serializing download arg")?,
            )
            .send()
            .with_context(|| format!("downloading {}", filename))?;

        if resp.status().as_u16() == 401 && allow_retry && self.refresh_token.is_some() {
            self.refresh_access_token()?;
            return self.download_file_inner(filename, false);
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

impl SyncAdapter for DropboxSync {
    fn push(&self, changed: &[PathBuf]) -> Result<()> {
        log::info!("[dropbox] pushing {} files", changed.len());
        self.set_status(SyncStatus::Syncing);

        for path in changed {
            if let Err(e) = self.upload_file(path) {
                log::error!("[dropbox] push failed: {}", e);
                let msg = format!("{}", e);
                self.set_status(SyncStatus::Error(msg));
                return Err(e);
            }
        }

        log::info!("[dropbox] push complete ({} files)", changed.len());
        self.set_status(SyncStatus::Idle);
        Ok(())
    }

    fn pull(&self) -> Result<Vec<PathBuf>> {
        log::info!("[dropbox] pulling from Dropbox");
        self.set_status(SyncStatus::Syncing);

        let remote_files = match self.list_remote_files() {
            Ok(files) => files,
            Err(e) => {
                log::error!("[dropbox] failed to list remote files: {}", e);
                let msg = format!("{}", e);
                self.set_status(SyncStatus::Error(msg));
                return Err(e);
            }
        };

        log::info!("[dropbox] found {} remote files", remote_files.len());
        let mut downloaded = Vec::new();

        for (filename, remote_size) in &remote_files {
            let local_path = self.entries_dir.join(filename);

            let should_download = if local_path.exists() {
                // Re-download if size differs (catches soft-delete changes)
                match fs::metadata(&local_path) {
                    Ok(meta) => {
                        let dominated = meta.len() != *remote_size;
                        if dominated {
                            log::debug!(
                                "[dropbox] {} size mismatch: local={} remote={}, will download",
                                filename, meta.len(), remote_size
                            );
                        } else {
                            log::debug!("[dropbox] {} unchanged (size={})", filename, meta.len());
                        }
                        dominated
                    }
                    Err(_) => true,
                }
            } else {
                log::debug!("[dropbox] {} is new, will download", filename);
                true
            };

            if should_download {
                log::info!("[dropbox] downloading {}", filename);
                match self.download_file(filename) {
                    Ok(path) => downloaded.push(path),
                    Err(e) => {
                        log::error!("[dropbox] download failed for {}: {}", filename, e);
                        let msg = format!("{}", e);
                        self.set_status(SyncStatus::Error(msg));
                        return Err(e);
                    }
                }
            }
        }

        log::info!("[dropbox] pull complete: {} downloaded", downloaded.len());
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
    fn remote_path_construction() {
        assert_eq!(DropboxSync::remote_path("01ABC.md"), "/entries/01ABC.md");
    }

    #[test]
    fn status_starts_idle() {
        let dir = tempfile::tempdir().unwrap();
        let sync = DropboxSync::new("fake-token".into(), dir.path());
        assert!(matches!(sync.status(), SyncStatus::Idle));
    }

    #[test]
    fn upload_arg_serializes_correctly() {
        let arg = UploadArg {
            path: "/entries/test.md".into(),
            mode: "overwrite".into(),
            autorename: false,
            mute: true,
        };
        let json = serde_json::to_string(&arg).unwrap();
        assert!(json.contains("\"mode\":\"overwrite\""));
        assert!(json.contains("\"autorename\":false"));
        assert!(json.contains("\"mute\":true"));
    }

    #[test]
    fn extract_md_files_filters_correctly() {
        let entries = vec![
            FileMetadata {
                tag: "file".into(),
                name: "01ABC.md".into(),
                size: Some(100),
            },
            FileMetadata {
                tag: "folder".into(),
                name: "subfolder".into(),
                size: None,
            },
            FileMetadata {
                tag: "file".into(),
                name: "readme.txt".into(),
                size: Some(50),
            },
        ];
        let result = DropboxSync::extract_md_files(&entries);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "01ABC.md");
        assert_eq!(result[0].1, 100);
    }
}
