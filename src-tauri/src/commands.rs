use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use chrono::Utc;

// Read at most 2MB from end of file - enough for ~10K+ lines
// Frontend only displays last 2000 lines anyway
const MAX_READ_SIZE: u64 = 2 * 1024 * 1024;
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
    pub mtime: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(default)]
    pub exists: bool,
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
            mtime: None,
            truncated: None,
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
                mtime: None,
                truncated: None,
                error: Some("Cannot open file".to_string()),
            };
        }
    };

    let current_size = metadata.len();
    let mtime = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);

    // If file size unchanged since last read, return empty (no new content)
    if offset > 0 && current_size == offset {
        return FileResult {
            success: true,
            content: Some(String::new()),
            path: Some(path.clone()),
            name: Some(get_filename(&path)),
            size: Some(current_size),
            prev_size: Some(offset),
            mtime,
            truncated: Some(false),
            error: None,
        };
    }

    // If file shrunk since last read, it was truncated/replaced - read from start
    let (read_start, is_truncated, is_tail_read) = if offset > 0 && current_size < offset {
        (0, true, false)  // Read entire file from beginning
    } else if offset > 0 {
        (offset, false, false)  // Normal differential read
    } else {
        (0, false, false)  // Initial read
    };

    // Calculate how much to read
    let mut actual_read_start = read_start;
    let mut read_size = current_size - read_start;
    let mut is_tail_read = is_tail_read;

    // For large files (initial read only), read just the tail
    if read_size > MAX_READ_SIZE && offset == 0 {
        actual_read_start = current_size - MAX_READ_SIZE;
        read_size = MAX_READ_SIZE;
        is_tail_read = true;
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
                mtime: None,
                truncated: None,
                error: Some("Cannot open file".to_string()),
            };
        }
    };

    // Seek to read position
    if actual_read_start > 0 {
        if file.seek(SeekFrom::Start(actual_read_start)).is_err() {
            return FileResult {
                success: false,
                content: None,
                path: None,
                name: None,
                size: None,
                prev_size: None,
                mtime: None,
                truncated: None,
                error: Some("Cannot seek in file".to_string()),
            };
        }
    }

    // Read content
    let mut content = vec![0u8; read_size as usize];
    if file.read_exact(&mut content).is_err() {
        // Try reading what we can
        let mut file = File::open(&path).unwrap();
        file.seek(SeekFrom::Start(actual_read_start)).unwrap();
        content.clear();
        file.read_to_end(&mut content).ok();
    }

    // For tail reads, skip partial first line (we may have started mid-line)
    let content_str = if is_tail_read {
        let s = String::from_utf8_lossy(&content);
        // Find first newline and skip everything before it
        if let Some(pos) = s.find('\n') {
            s[pos + 1..].to_string()
        } else {
            s.to_string()
        }
    } else {
        String::from_utf8_lossy(&content).to_string()
    };

    FileResult {
        success: true,
        content: Some(content_str),
        path: Some(path.clone()),
        name: Some(get_filename(&path)),
        size: Some(current_size),
        prev_size: Some(offset),
        mtime,
        truncated: Some(is_truncated || is_tail_read),
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

    let files: Vec<RecentFile> = match serde_json::from_str(&content) {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    // Refresh mtime, size, and exists from filesystem for each file
    files.into_iter().map(|mut f| {
        if let Ok(metadata) = fs::metadata(&f.path) {
            f.exists = true;
            f.size = Some(metadata.len());
            f.mtime = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);
        } else {
            f.exists = false;
            f.size = None;
            f.mtime = None;
        }
        f
    }).collect()
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

    // Get file metadata
    let metadata = fs::metadata(&path).ok();
    let mtime = metadata.as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    let size = metadata.as_ref().map(|m| m.len());

    // Create new entry
    let new_entry = RecentFile {
        path: path.clone(),
        name: get_filename(&path),
        last_opened: Utc::now().timestamp_millis(),
        mtime,
        size,
        exists: metadata.is_some(),
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

/// Remove a single file from the recent files list
#[tauri::command]
pub fn remove_recent_file(path: String) -> bool {
    if path.is_empty() {
        return false;
    }

    let recent_path = match get_recent_file_path() {
        Some(p) => p,
        None => return false,
    };

    if !recent_path.exists() {
        return true; // Nothing to remove
    }

    // Read existing recent files
    let mut recent_files: Vec<RecentFile> = match fs::read_to_string(&recent_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
    {
        Some(f) => f,
        None => return false,
    };

    // Remove the file from the list
    recent_files.retain(|f| f.path != path);

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

/// Export content to a file (used for logbook export)
#[tauri::command]
pub fn export_file(path: String, content: String) -> bool {
    if path.is_empty() {
        return false;
    }

    fs::write(&path, content.as_bytes()).is_ok()
}

/// Result for search_file_for_line command
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchLineResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_number: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_lines: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Search for a specific line in a file and return surrounding context
/// Used for "jump to source" when the log is outside the truncated view
#[tauri::command]
pub fn search_file_for_line(path: String, search_line: String, context_lines: usize) -> SearchLineResult {
    if path.is_empty() || search_line.is_empty() {
        return SearchLineResult {
            success: false,
            content: None,
            line_number: None,
            total_lines: None,
            error: Some("Invalid parameters".to_string()),
        };
    }

    // Read the entire file
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => {
            return SearchLineResult {
                success: false,
                content: None,
                line_number: None,
                total_lines: None,
                error: Some("Cannot read file".to_string()),
            };
        }
    };

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    // Search for the exact line
    let found_index = lines.iter().position(|&line| line == search_line);

    match found_index {
        Some(idx) => {
            // Calculate context window
            let start = if idx > context_lines { idx - context_lines } else { 0 };
            let end = std::cmp::min(idx + context_lines + 1, total_lines);

            // Extract lines with context
            let context_content: String = lines[start..end].join("\n");

            SearchLineResult {
                success: true,
                content: Some(context_content),
                line_number: Some(idx + 1), // 1-indexed
                total_lines: Some(total_lines),
                error: None,
            }
        }
        None => {
            SearchLineResult {
                success: false,
                content: None,
                line_number: None,
                total_lines: Some(total_lines),
                error: Some("Line not found in file".to_string()),
            }
        }
    }
}
