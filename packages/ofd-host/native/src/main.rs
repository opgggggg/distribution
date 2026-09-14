mod crypto;
mod der;
mod document;
mod media;
mod platform_trust;
mod printing;
mod revocation;
mod service;
mod trust;
mod verification;
use serde_json::{json, Value};
use std::{
    io::{BufRead, Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn main() {
    if let Err(error) = run() {
        eprintln!("cubeoffice-ofd-service: {error}");
        std::process::exit(1)
    }
}
fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.first().is_some_and(|a| a == "--version") {
        println!("cubeoffice-ofd-service {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let value = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .map(PathBuf::from)
            .ok_or_else(|| format!("Missing {name}"))
    };
    let state = value("--state-dir")?;
    let input = value("--input-dir")?;
    let resource = value("--resource-dir").unwrap_or_else(|_| {
        std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .to_owned()
    });
    let service = Arc::new(service::Service::new(state, input, &resource)?);
    let output = Arc::new(Mutex::new(std::io::stdout()));
    let mut reader = std::io::BufReader::new(std::io::stdin());
    let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let result = (|| -> Result<(), String> {
        loop {
            let mut line = vec![];
            if reader
                .by_ref()
                .take(2 * 1024 * 1024 + 1)
                .read_until(b'\n', &mut line)
                .map_err(|e| e.to_string())?
                == 0
            {
                break;
            }
            if line.len() > 2 * 1024 * 1024 {
                return Err("RPC request is too large".into());
            }
            let request: Value = serde_json::from_slice(&line).map_err(|e| e.to_string())?;
            let method = request["method"].as_str().unwrap_or("");
            let bulk = [
                "upload.accept",
                "signature.verify",
                "media.prepare",
                "print.submit",
            ]
            .contains(&method);
            if bulk && active.load(std::sync::atomic::Ordering::Acquire) >= 4 {
                let mut out = output.lock().unwrap();
                let _ = serde_json::to_writer(
                    &mut *out,
                    &json!({"id":request["id"],"error":"文档服务繁忙，请稍后重试"}),
                );
                let _ = out.write_all(b"\n");
                let _ = out.flush();
                continue;
            }
            if bulk {
                active.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            }
            let active = active.clone();
            let service = service.clone();
            let output = output.clone();
            std::thread::spawn(move || {
                let id = request["id"].clone();
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    service.dispatch(
                        request["method"].as_str().unwrap_or(""),
                        request["params"].clone(),
                    )
                }))
                .unwrap_or_else(|_| Err("Document service rejected malformed input".into()));
                let response = match result {
                    Ok(result) => json!({"id":id,"result":result}),
                    Err(error) => json!({"id":id,"error":error}),
                };
                let mut out = output.lock().unwrap();
                let _ = serde_json::to_writer(&mut *out, &response);
                let _ = out.write_all(b"\n");
                let _ = out.flush();
                if bulk {
                    active.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
                }
            });
        }
        Ok(())
    })();
    service.shutdown();
    result
}

#[cfg(test)]
mod tests;
