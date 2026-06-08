use std::{
    fmt,
    net::SocketAddr,
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{
    fs,
    io::AsyncWriteExt,
    process::Command,
    time::{timeout, Duration},
};
use tower_http::cors::CorsLayer;

const DEFAULT_BIND: &str = "127.0.0.1:3210";
const HOOK_TIMEOUT_SECONDS: u64 = 30;
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub struct AppState {
    root: Arc<PathBuf>,
    hooks: Arc<HookConfig>,
    git: Arc<GitConfig>,
}

impl AppState {
    pub fn new(root: PathBuf, hooks: HookConfig, git: GitConfig) -> Self {
        Self {
            root: Arc::new(root),
            hooks: Arc::new(hooks),
            git: Arc::new(git),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub root: Option<PathBuf>,
    pub bind: Option<String>,
    #[serde(default)]
    pub hooks: HookConfig,
    #[serde(default)]
    pub git: GitConfig,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookConfig {
    pub before_read: Option<Vec<String>>,
    pub after_read: Option<Vec<String>>,
    pub before_write: Option<Vec<String>>,
    pub after_write: Option<Vec<String>>,
    pub before_snapshot: Option<Vec<String>>,
    pub after_snapshot: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auto_commit: bool,
    #[serde(default = "default_git_remote")]
    pub remote: String,
    #[serde(default = "default_git_branch")]
    pub branch: String,
    #[serde(default)]
    pub push: bool,
}

impl Default for GitConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_commit: false,
            remote: default_git_remote(),
            branch: default_git_branch(),
            push: false,
        }
    }
}

fn default_git_remote() -> String {
    "origin".to_string()
}

fn default_git_branch() -> String {
    "main".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    pub slug: String,
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub slug: String,
    pub display_name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub content: String,
    pub previous_content_hash: Option<String>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectListResponse {
    pub projects: Vec<ProjectMeta>,
}

#[derive(Debug, Serialize)]
pub struct ProjectResponse {
    pub project: ProjectMeta,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub modified_at: String,
    pub content_hash: String,
}

#[derive(Debug, Serialize)]
pub struct ManifestResponse {
    pub files: Vec<FileInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResponse {
    pub project: String,
    pub path: String,
    pub content: String,
    pub timestamp: String,
    pub content_hash: String,
    pub request_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResponse {
    pub project: String,
    pub path: String,
    pub timestamp: String,
    pub content_hash: String,
    pub request_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotResponse {
    pub project: String,
    pub created: bool,
    pub pushed: bool,
    pub timestamp: String,
    pub request_id: String,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookPayload {
    pub event: HookEvent,
    pub project: String,
    pub path: String,
    pub content: String,
    pub timestamp: String,
    pub content_hash: String,
    pub previous_content_hash: Option<String>,
    pub request_id: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HookEvent {
    BeforeRead,
    AfterRead,
    BeforeWrite,
    AfterWrite,
    BeforeSnapshot,
    AfterSnapshot,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HookResult {
    content: Option<String>,
    reject: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: String,
    request_id: Option<String>,
}

#[derive(Debug)]
pub struct AppError {
    status: StatusCode,
    message: String,
    request_id: Option<String>,
}

impl AppError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            request_id: None,
        }
    }

    fn with_request_id(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
                request_id: self.request_id,
            }),
        )
            .into_response()
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

pub fn default_bind_addr() -> &'static str {
    DEFAULT_BIND
}

pub async fn load_config(path: Option<&Path>) -> Result<ServerConfig, AppError> {
    let Some(path) = path else {
        return Ok(ServerConfig::default());
    };
    let raw = fs::read_to_string(path)
        .await
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("Config read failed: {e}")))?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("Config parse failed: {e}")))
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{slug}", get(get_project))
        .route("/projects/{slug}/files", get(list_files))
        .route(
            "/projects/{slug}/files/{*file_path}",
            get(read_file).put(write_file),
        )
        .route("/projects/{slug}/snapshot", post(create_snapshot))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

