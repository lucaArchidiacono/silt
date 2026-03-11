use std::fs::{self, OpenOptions};
use std::path::Path;

use anyhow::Result;
use simplelog::{
    CombinedLogger, LevelFilter, SharedLogger, TermLogger, TerminalMode, WriteLogger,
};

/// Initialize file-based logging to `<data_dir>/silt.log`.
///
/// Writes all log messages (debug and above) to the log file.
/// If `with_terminal` is true, also prints info-level messages to stderr
/// (useful for CLI debugging with SILT_LOG=1).
///
/// Safe to call multiple times — subsequent calls are no-ops.
pub fn init_file_logging(data_dir: &Path, with_terminal: bool) -> Result<()> {
    fs::create_dir_all(data_dir)?;

    let log_path = data_dir.join("silt.log");

    // Rotate if log file exceeds 5 MB
    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() > 5 * 1024 * 1024 {
            let rotated = data_dir.join("silt.log.old");
            let _ = fs::rename(&log_path, rotated);
        }
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    let config = simplelog::ConfigBuilder::new()
        .set_time_format_rfc3339()
        .set_target_level(LevelFilter::Off)
        .set_thread_level(LevelFilter::Off)
        .build();

    let mut loggers: Vec<Box<dyn SharedLogger>> = vec![WriteLogger::new(
        LevelFilter::Debug,
        config.clone(),
        file,
    )];

    if with_terminal {
        loggers.push(TermLogger::new(
            LevelFilter::Info,
            config,
            TerminalMode::Stderr,
            simplelog::ColorChoice::Auto,
        ));
    }

    // CombinedLogger::init returns Err if already initialized — that's fine.
    let _ = CombinedLogger::init(loggers);

    Ok(())
}
