//! Command-line / deep-link launch actions for tray-first and shell integration.

use serde::Serialize;

/// Actions requested before the UI finishes loading.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum LaunchAction {
    Share { path: String },
    Connect { code: String },
    Portal,
}

/// Parsed process launch flags.
#[derive(Debug, Clone, Default)]
pub struct LaunchFlags {
    pub hidden: bool,
    pub actions: Vec<LaunchAction>,
}

/// Parse argv for Wormhole desktop launch flags.
pub fn parse_launch_args<I, S>(args: I) -> LaunchFlags
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut flags = LaunchFlags::default();
    let mut iter = args.into_iter().map(|s| s.as_ref().to_string());
    // skip argv0
    let _ = iter.next();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--hidden" | "-h" => flags.hidden = true,
            "--share" => {
                if let Some(path) = iter.next() {
                    flags.actions.push(LaunchAction::Share { path });
                }
            }
            "--connect" => {
                if let Some(code) = iter.next() {
                    flags.actions.push(LaunchAction::Connect {
                        code: code.to_uppercase(),
                    });
                }
            }
            "--portal" => flags.actions.push(LaunchAction::Portal),
            other if other.starts_with("wormhole:") => {
                if let Some(action) = parse_wormhole_url(other) {
                    flags.actions.push(action);
                }
            }
            other if other.starts_with("--share=") => {
                let path = other.trim_start_matches("--share=").to_string();
                if !path.is_empty() {
                    flags.actions.push(LaunchAction::Share { path });
                }
            }
            other if other.starts_with("--connect=") => {
                let code = other.trim_start_matches("--connect=").to_uppercase();
                if !code.is_empty() {
                    flags.actions.push(LaunchAction::Connect { code });
                }
            }
            _ => {}
        }
    }
    flags
}

/// Parse wormhole://join/... and wormhole://share?path=... URLs.
pub fn parse_wormhole_url(url: &str) -> Option<LaunchAction> {
    let url = url.trim();
    let path = url
        .strip_prefix("wormhole://")
        .or_else(|| url.strip_prefix("wormhole:"))?;
    let path = path.trim_start_matches('/');

    if let Some(rest) = path.strip_prefix("share") {
        // share?path=/tmp/foo or share?/tmp/foo
        let rest = rest.trim_start_matches('?').trim_start_matches('/');
        if let Some(p) = rest.strip_prefix("path=") {
            let decoded = urlencoding_decode(p);
            if !decoded.is_empty() {
                return Some(LaunchAction::Share { path: decoded });
            }
        } else if !rest.is_empty() && !rest.contains('=') {
            return Some(LaunchAction::Share {
                path: urlencoding_decode(rest),
            });
        }
        return None;
    }

    let code = if let Some(rest) = path.strip_prefix("join/") {
        rest
    } else if let Some(rest) = path.strip_prefix("j/") {
        rest
    } else if path.starts_with("connect/") {
        path.trim_start_matches("connect/")
    } else {
        path
    };

    let normalized: String = code
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if normalized.len() >= 6 {
        Some(LaunchAction::Connect { code: normalized })
    } else {
        None
    }
}

fn urlencoding_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &input[i + 1..i + 3];
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v as char);
                    i += 3;
                } else {
                    out.push('%');
                    i += 1;
                }
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_share_and_hidden() {
        let flags = parse_launch_args(["wormhole", "--hidden", "--share", "/tmp/renders"]);
        assert!(flags.hidden);
        match &flags.actions[0] {
            LaunchAction::Share { path } => assert_eq!(path, "/tmp/renders"),
            _ => panic!("expected share"),
        }
    }

    #[test]
    fn parses_share_deep_link() {
        let action = parse_wormhole_url("wormhole://share?path=%2FUsers%2Falex%2FRenders").unwrap();
        match action {
            LaunchAction::Share { path } => assert_eq!(path, "/Users/alex/Renders"),
            _ => panic!("expected share"),
        }
    }

    #[test]
    fn parses_join_deep_link() {
        let action = parse_wormhole_url("wormhole://join/7KJM-XBCD").unwrap();
        match action {
            LaunchAction::Connect { code } => assert_eq!(code, "7KJM-XBCD"),
            _ => panic!("expected connect"),
        }
    }
}