pub async fn serve(state: AppState, addr: SocketAddr) -> Result<(), AppError> {
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Bind failed: {e}"),
        )
    })?;
    axum::serve(listener, build_router(state))
        .await
        .map_err(|e| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Server failed: {e}"),
            )
        })
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn list_projects(
    State(state): State<AppState>,
) -> Result<Json<ProjectListResponse>, AppError> {
    fs::create_dir_all(state.root())
        .await
        .map_err(internal_error)?;

    let mut entries = fs::read_dir(state.root()).await.map_err(internal_error)?;
    let mut projects = Vec::new();

    while let Some(entry) = entries.next_entry().await.map_err(internal_error)? {
        let file_type = entry.file_type().await.map_err(internal_error)?;
        if !file_type.is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().to_string();
        if let Ok(project) = read_project_meta(&state, &slug).await {
            projects.push(project);
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(Json(ProjectListResponse { projects }))
}

async fn create_project(
    State(state): State<AppState>,
    Json(input): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectResponse>), AppError> {
    validate_slug(&input.slug)?;
    if input.display_name.trim().is_empty() {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Project displayName is required",
        ));
    }

    let dir = project_dir(&state, &input.slug)?;
    if fs::try_exists(&dir).await.map_err(internal_error)? {
        return Err(AppError::new(
            StatusCode::CONFLICT,
            "Project already exists",
        ));
    }

    let now = now_string();
    let project = ProjectMeta {
        slug: input.slug.clone(),
        display_name: input.display_name.trim().to_string(),
        description: input.description,
        created_at: now.clone(),
        updated_at: now,
    };

    fs::create_dir_all(dir.join("dialogs"))
        .await
        .map_err(internal_error)?;
    fs::create_dir_all(dir.join("sequences"))
        .await
        .map_err(internal_error)?;
    fs::create_dir_all(dir.join("notes"))
        .await
        .map_err(internal_error)?;
    fs::create_dir_all(dir.join("export/godot/dialogs"))
        .await
        .map_err(internal_error)?;
    write_json_atomic(&dir.join("project.json"), &project).await?;
    write_json_atomic(
        &dir.join("characters.json"),
        &serde_json::json!({ "characters": [] }),
    )
    .await?;
    write_json_atomic(
        &dir.join("gameState.json"),
        &serde_json::json!({ "properties": [] }),
    )
    .await?;
    write_atomic(
        &dir.join("notes/overview.md"),
        &format!("# {}\n\nProject overview notes.\n", project.display_name),
    )
    .await?;

    if state.git.enabled {
        ensure_git_repo(&state, &input.slug).await?;
        let _ = commit_project(&state, &input.slug, "project created").await?;
    }

    Ok((StatusCode::CREATED, Json(ProjectResponse { project })))
}

