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
    extract::{Path as AxumPath, Query, State},
    http::{header::AUTHORIZATION, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Extension, Json, Router,
};
use subtle::ConstantTimeEq;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{
    fs,
    io::AsyncWriteExt,
    process::Command,
    time::{timeout, Duration},
};
use tower_http::cors::{Any, CorsLayer};

mod realtime;

pub use realtime::RealtimeHub;

const DEFAULT_BIND: &str = "127.0.0.1:3210";
const HOOK_TIMEOUT_SECONDS: u64 = 30;
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthRole {
    Read,
    Write,
}

#[derive(Clone)]
struct AuthEntry {
    token: Arc<str>,
    role: AuthRole,
    projects: Option<Arc<[String]>>,
}

#[derive(Clone, Debug)]
struct RequestAuth {
    role: AuthRole,
    projects: Option<Arc<[String]>>,
}

#[derive(Clone)]
pub struct AppState {
    root: Arc<PathBuf>,
    hooks: Arc<HookConfig>,
    auth_entries: Arc<Vec<AuthEntry>>,
    realtime: Arc<RealtimeHub>,
}

impl AppState {
    pub fn new(root: PathBuf, hooks: HookConfig, auth_token: Option<String>) -> Self {
        Self::with_auth_config(root, hooks, &AuthConfig::from_write_token(auth_token))
    }

    pub fn with_auth_config(root: PathBuf, hooks: HookConfig, auth: &AuthConfig) -> Self {
        let mut auth_entries = Vec::new();
        if let Some(token) = auth.write_token.as_ref().filter(|t| !t.trim().is_empty()) {
            auth_entries.push(AuthEntry {
                token: Arc::<str>::from(token.trim()),
                role: AuthRole::Write,
                projects: None,
            });
        }
        for token in &auth.read_tokens {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                auth_entries.push(AuthEntry {
                    token: Arc::<str>::from(trimmed),
                    role: AuthRole::Read,
                    projects: None,
                });
            }
        }
        for scoped in &auth.scoped_tokens {
            let trimmed = scoped.token.trim();
            if trimmed.is_empty() {
                continue;
            }
            let projects = scoped
                .projects
                .iter()
                .map(|slug| slug.trim().to_string())
                .filter(|slug| !slug.is_empty())
                .collect::<Vec<_>>();
            auth_entries.push(AuthEntry {
                token: Arc::<str>::from(trimmed),
                role: scoped.role,
                projects: if projects.is_empty() {
                    None
                } else {
                    Some(Arc::from(projects.into_boxed_slice()))
                },
            });
        }
        Self {
            root: Arc::new(root),
            hooks: Arc::new(hooks),
            auth_entries: Arc::new(auth_entries),
            realtime: Arc::new(RealtimeHub::new()),
        }
    }

    pub fn realtime(&self) -> &RealtimeHub {
        &self.realtime
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn has_auth(&self) -> bool {
        !self.auth_entries.is_empty()
    }

    pub fn auth_token(&self) -> Option<&str> {
        self.auth_entries
            .iter()
            .find(|entry| entry.role == AuthRole::Write)
            .map(|entry| entry.token.as_ref())
    }
}

#[derive(Debug, Clone, Default)]
pub struct AuthConfig {
    pub write_token: Option<String>,
    pub read_tokens: Vec<String>,
    pub scoped_tokens: Vec<ScopedAuthToken>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedAuthToken {
    pub token: String,
    pub role: AuthRole,
    #[serde(default)]
    pub projects: Vec<String>,
}

impl AuthConfig {
    pub fn from_write_token(token: Option<String>) -> Self {
        Self {
            write_token: token,
            read_tokens: Vec::new(),
            scoped_tokens: Vec::new(),
        }
    }

