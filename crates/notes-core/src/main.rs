use cubeoffice_notes_core::{browser::NotesKernel, codec, model};
use office_browser_abi::BrowserKernel;
use std::{
    env, fs,
    io::{self, BufRead, Write},
};
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("serve") {
        let mut kernel = NotesKernel::default();
        for line in io::stdin().lock().lines() {
            let request = serde_json::from_str(&line?)?;
            let reply = match kernel.command(request) {
                Ok(value) => serde_json::json!({"ok":value}),
                Err(e) => serde_json::json!({"error":{"code":e.code,"message":e.message}}),
            };
            println!("{}", serde_json::to_string(&reply)?);
            io::stdout().flush()?;
        }
    } else if args.len() == 2 {
        let mut kernel = NotesKernel::default();
        kernel.open(fs::read(&args[0])?).map_err(|e| e.message)?;
        fs::write(&args[1], kernel.save().map_err(|e| e.message)?)?;
    } else if args.len() == 1 {
        let (doc, state) = codec::read(&fs::read(&args[0])?, &model::builtin_brushes())?;
        println!(
            "{}",
            serde_json::json!({"document":doc,"past":state.past,"future":state.future})
        );
    } else {
        return Err("Usage: cubeoffice-notes <input.cubenote> [output.cubenote] | serve".into());
    }
    Ok(())
}