async fn get_project(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<ProjectResponse>, AppError> {
    let project = read_project_meta(&state, &slug).await?;
    Ok(Json(ProjectResponse { project }))
}

async fn list_files(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<ManifestResponse>, AppError> {
    let dir = project_dir(&state, &slug)?;
    ensure_project_exists(&dir).await?;
    let files = manifest(&dir)?;
    Ok(Json(ManifestResponse { files }))
}

async fn read_file(
    State(state): State<AppState>,
    AxumPath((slug, file_path)): AxumPath<(String, String)>,
) -> Result<Json<FileReadResponse>, AppError> {
    let request_id = request_id();
    let rel = safe_relative_path(&file_path)?;
    let path = project_dir(&state, &slug)?.join(&rel);
    ensure_project_exists(path.parent().unwrap_or_else(|| state.root())).await?;

    let content = fs::read_to_string(&path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => AppError::new(StatusCode::NOT_FOUND, "File not found"),
            std::io::ErrorKind::InvalidData => {
                AppError::new(StatusCode::BAD_REQUEST, "File is not valid UTF-8")
            }
            _ => internal_error(e),
        })?;
    let timestamp = now_string();
    let content_hash = content_hash(&content);
    let path_string = rel_to_string(&rel);

    let payload = HookPayload {
        event: HookEvent::BeforeRead,
        project: slug.clone(),
        path: path_string.clone(),
        content: content.clone(),
        timestamp: timestamp.clone(),
        content_hash: content_hash.clone(),
        previous_content_hash: None,
        request_id: request_id.clone(),
    };
    run_before_hook(state.hooks.before_read.as_deref(), &state, &slug, &payload)
        .await
        .map_err(|e| e.with_request_id(request_id.clone()))?;

    let response = FileReadResponse {
        project: slug.clone(),
        path: path_string.clone(),
        content,
        timestamp: timestamp.clone(),
        content_hash,
        request_id: request_id.clone(),
    };

    let payload = HookPayload {
        event: HookEvent::AfterRead,
        project: slug,
        path: path_string,
        content: response.content.clone(),
        timestamp,
        content_hash: response.content_hash.clone(),
        previous_content_hash: None,
        request_id: request_id.clone(),
    };
    run_after_hook(state.hooks.after_read.as_deref(), &state, &payload).await;

    Ok(Json(response))
}

async fn write_file(
    State(state): State<AppState>,
    AxumPath((slug, file_path)): AxumPath<(String, String)>,
    Json(input): Json<WriteFileRequest>,
) -> Result<Json<FileWriteResponse>, AppError> {
    let request_id = request_id();
    let rel = safe_relative_path(&file_path)?;
    let path_string = rel_to_string(&rel);
    let project_dir = project_dir(&state, &slug)?;
    ensure_project_exists(&project_dir).await?;

    let path = project_dir.join(&rel);
    if let Some(expected_hash) = input.previous_content_hash.as_deref() {
        if fs::try_exists(&path).await.map_err(internal_error)? {
            let existing = fs::read_to_string(&path).await.map_err(internal_error)?;
            let actual_hash = content_hash(&existing);
            if actual_hash != expected_hash {
                return Err(AppError::new(
                    StatusCode::CONFLICT,
                    "File changed since previous_content_hash",
                )
                .with_request_id(request_id));
            }
        }
    }

    let timestamp = input.timestamp.unwrap_or_else(now_string);
    let mut content = input.content;
    let mut payload = HookPayload {
        event: HookEvent::BeforeWrite,
        project: slug.clone(),
        path: path_string.clone(),
        content: content.clone(),
        timestamp: timestamp.clone(),
        content_hash: content_hash(&content),
        previous_content_hash: input.previous_content_hash.clone(),
        request_id: request_id.clone(),
    };

    if let Some(next_content) =
        run_before_hook(state.hooks.before_write.as_deref(), &state, &slug, &payload)
            .await
            .map_err(|e| e.with_request_id(request_id.clone()))?
    {
        content = next_content;
        payload.content = content.clone();
        payload.content_hash = content_hash(&content);
    }

    write_atomic(&path, &content).await?;
    touch_project(&state, &slug).await?;

    let content_hash = content_hash(&content);
    let response = FileWriteResponse {
        project: slug.clone(),
        path: path_string.clone(),
        timestamp: now_string(),
        content_hash: content_hash.clone(),
        request_id: request_id.clone(),
    };

    let payload = HookPayload {
        event: HookEvent::AfterWrite,
        project: slug.clone(),
        path: path_string.clone(),
        content,
        timestamp: response.timestamp.clone(),
        content_hash,
        previous_content_hash: input.previous_content_hash,
        request_id: request_id.clone(),
    };
    run_after_hook(state.hooks.after_write.as_deref(), &state, &payload).await;

    if state.git.enabled && state.git.auto_commit {
        let _ = commit_project(&state, &slug, &format!("write: {path_string}")).await?;
    }

    Ok(Json(response))
}

async fn create_snapshot(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<SnapshotResponse>, AppError> {
    let request_id = request_id();
    let timestamp = now_string();
    let payload = HookPayload {
        event: HookEvent::BeforeSnapshot,
        project: slug.clone(),
        path: String::new(),
        content: String::new(),
        timestamp: timestamp.clone(),
        content_hash: String::new(),
        previous_content_hash: None,
        request_id: request_id.clone(),
    };
    run_before_hook(
        state.hooks.before_snapshot.as_deref(),
        &state,
        &slug,
        &payload,
    )
    .await
    .map_err(|e| e.with_request_id(request_id.clone()))?;

    let created = if state.git.enabled {
        ensure_git_repo(&state, &slug).await?;
        commit_project(&state, &slug, "manual snapshot").await?
    } else {
        false
    };
    let pushed = if created && state.git.push {
        push_project(&state, &slug).await?
    } else {
        false
    };

    let payload = HookPayload {
        event: HookEvent::AfterSnapshot,
        project: slug.clone(),
        path: String::new(),
        content: String::new(),
        timestamp: timestamp.clone(),
        content_hash: String::new(),
        previous_content_hash: None,
        request_id: request_id.clone(),
    };
    run_after_hook(state.hooks.after_snapshot.as_deref(), &state, &payload).await;

    Ok(Json(SnapshotResponse {
        project: slug,
        created,
        pushed,
        timestamp,
        request_id,
    }))
}

fn validate_slug(slug: &str) -> Result<(), AppError> {
    let mut chars = slug.chars();
    let Some(first) = chars.next() else {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Invalid project slug",
        ));
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Invalid project slug",
        ));
    }
    if slug.len() > 64
        || !slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
    {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Invalid project slug",
        ));
    }
    Ok(())
}