    pub fn from_server_config(config: &ServerConfig) -> Self {
        let mut read_tokens = config.read_auth_tokens.clone().unwrap_or_default();
        if let Some(token) = config.read_auth_token.as_ref() {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                read_tokens.push(trimmed.to_string());
            }
        }
        Self {
            write_token: config.auth_token.clone(),
            read_tokens,
            scoped_tokens: config.scoped_auth_tokens.clone().unwrap_or_default(),
        }
    }

    pub fn has_any_token(&self) -> bool {
        self.write_token
            .as_ref()
            .is_some_and(|token| !token.trim().is_empty())
            || self
                .read_tokens
                .iter()
                .any(|token| !token.trim().is_empty())
            || self.scoped_tokens.iter().any(|entry| !entry.token.trim().is_empty())
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub root: Option<PathBuf>,
    pub bind: Option<String>,
    pub auth_token: Option<String>,
    #[serde(default)]
    pub read_auth_token: Option<String>,
    #[serde(default)]
    pub read_auth_tokens: Option<Vec<String>>,
    #[serde(default)]
    pub scoped_auth_tokens: Option<Vec<ScopedAuthToken>>,
    #[serde(default)]
    pub hooks: HookConfig,
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
    pub origin_id: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OriginMeta {
    pub origin_id: String,
    pub updated_at: String,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OriginsResponse {
    pub origins: Vec<OriginMeta>,
}

#[derive(Debug, Serialize)]
pub struct OriginResponse {
    pub origin: OriginMeta,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCapabilitiesResponse {
    pub role: AuthRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projects: Option<Vec<String>>,
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

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers([AUTHORIZATION, axum::http::header::CONTENT_TYPE])
}

fn bearer_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn verify_auth_token(expected: &str, provided: &str) -> bool {
    if expected.len() != provided.len() {
        return false;
    }
    expected.as_bytes().ct_eq(provided.as_bytes()).into()
}

fn resolve_auth(entries: &[AuthEntry], provided: &str) -> Option<RequestAuth> {
    for entry in entries {
        if verify_auth_token(entry.token.as_ref(), provided) {
            return Some(RequestAuth {
                role: entry.role,
                projects: entry.projects.clone(),
            });
        }
    }
    None
}

fn allows_project(auth: &RequestAuth, slug: &str) -> bool {
    match &auth.projects {
        None => true,
        Some(list) => list.iter().any(|project| project == slug),
    }
}

fn ensure_project_access(auth: &RequestAuth, slug: &str) -> Result<(), AppError> {
    if allows_project(auth, slug) {
        Ok(())
    } else {
        Err(AppError::new(
            StatusCode::FORBIDDEN,
            "Token not authorized for this project",
        ))
    }
}

async fn require_auth(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    if state.auth_entries.is_empty() {
        request.extensions_mut().insert(RequestAuth {
            role: AuthRole::Write,
            projects: None,
        });
        return Ok(next.run(request).await);
    }

    let auth = match bearer_token(request.headers()) {
        Some(provided) => resolve_auth(state.auth_entries.as_ref(), provided)
            .ok_or_else(|| AppError::new(StatusCode::UNAUTHORIZED, "Unauthorized"))?,
        None => return Err(AppError::new(StatusCode::UNAUTHORIZED, "Unauthorized")),
    };

    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}

async fn require_write(
    Extension(auth): Extension<RequestAuth>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    if auth.role == AuthRole::Write {
        return Ok(next.run(request).await);
    }
    Err(AppError::new(
        StatusCode::FORBIDDEN,
        "Read-only token cannot modify data",
    ))
}

async fn auth_capabilities(Extension(auth): Extension<RequestAuth>) -> Json<AuthCapabilitiesResponse> {
    Json(AuthCapabilitiesResponse {
        role: auth.role,
        projects: auth.projects.as_ref().map(|list| list.iter().cloned().collect()),
    })
}

#[derive(Debug, Deserialize)]
struct RealtimeQuery {
    token: Option<String>,
}

fn resolve_ws_auth(state: &AppState, token: Option<&str>) -> Result<RequestAuth, AppError> {
    if state.auth_entries.is_empty() {
        return Ok(RequestAuth {
            role: AuthRole::Write,
            projects: None,
        });
    }
    let provided = token
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::new(StatusCode::UNAUTHORIZED, "Unauthorized"))?;
    resolve_auth(state.auth_entries.as_ref(), provided)
        .ok_or_else(|| AppError::new(StatusCode::UNAUTHORIZED, "Unauthorized"))
}

async fn realtime_events(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
    Query(query): Query<RealtimeQuery>,
) -> Result<Response, AppError> {
    validate_slug(&slug)?;
    let auth = resolve_ws_auth(&state, query.token.as_deref())?;
    ensure_project_access(&auth, &slug)?;
    let rx = state.realtime.subscribe(&slug).await;
    Ok(realtime::sse_response(rx).into_response())
}

async fn realtime_presence(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
    Query(query): Query<RealtimeQuery>,
    Extension(auth): Extension<RequestAuth>,
    Json(body): Json<realtime::PresenceUpdate>,
) -> Result<Json<serde_json::Value>, AppError> {
    validate_slug(&slug)?;
    let ws_auth = resolve_ws_auth(&state, query.token.as_deref())?;
    ensure_project_access(&ws_auth, &slug)?;
    if body.device_id.trim().is_empty() {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "deviceId is required",
        ));
    }
    state
        .realtime
        .upsert_peer(&slug, body, auth.role)
        .await;
    state.realtime.publish_presence(&slug).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn realtime_publish(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
    Query(query): Query<RealtimeQuery>,
    Extension(auth): Extension<RequestAuth>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    validate_slug(&slug)?;
    let ws_auth = resolve_ws_auth(&state, query.token.as_deref())?;
    ensure_project_access(&ws_auth, &slug)?;
    if auth.role != AuthRole::Write {
        return Err(AppError::new(
            StatusCode::FORBIDDEN,
            "Read-only token cannot publish realtime events",
        ));
    }
    let json = serde_json::to_string(&body)
        .map_err(|e| AppError::new(StatusCode::BAD_REQUEST, format!("Invalid publish body: {e}")))?;
    state.realtime.publish_raw(&slug, &json).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn realtime_leave(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
    Query(query): Query<RealtimeQuery>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    validate_slug(&slug)?;
    let auth = resolve_ws_auth(&state, query.token.as_deref())?;
    ensure_project_access(&auth, &slug)?;
    let device_id = body
        .get("deviceId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if !device_id.is_empty() {
        state.realtime.remove_peer(&slug, device_id).await;
        state.realtime.publish_presence(&slug).await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub fn build_router(state: AppState) -> Router {
    let read_routes = Router::new()
        .route("/auth/capabilities", get(auth_capabilities))
        .route("/projects", get(list_projects))
        .route("/projects/{slug}", get(get_project))
        .route("/projects/{slug}/realtime/events", get(realtime_events))
        .route("/projects/{slug}/realtime/presence", post(realtime_presence))
        .route("/projects/{slug}/realtime/leave", post(realtime_leave))
        .route("/projects/{slug}/realtime/publish", post(realtime_publish))
        .route("/projects/{slug}/origins", get(list_origins))
        .route(
            "/projects/{slug}/origins/{origin_id}/files",
            get(list_origin_files),
        )
        .route(
            "/projects/{slug}/origins/{origin_id}/files/{*file_path}",
            get(read_origin_file),
        );

    let write_routes = Router::new()
        .route("/projects", post(create_project))
        .route("/projects/{slug}/origins/{origin_id}", post(ensure_origin))
        .route(
            "/projects/{slug}/origins/{origin_id}/files/{*file_path}",
            put(write_origin_file).delete(delete_origin_file),
        )
        .route_layer(middleware::from_fn(require_write));

    let protected = read_routes
        .merge(write_routes)
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .route("/health", get(health))
        .merge(protected)
        .layer(cors_layer())
        .with_state(state)
}

pub fn validate_bind_and_auth(addr: &SocketAddr, auth: &AuthConfig) -> Result<(), AppError> {
    if addr.ip().is_loopback() {
        return Ok(());
    }

    if auth.has_any_token() {
        return Ok(());
    }

    Err(AppError::new(
        StatusCode::BAD_REQUEST,
        format!(
            "Binding to {addr} requires authToken in config (or --auth-token). \
             Use 127.0.0.1 for local-only access without authentication."
        ),
    ))
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
    Extension(auth): Extension<RequestAuth>,
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
            if allows_project(&auth, &slug) {
                projects.push(project);
            }
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(Json(ProjectListResponse { projects }))
}

async fn create_project(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    Json(input): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectResponse>), AppError> {
    validate_slug(&input.slug)?;
    ensure_project_access(&auth, &input.slug)?;
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

    fs::create_dir_all(dir.join(".dialogsys"))
        .await
        .map_err(internal_error)?;
    fs::create_dir_all(dir.join("origins"))
        .await
        .map_err(internal_error)?;
    write_json_atomic(&dir.join("project.json"), &project).await?;
    write_origins_index(&dir, &[]).await?;

    Ok((StatusCode::CREATED, Json(ProjectResponse { project })))
}

async fn get_project(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<ProjectResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    let project = read_project_meta(&state, &slug).await?;
    Ok(Json(ProjectResponse { project }))
}

async fn list_origins(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<OriginsResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    let dir = project_dir(&state, &slug)?;
    ensure_project_exists(&dir).await?;
    let origins = read_origins_index(&dir).await?;
    Ok(Json(OriginsResponse { origins }))
}

async fn ensure_origin(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath((slug, origin_id)): AxumPath<(String, String)>,
) -> Result<Json<OriginResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    validate_origin_id(&origin_id)?;
    let dir = project_dir(&state, &slug)?;
    ensure_project_exists(&dir).await?;
    let origin = ensure_origin_scaffold(&state, &slug, &origin_id).await?;
    Ok(Json(OriginResponse { origin }))
}

async fn list_origin_files(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath((slug, origin_id)): AxumPath<(String, String)>,
) -> Result<Json<ManifestResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    validate_origin_id(&origin_id)?;
    let dir = origin_dir(&state, &slug, &origin_id)?;
    ensure_origin_exists(&dir).await?;
    let files = manifest(&dir)?;
    Ok(Json(ManifestResponse { files }))
}

async fn read_origin_file(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath((slug, origin_id, file_path)): AxumPath<(String, String, String)>,
) -> Result<Json<FileReadResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    validate_origin_id(&origin_id)?;
    let request_id = request_id();
    let rel = safe_relative_path(&file_path)?;
    let path = origin_dir(&state, &slug, &origin_id)?.join(&rel);
    ensure_origin_exists(path.parent().unwrap_or_else(|| state.root())).await?;

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
        origin_id: origin_id.clone(),
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

async fn write_origin_file(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath((slug, origin_id, file_path)): AxumPath<(String, String, String)>,
    Json(input): Json<WriteFileRequest>,
) -> Result<Json<FileWriteResponse>, AppError> {
    ensure_project_access(&auth, &slug)?;
    validate_origin_id(&origin_id)?;
    let request_id = request_id();
    let rel = safe_relative_path(&file_path)?;
    let path_string = rel_to_string(&rel);
    let origin_root = origin_dir(&state, &slug, &origin_id)?;
    ensure_origin_exists(&origin_root).await?;

    let path = origin_root.join(&rel);
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
    touch_origin(&state, &slug, &origin_id).await?;
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
        path: path_string,
        content,
        timestamp: response.timestamp.clone(),
        content_hash,
        previous_content_hash: input.previous_content_hash,
        request_id: request_id.clone(),
    };
    run_after_hook(state.hooks.after_write.as_deref(), &state, &payload).await;

    state
        .realtime
        .publish_file_updated(&slug, &origin_id, &response.path, &response.content_hash)
        .await;

    Ok(Json(response))
}

async fn delete_origin_file(
    State(state): State<AppState>,
    Extension(auth): Extension<RequestAuth>,
    AxumPath((slug, origin_id, file_path)): AxumPath<(String, String, String)>,
) -> Result<StatusCode, AppError> {
    ensure_project_access(&auth, &slug)?;
    validate_origin_id(&origin_id)?;
    let rel = safe_relative_path(&file_path)?;
    let path = origin_dir(&state, &slug, &origin_id)?.join(&rel);
    if fs::try_exists(&path).await.map_err(internal_error)? {
        fs::remove_file(&path).await.map_err(internal_error)?;
        touch_origin(&state, &slug, &origin_id).await?;
        touch_project(&state, &slug).await?;
        let path_string = rel_to_string(&rel);
        state
            .realtime
            .publish_file_updated(&slug, &origin_id, &path_string, "deleted")
            .await;
    }
    Ok(StatusCode::NO_CONTENT)
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

fn validate_origin_id(origin_id: &str) -> Result<(), AppError> {
    let valid = origin_id.len() == 36
        && origin_id
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
        && origin_id.chars().filter(|c| *c == '-').count() == 4;
    if !valid {
        return Err(AppError::new(
            StatusCode::BAD_REQUEST,
            "Invalid origin id (expected UUID)",
        ));
    }
    Ok(())
}

fn origin_dir(state: &AppState, slug: &str, origin_id: &str) -> Result<PathBuf, AppError> {
    validate_origin_id(origin_id)?;
    Ok(project_dir(state, slug)?.join("origins").join(origin_id))
}

fn origins_index_path(project_dir: &Path) -> PathBuf {
    project_dir.join(".dialogsys/origins.json")
}

async fn read_origins_index(project_dir: &Path) -> Result<Vec<OriginMeta>, AppError> {
    let path = origins_index_path(project_dir);
    if !fs::try_exists(&path).await.map_err(internal_error)? {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).await.map_err(internal_error)?;
    #[derive(Deserialize)]
    struct Index {
        origins: Vec<OriginMeta>,
    }
    let index: Index = serde_json::from_str(&raw).map_err(|e| {
        AppError::new(
            StatusCode::BAD_REQUEST,
            format!("Invalid origins index: {e}"),
        )
    })?;
    Ok(index.origins)
}

async fn write_origins_index(project_dir: &Path, origins: &[OriginMeta]) -> Result<(), AppError> {
    fs::create_dir_all(project_dir.join(".dialogsys"))
        .await
        .map_err(internal_error)?;
    write_json_atomic(
        &origins_index_path(project_dir),
        &serde_json::json!({ "origins": origins }),
    )
    .await
}

async fn touch_origin(state: &AppState, slug: &str, origin_id: &str) -> Result<(), AppError> {
    let dir = project_dir(state, slug)?;
    let mut origins = read_origins_index(&dir).await?;
    let now = now_string();
    if let Some(origin) = origins.iter_mut().find(|o| o.origin_id == origin_id) {
        origin.updated_at = now;
    } else {
        origins.push(OriginMeta {
            origin_id: origin_id.to_string(),
            updated_at: now,
            label: None,
        });
    }
    origins.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    write_origins_index(&dir, &origins).await
}

async fn ensure_origin_exists(dir: &Path) -> Result<(), AppError> {
    if !fs::try_exists(dir).await.map_err(internal_error)? {
        return Err(AppError::new(StatusCode::NOT_FOUND, "Origin not found"));
    }
    Ok(())
}

async fn ensure_origin_scaffold(
    state: &AppState,
    slug: &str,
    origin_id: &str,
) -> Result<OriginMeta, AppError> {
    let dir = origin_dir(state, slug, origin_id)?;
    let now = now_string();
    if !fs::try_exists(&dir).await.map_err(internal_error)? {
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
            "# Overview\n\nProject overview notes.\n",
        )
        .await?;
    }
    touch_origin(state, slug, origin_id).await?;
    let project_dir = project_dir(state, slug)?;
    let origins = read_origins_index(&project_dir).await?;
    Ok(origins
        .into_iter()
        .find(|o| o.origin_id == origin_id)
        .unwrap_or(OriginMeta {
            origin_id: origin_id.to_string(),
            updated_at: now,
            label: None,
        }))
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
                if part == ".dialogsys" {
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
        AppState::new(root.to_path_buf(), HookConfig::default(), None)
    }

    fn test_state_with_auth(root: &Path, token: &str) -> AppState {
        AppState::with_auth_config(
            root.to_path_buf(),
            HookConfig::default(),
            &AuthConfig::from_write_token(Some(token.to_string())),
        )
    }

    fn test_state_with_read_auth(root: &Path, write: &str, read: &str) -> AppState {
        AppState::with_auth_config(
            root.to_path_buf(),
            HookConfig::default(),
            &AuthConfig {
                write_token: Some(write.to_string()),
                read_tokens: vec![read.to_string()],
                scoped_tokens: Vec::new(),
            },
        )
    }

    async fn json_request(
        router: Router,
        method: &str,
        uri: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        json_request_with_auth(router, method, uri, body, None).await
    }

    async fn json_request_with_auth(
        router: Router,
        method: &str,
        uri: &str,
        body: Value,
        auth_token: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(token) = auth_token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let request = builder.body(Body::from(body.to_string())).unwrap();
        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, json)
    }

    #[tokio::test]
    async fn create_project_write_and_read_origin_file() {
        let temp = TestDir::new();
        let router = build_router(test_state(temp.path()));
        let origin_id = "11111111-1111-1111-1111-111111111111";

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

        let (status, _) = json_request(
            router.clone(),
            "POST",
            &format!("/projects/demo/origins/{origin_id}"),
            serde_json::json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let (status, write) = json_request(
            router.clone(),
            "PUT",
            &format!("/projects/demo/origins/{origin_id}/files/notes/overview.md"),
            serde_json::json!({ "content": "# Updated\n" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(write["project"], "demo");

        let request = Request::builder()
            .uri(format!(
                "/projects/demo/origins/{origin_id}/files/notes/overview.md"
            ))
            .body(Body::empty())
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let read: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(read["content"], "# Updated\n");
    }

    #[tokio::test]
    async fn protected_routes_require_bearer_token_when_configured() {
        let temp = TestDir::new();
        let router = build_router(test_state_with_auth(temp.path(), "test-secret"));

        let (status, _) = json_request(
            router.clone(),
            "GET",
            "/projects",
            serde_json::json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        let (status, _) = json_request_with_auth(
            router,
            "GET",
            "/projects",
            serde_json::json!({}),
            Some("test-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    #[test]
    fn validate_bind_and_auth_requires_token_for_public_bind() {
        let addr: SocketAddr = "0.0.0.0:3210".parse().unwrap();
        let no_auth = AuthConfig::default();
        let with_write = AuthConfig::from_write_token(Some("secret".to_string()));
        assert!(validate_bind_and_auth(&addr, &no_auth).is_err());
        assert!(validate_bind_and_auth(&addr, &with_write).is_ok());

        let loopback: SocketAddr = "127.0.0.1:3210".parse().unwrap();
        assert!(validate_bind_and_auth(&loopback, &no_auth).is_ok());
    }

    #[test]
    fn rejects_unsafe_paths() {
        assert!(safe_relative_path("notes/overview.md").is_ok());
        assert!(safe_relative_path("../secret").is_err());
        assert!(safe_relative_path("/secret").is_err());
        assert!(safe_relative_path(".git/config").is_ok());
        assert!(safe_relative_path(".dialogsys/origins.json").is_err());
    }

    #[tokio::test]
    async fn read_only_token_can_read_but_not_write() {
        let temp = TestDir::new();
        let router = build_router(test_state_with_read_auth(
            temp.path(),
            "write-secret",
            "read-secret",
        ));
        let origin_id = "33333333-3333-3333-3333-333333333333";

        let (status, _) = json_request_with_auth(
            router.clone(),
            "POST",
            "/projects",
            serde_json::json!({ "slug": "demo", "displayName": "Demo" }),
            Some("write-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, _) = json_request_with_auth(
            router.clone(),
            "POST",
            &format!("/projects/demo/origins/{origin_id}"),
            serde_json::json!({}),
            Some("write-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let (status, caps) = json_request_with_auth(
            router.clone(),
            "GET",
            "/auth/capabilities",
            serde_json::json!({}),
            Some("read-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(caps["role"], "read");

        let (status, _) = json_request_with_auth(
            router.clone(),
            "GET",
            "/projects",
            serde_json::json!({}),
            Some("read-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let (status, _) = json_request_with_auth(
            router,
            "PUT",
            &format!("/projects/demo/origins/{origin_id}/files/notes/read.md"),
            serde_json::json!({ "content": "blocked" }),
            Some("read-secret"),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
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
            None,
        );
        let router = build_router(state);
        let origin_id = "22222222-2222-2222-2222-222222222222";

        let (status, _) = json_request(
            router.clone(),
            "POST",
            "/projects",
            serde_json::json!({ "slug": "demo", "displayName": "Demo" }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, _) = json_request(
            router.clone(),
            "POST",
            &format!("/projects/demo/origins/{origin_id}"),
            serde_json::json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let (status, _) = json_request(
            router,
            "PUT",
            &format!("/projects/demo/origins/{origin_id}/files/notes/hooked.md"),
            serde_json::json!({ "content": "original" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let written = std::fs::read_to_string(
            temp
                .path()
                .join(format!("demo/origins/{origin_id}/notes/hooked.md")),
        )
        .unwrap();
        assert_eq!(written, "hooked");
    }

    fn test_state_with_scoped_auth(root: &Path, scoped: ScopedAuthToken) -> AppState {
        AppState::with_auth_config(
            root.to_path_buf(),
            HookConfig::default(),
            &AuthConfig {
                write_token: Some("write-secret".to_string()),
                read_tokens: Vec::new(),
                scoped_tokens: vec![scoped],
            },
        )
    }

    #[tokio::test]
    async fn scoped_read_token_limits_project_access() {
        let temp = TestDir::new();
        let router = build_router(test_state_with_scoped_auth(
            temp.path(),
            ScopedAuthToken {
                token: "demo-read".to_string(),
                role: AuthRole::Read,
                projects: vec!["demo".to_string()],
            },
        ));

        for slug in ["demo", "other"] {
            let (status, _) = json_request_with_auth(
                router.clone(),
                "POST",
                "/projects",
                serde_json::json!({ "slug": slug, "displayName": slug }),
                Some("write-secret"),
            )
            .await;
            assert_eq!(status, StatusCode::CREATED);
        }

        let (status, caps) = json_request_with_auth(
            router.clone(),
            "GET",
            "/auth/capabilities",
            serde_json::json!({}),
            Some("demo-read"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(caps["role"], "read");
        assert_eq!(caps["projects"], serde_json::json!(["demo"]));

        let (status, list) = json_request_with_auth(
            router.clone(),
            "GET",
            "/projects",
            serde_json::json!({}),
            Some("demo-read"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(list["projects"].as_array().unwrap().len(), 1);
        assert_eq!(list["projects"][0]["slug"], "demo");

        let (status, _) = json_request_with_auth(
            router.clone(),
            "GET",
            "/projects/other",
            serde_json::json!({}),
            Some("demo-read"),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
}
