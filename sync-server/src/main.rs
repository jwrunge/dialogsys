use std::{net::SocketAddr, path::PathBuf};

use dialogsys_server::{default_bind_addr, load_config, serve, AppState, GitConfig, HookConfig};

#[derive(Debug, Default)]
struct Cli {
    root: Option<PathBuf>,
    bind: Option<String>,
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

    let root = cli
        .root
        .or(config.root)
        .unwrap_or_else(|| PathBuf::from("./projects"));
    let bind = cli
        .bind
        .or(config.bind)
        .unwrap_or_else(|| default_bind_addr().to_string());
    let addr: SocketAddr = bind.parse()?;

    let hooks: HookConfig = config.hooks;
    let git: GitConfig = config.git;
    let state = AppState::new(root, hooks, git);

    println!("Dialogsys server listening on http://{addr}");
    println!("Projects root: {}", state.root().display());
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
    println!("  dialogsys-server [--root PATH] [--bind ADDR] [--config PATH]");
    println!();
    println!("Options:");
    println!("  --root PATH     Projects root directory");
    println!(
        "  --bind ADDR     HTTP bind address, default {}",
        default_bind_addr()
    );
    println!("  --config PATH   Optional JSON config file");
    println!("  -h, --help      Print help");
}