fn project_dir(state: &AppState, slug: &str) -> Result<PathBuf, AppError> {
    validate_slug(slug)?;
    Ok(state.root().join(slug))
}

fn safe_relative_path(raw: &str) -> Result<PathBuf, AppError> {
    if raw.is_empty() || raw.contains('\0') {
        return Err(AppError::new(StatusCode::BAD_REQUEST, "Invalid file path"));
    }

    let path = Path::new(raw);
    if path.is_absolute() {
        return Err(AppError::new(StatusCode::BAD_REQUEST, "Invalid file path"));
    }

    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                if part == ".git" {
                    return Err(AppError::new(StatusCode::BAD_REQUEST, "Invalid file path"));
                }
                clean.push(part);
            }
            _ => return Err(AppError::new(StatusCode::BAD_REQUEST, "Invalid file path")),
        }
    }

    if clean.as_os_str().is_empty() {
        return Err(AppError::new(StatusCode::BAD_REQUEST, "Invalid file path"));
    }
    Ok(clean)
}

fn rel_to_string(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

async fn read_project_meta(state: &AppState, slug: &str) -> Result<ProjectMeta, AppError> {
    let dir = project_dir(state, slug)?;
    ensure_project_exists(&dir).await?;
    let raw = fs::read_to_string(dir.join("project.json"))
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => {
                AppError::new(StatusCode::NOT_FOUND, "Project not found")
            }
            _ => internal_error(e),
        })?;
    serde_json::from_str(&raw).map_err(|e| {
        AppError::new(
            StatusCode::BAD_REQUEST,
            format!("Invalid project.json: {e}"),
        )
    })
}

async fn ensure_project_exists(dir: &Path) -> Result<(), AppError> {
    if !fs::try_exists(dir).await.map_err(internal_error)? {
        return Err(AppError::new(StatusCode::NOT_FOUND, "Project not found"));
    }
    Ok(())
}

async fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        + "\n";
    write_atomic(path, &content).await
}

async fn write_atomic(path: &Path, content: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(internal_error)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("dialogsys")
    ));
    fs::write(&tmp, content).await.map_err(internal_error)?;
    fs::rename(&tmp, path).await.map_err(internal_error)?;
    Ok(())
}

