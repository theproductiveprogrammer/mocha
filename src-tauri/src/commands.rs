use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use chrono::Utc;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB limit
const MAX_RECENT: usize = 20;

/// Response for readFile command
#[derive(Serialize)]
pub struct FileResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Recent file entry
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: i64,
}

/// Get the path to ~/.mocha/recent.json
fn get_recent_file_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".mocha").join("recent.json"))
}

/// Extract filename from path
fn get_filename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string()
}

/// Read file with optional offset for differential/polling reads
#[tauri::command]
pub fn read_file(path: String, offset: u64) -> FileResult {
    if path.is_empty() {
        return FileResult {
            success: false,
            content: None,
            path: None,
            name: None,
            size: None,
            prev_size: None,
            error: Some("No path provided".to_string()),
        };
    }

    // Get file metadata
    let metadata = match fs::metadata(&path) {
        Ok(m) => m,
        Err(_) => {
            return FileResult {
                success: false,
                content: None,
                path: None,
                name: None,
                size: None,
                prev_size: None,
                error: Some("Cannot open file".to_string()),
            };
        }
    };

    let current_size = metadata.len();

    // If file hasn't grown since last read, return empty content
    if offset > 0 && current_size <= offset {
        return FileResult {
            success: true,
            content: Some(String::new()),
            path: Some(path.clone()),
            name: Some(get_filename(&path)),
            size: Some(current_size),
            prev_size: Some(offset),
            error: None,
        };
    }

    // Calculate read parameters
    let read_start = if offset > 0 { offset } else { 0 };
    let read_size = current_size - read_start;

    if read_size > MAX_FILE_SIZE {
        return FileResult {
            success: false,
            content: None,
            path: None,
            name: None,
            size: None,
            prev_size: None,
            error: Some("File too large (max 10MB)".to_string()),
        };
    }

    // Open and read file
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => {
            return FileResult {
                success: false,
                content: None,
                path: None,
                name: None,
                size: None,
                prev_size: None,
                error: Some("Cannot open file".to_string()),
            };
        }
    };

    // Seek to read position
    if read_start > 0 {
        if file.seek(SeekFrom::Start(read_start)).is_err() {
            return FileResult {
                success: false,
                content: None,
                path: None,
                name: None,
                size: None,
                prev_size: None,
                error: Some("Cannot seek in file".to_string()),
            };
        }
    }

    // Read content
    let mut content = vec![0u8; read_size as usize];
    if file.read_exact(&mut content).is_err() {
        // Try reading what we can
        let mut file = File::open(&path).unwrap();
        file.seek(SeekFrom::Start(read_start)).unwrap();
        content.clear();
        file.read_to_end(&mut content).ok();
    }

    // Convert to string (handle non-UTF8 gracefully)
    let content_str = String::from_utf8_lossy(&content).to_string();

    FileResult {
        success: true,
        content: Some(content_str),
        path: Some(path.clone()),
        name: Some(get_filename(&path)),
        size: Some(current_size),
        prev_size: Some(offset),
        error: None,
    }
}

/// Get list of recently opened files
#[tauri::command]
pub fn get_recent_files() -> Vec<RecentFile> {
    let path = match get_recent_file_path() {
        Some(p) => p,
        None => return vec![],
    };

    if !path.exists() {
        return vec![];
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    match serde_json::from_str(&content) {
        Ok(files) => files,
        Err(_) => vec![],
    }
}

/// Add a file to the recent files list
#[tauri::command]
pub fn add_recent_file(path: String) -> bool {
    if path.is_empty() {
        return false;
    }

    let recent_path = match get_recent_file_path() {
        Some(p) => p,
        None => return false,
    };

    // Create ~/.mocha directory if needed
    if let Some(parent) = recent_path.parent() {
        if !parent.exists() {
            if fs::create_dir_all(parent).is_err() {
                return false;
            }
        }
    }

    // Read existing recent files
    let mut recent_files: Vec<RecentFile> = if recent_path.exists() {
        fs::read_to_string(&recent_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    // Remove existing entry for this path (if any)
    recent_files.retain(|f| f.path != path);

    // Create new entry
    let new_entry = RecentFile {
        path: path.clone(),
        name: get_filename(&path),
        last_opened: Utc::now().timestamp_millis(),
    };

    // Prepend new entry
    recent_files.insert(0, new_entry);

    // Limit to MAX_RECENT entries
    recent_files.truncate(MAX_RECENT);

    // Write back to file
    let json = match serde_json::to_string_pretty(&recent_files) {
        Ok(j) => j,
        Err(_) => return false,
    };

    let mut file = match OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&recent_path)
    {
        Ok(f) => f,
        Err(_) => return false,
    };

    file.write_all(json.as_bytes()).is_ok()
}

/// Clear the recent files list
#[tauri::command]
pub fn clear_recent_files() -> bool {
    let recent_path = match get_recent_file_path() {
        Some(p) => p,
        None => return false,
    };

    // Write empty array to file
    let json = "[]";

    let mut file = match OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&recent_path)
    {
        Ok(f) => f,
        Err(_) => return false,
    };

    file.write_all(json.as_bytes()).is_ok()
}
