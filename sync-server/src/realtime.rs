use std::{collections::HashMap, time::Duration};

use async_stream::stream;
use axum::response::sse::{Event, KeepAlive, Sse};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::Stream;

use crate::AuthRole;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerInfo {
    pub device_id: String,
    pub display_name: String,
    pub origin_id: Option<String>,
    pub focus_path: Option<String>,
    pub role: AuthRole,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    #[serde(rename = "presence")]
    Presence { peers: Vec<PeerInfo> },
    #[serde(rename = "fileUpdated")]
    FileUpdated {
        origin_id: String,
        path: String,
        content_hash: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceUpdate {
    pub device_id: String,
    pub display_name: String,
    pub origin_id: Option<String>,
    pub focus_path: Option<String>,
}

struct RoomState {
    sender: broadcast::Sender<String>,
    peers: HashMap<String, PeerInfo>,
}

pub struct RealtimeHub {
    rooms: RwLock<HashMap<String, RoomState>>,
}

impl RealtimeHub {
    pub fn new() -> Self {
        Self {
            rooms: RwLock::new(HashMap::new()),
        }
    }

    pub async fn room_sender(&self, project: &str) -> broadcast::Sender<String> {
        let mut rooms = self.rooms.write().await;
        if let Some(room) = rooms.get(project) {
            return room.sender.clone();
        }
        let (sender, _) = broadcast::channel(256);
        rooms.insert(
            project.to_string(),
            RoomState {
                sender: sender.clone(),
                peers: HashMap::new(),
            },
        );
        sender
    }

    pub async fn subscribe(&self, project: &str) -> broadcast::Receiver<String> {
        self.room_sender(project).await.subscribe()
    }

    pub async fn upsert_peer(&self, project: &str, update: PresenceUpdate, role: AuthRole) {
        let peer = PeerInfo {
            device_id: update.device_id.clone(),
            display_name: update.display_name,
            origin_id: update.origin_id,
            focus_path: update.focus_path,
            role,
        };
        let mut rooms = self.rooms.write().await;
        let room = rooms.entry(project.to_string()).or_insert_with(|| {
            let (sender, _) = broadcast::channel(256);
            RoomState {
                sender,
                peers: HashMap::new(),
            }
        });
        room.peers.insert(update.device_id, peer);
    }

    pub async fn remove_peer(&self, project: &str, device_id: &str) {
        let mut rooms = self.rooms.write().await;
        if let Some(room) = rooms.get_mut(project) {
            room.peers.remove(device_id);
            if room.peers.is_empty() {
                rooms.remove(project);
            }
        }
    }

    pub async fn presence_snapshot(&self, project: &str) -> Vec<PeerInfo> {
        let rooms = self.rooms.read().await;
        rooms
            .get(project)
            .map(|room| room.peers.values().cloned().collect())
            .unwrap_or_default()
    }

    async fn publish(&self, project: &str, message: &ServerMessage) {
        let json = match serde_json::to_string(message) {
            Ok(value) => value,
            Err(_) => return,
        };
        let sender = self.room_sender(project).await;
        let _ = sender.send(json);
    }

    pub async fn publish_presence(&self, project: &str) {
        let peers = self.presence_snapshot(project).await;
        self.publish(project, &ServerMessage::Presence { peers })
            .await;
    }

    pub async fn publish_file_updated(
        &self,
        project: &str,
        origin_id: &str,
        path: &str,
        content_hash: &str,
    ) {
        self.publish(
            project,
            &ServerMessage::FileUpdated {
                origin_id: origin_id.to_string(),
                path: path.to_string(),
                content_hash: content_hash.to_string(),
            },
        )
        .await;
    }

    pub fn event_stream(
        mut rx: broadcast::Receiver<String>,
    ) -> impl Stream<Item = Result<Event, std::convert::Infallible>> {
        stream! {
            loop {
                match rx.recv().await {
                    Ok(json) => {
                        yield Ok(Event::default().data(json));
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

pub fn sse_response(rx: broadcast::Receiver<String>) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    Sse::new(RealtimeHub::event_stream(rx)).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}