async fn touch_project(state: &AppState, slug: &str) -> Result<(), AppError> {
    let mut meta = read_project_meta(state, slug).await?;
    meta.updated_at = now_string();
    write_json_atomic(&project_dir(state, slug)?.join("project.json"), &meta).await
}

fn manifest(dir: &Path) -> Result<Vec<FileInfo>, AppError> {
    let mut files = Vec::new();
    collect_manifest(dir, dir, &mut files)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

fn collect_manifest(root: &Path, dir: &Path, files: &mut Vec<FileInfo>) -> Result<(), AppError> {
    for entry in std::fs::read_dir(dir).map_err(internal_error)? {
        let entry = entry.map_err(internal_error)?;
        let path = entry.path();
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let metadata = entry.metadata().map_err(internal_error)?;
        if metadata.is_dir() {
            collect_manifest(root, &path, files)?;
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let rel = path.strip_prefix(root).map_err(|e| {
            AppError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Manifest failed: {e}"),
            )
        })?;
        let bytes = std::fs::read(&path).map_err(internal_error)?;
        files.push(FileInfo {
            path: rel_to_string(rel),
            size: metadata.len(),
            modified_at: system_time_to_string(metadata.modified().map_err(internal_error)?),
            content_hash: bytes_hash(&bytes),
        });
    }
    Ok(())
}

async fn run_before_hook(
    command: Option<&[String]>,
    state: &AppState,
    project: &str,
    payload: &HookPayload,
) -> Result<Option<String>, AppError> {
    let Some(command) = command else {
        return Ok(None);
    };
    let output = run_hook_command(command, state, project, payload).await?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(None);
        }
        let result: HookResult = serde_json::from_str(&stdout).map_err(|e| {
            AppError::new(
                StatusCode::BAD_REQUEST,
                format!("Hook returned invalid JSON: {e}"),
            )
        })?;
        if let Some(reason) = result.reject {
            return Err(AppError::new(StatusCode::FORBIDDEN, reason));
        }
        return Ok(result.content);
    }

    Err(AppError::new(
        StatusCode::FORBIDDEN,
        hook_stderr("Hook rejected request", &output.stderr),
    ))
}

async fn run_after_hook(command: Option<&[String]>, state: &AppState, payload: &HookPayload) {
    let Some(command) = command else {
        return;
    };
    let _ = run_hook_command(command, state, &payload.project, payload).await;
}

async fn run_hook_command(
    command: &[String],
    state: &AppState,
    project: &str,
    payload: &HookPayload,
) -> Result<std::process::Output, AppError> {
    if command.is_empty() {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Hook command is empty",
        ));
    }

    let mut child = Command::new(&command[0])
        .args(&command[1..])
        .current_dir(state.root())
        .env("DIALOGSYS_PROJECT", project)
        .env("DIALOGSYS_PROJECT_DIR", project_dir(state, project)?)
        .env("DIALOGSYS_FILE", &payload.path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("Hook failed: {e}")))?;

    if let Some(mut stdin) = child.stdin.take() {
        let body = serde_json::to_vec(payload).map_err(internal_error)?;
        stdin.write_all(&body).await.map_err(internal_error)?;
    }

    timeout(
        Duration::from_secs(HOOK_TIMEOUT_SECONDS),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| AppError::new(StatusCode::REQUEST_TIMEOUT, "Hook timed out"))?
    .map_err(internal_error)
}

async fn ensure_git_repo(state: &AppState, slug: &str) -> Result<(), AppError> {
    let dir = project_dir(state, slug)?;
    ensure_project_exists(&dir).await?;
    if fs::try_exists(dir.join(".git"))
        .await
        .map_err(internal_error)?
    {
        return Ok(());
    }
    run_git(&dir, &["init", "-b", &state.git.branch]).await?;
    run_git(&dir, &["config", "user.email", "dialogsys-server@local"]).await?;
    run_git(&dir, &["config", "user.name", "Dialogsys Server"]).await?;
    Ok(())
}

