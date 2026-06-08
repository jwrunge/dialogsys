use std::{net::SocketAddr, path::PathBuf};

use dialogsys_server::{
    default_bind_addr, load_config, serve, validate_bind_and_auth, AppState, AuthConfig, HookConfig,
};

#[derive(Debug, Default)]
struct Cli {
    root: Option<PathBuf>,
    bind: Option<String>,
    auth_token: Option<String>,
    config: Option<PathBuf>,
}

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = parse_args(std::env::args().skip(1))?;
    let config = load_config(cli.config.as_deref()).await?;
    let mut auth = AuthConfig::from_server_config(&config);

    let root = cli
        .root
        .or(config.root)
        .unwrap_or_else(|| PathBuf::from("./projects"));
    let bind = cli
        .bind
        .or(config.bind)
        .unwrap_or_else(|| default_bind_addr().to_string());
    let addr: SocketAddr = bind.parse()?;
    if let Some(token) = cli.auth_token {
        auth.write_token = Some(token);
    }

    validate_bind_and_auth(&addr, &auth)?;

    let hooks: HookConfig = config.hooks;
    let state = AppState::with_auth_config(root, hooks, &auth);

    println!("Dialogsys server listening on http://{addr}");
    println!("Projects root: {}", state.root().display());
    if state.has_auth() {
        println!("Authentication: Bearer token required (write and/or read-only tokens)");
    } else {
        println!("Authentication: disabled (loopback only)");
    }
    serve(state, addr).await?;
    Ok(())
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Cli, String> {
    let mut cli = Cli::default();
    let mut args = args.into_iter();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--root" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--root requires a value".to_string())?;
                cli.root = Some(PathBuf::from(value));
            }
            "--bind" => {
                cli.bind = Some(
                    args.next()
                        .ok_or_else(|| "--bind requires a value".to_string())?,
                );
            }
            "--auth-token" => {
                cli.auth_token = Some(
                    args.next()
                        .ok_or_else(|| "--auth-token requires a value".to_string())?,
                );
            }
            "--config" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--config requires a value".to_string())?;
                cli.config = Some(PathBuf::from(value));
            }
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            unknown => return Err(format!("Unknown argument: {unknown}")),
        }
    }

    Ok(cli)
}

fn print_help() {
    println!("dialogsys-server");
    println!();
    println!("Self-hosted Dialogsys project sync server.");
    println!();
    println!("Usage:");
    println!("  dialogsys-server [--root PATH] [--bind ADDR] [--auth-token TOKEN] [--config PATH]");
    println!();
    println!("Options:");
    println!("  --root PATH        Projects root directory");
    println!(
        "  --bind ADDR        HTTP bind address, default {}",
        default_bind_addr()
    );
    println!("  --auth-token TOKEN Shared secret for Authorization: Bearer <token>");
    println!("  --config PATH      Optional JSON config file");
    println!("  -h, --help         Print help");
    println!();
    println!("Non-loopback bind addresses require --auth-token or authToken in config.");
}
