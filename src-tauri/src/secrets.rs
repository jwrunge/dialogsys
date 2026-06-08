use std::fs;
use std::path::Path;

use keyring::Entry;
use tauri::Manager;

const SERVICE: &str = "com.dialogsys.editor";
const ACCOUNT: &str = "sync-server-token";
const TOKEN_FILE: &str = "sync.token";

pub fn token_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(TOKEN_FILE))
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

pub fn write_token_file(path: &Path, token: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, token).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn delete_token_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn sync_token_file_from_keychain(app: &tauri::AppHandle) -> Result<(), String> {
    let path = token_file_path(app)?;
    match read_sync_token_from_keyring() {
        Ok(Some(token)) => write_token_file(&path, &token),
        Ok(None) => delete_token_file(&path),
        Err(err) => Err(err),
    }
}

pub fn read_sync_token_from_keyring() -> Result<Option<String>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(token) if token.trim().is_empty() => Ok(None),
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

pub fn write_sync_token_to_keyring(token: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry
        .set_password(token.trim())
        .map_err(|e| e.to_string())
}

pub fn delete_sync_token_from_keyring() -> Result<(), String> {
    let entry = keyring_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn has_sync_token(_app: tauri::AppHandle) -> Result<bool, String> {
    Ok(read_sync_token_from_keyring()?.is_some())
}

#[tauri::command]
pub fn set_sync_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return clear_sync_token(app);
    }
    write_sync_token_to_keyring(trimmed)?;
    let path = token_file_path(&app)?;
    write_token_file(&path, trimmed)
}

#[tauri::command]
pub fn clear_sync_token(app: tauri::AppHandle) -> Result<(), String> {
    delete_sync_token_from_keyring()?;
    let path = token_file_path(&app)?;
    delete_token_file(&path)
}