async fn commit_project(state: &AppState, slug: &str, message: &str) -> Result<bool, AppError> {
    let dir = project_dir(state, slug)?;
    ensure_git_repo(state, slug).await?;
    run_git(&dir, &["add", "-A"]).await?;
    let changed = !run_git_status(&dir, &["diff", "--cached", "--quiet"]).await?;
    if !changed {
        return Ok(false);
    }
    run_git(&dir, &["commit", "-m", message]).await?;
    Ok(true)
}

async fn push_project(state: &AppState, slug: &str) -> Result<bool, AppError> {
    let dir = project_dir(state, slug)?;
    run_git(&dir, &["push", &state.git.remote, &state.git.branch]).await?;
    Ok(true)
}

async fn run_git(dir: &Path, args: &[&str]) -> Result<(), AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("git failed: {e}")))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::new(
            StatusCode::BAD_REQUEST,
            hook_stderr("git command failed", &output.stderr),
        ))
    }
}

async fn run_git_status(dir: &Path, args: &[&str]) -> Result<bool, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("git failed: {e}")))?;
    Ok(output.status.success())
}

fn hook_stderr(prefix: &str, stderr: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    if stderr.is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {stderr}")
    }
}

fn content_hash(content: &str) -> String {
    bytes_hash(content.as_bytes())
}

fn bytes_hash(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn system_time_to_string(time: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}

fn request_id() -> String {
    let count = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{count}", Utc::now().timestamp_micros())
}

fn internal_error(e: impl fmt::Display) -> AppError {
    AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

pub fn empty_body() -> Body {
    Body::empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use serde_json::Value;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tower::ServiceExt;

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("dialogsys-server-test-{}-{id}", std::process::id()));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn test_state(root: &Path) -> AppState {
        AppState::new(
            root.to_path_buf(),
            HookConfig::default(),
            GitConfig::default(),
        )
    }

    async fn json_request(
        router: Router,
        method: &str,
        uri: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        let request = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn create_project_write_and_read_file() {
        let temp = TestDir::new();
        let router = build_router(test_state(temp.path()));

        let (status, _) = json_request(
            router.clone(),
            "POST",
            "/projects",
            serde_json::json!({
                "slug": "demo",
                "displayName": "Demo",
                "description": "Test project"
            }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, write) = json_request(
            router.clone(),
            "PUT",
            "/projects/demo/files/notes/overview.md",
            serde_json::json!({ "content": "# Updated\n" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(write["project"], "demo");

        let request = Request::builder()
            .uri("/projects/demo/files/notes/overview.md")
            .body(Body::empty())
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let read: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(read["content"], "# Updated\n");
    }

    #[test]
    fn rejects_unsafe_paths() {
        assert!(safe_relative_path("notes/overview.md").is_ok());
        assert!(safe_relative_path("../secret").is_err());
        assert!(safe_relative_path("/secret").is_err());
        assert!(safe_relative_path(".git/config").is_err());
    }

    #[tokio::test]
    async fn before_write_hook_can_transform_content() {
        let temp = TestDir::new();
        let hook_path = temp.path().join("hook.sh");
        std::fs::write(
            &hook_path,
            "#!/bin/sh\ncat >/dev/null\nprintf '{\"content\":\"hooked\"}'\n",
        )
        .unwrap();

        let state = AppState::new(
            temp.path().to_path_buf(),
            HookConfig {
                before_write: Some(vec![
                    "sh".to_string(),
                    hook_path.to_string_lossy().to_string(),
                ]),
                ..HookConfig::default()
            },
            GitConfig::default(),
        );
        let router = build_router(state);

        let (status, _) = json_request(
            router.clone(),
            "POST",
            "/projects",
            serde_json::json!({ "slug": "demo", "displayName": "Demo" }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, _) = json_request(
            router,
            "PUT",
            "/projects/demo/files/notes/hooked.md",
            serde_json::json!({ "content": "original" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let written = std::fs::read_to_string(temp.path().join("demo/notes/hooked.md")).unwrap();
        assert_eq!(written, "hooked");
    }
}
