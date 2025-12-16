// Show console window on Windows for debugging logs
// Comment out the next line to hide console in production
// #![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::fs;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

struct BackendState {
  child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
  started: Mutex<bool>,
}

#[tauri::command]
async fn start_backend(app: tauri::AppHandle) -> Result<String, String> {
  let state = app.state::<BackendState>();
  
  let mut started_guard = state.started.lock().unwrap();
  if *started_guard {
    return Ok("Backend already running".to_string());
  }
  
  *started_guard = true;
  drop(started_guard);
  
  let shell = app.shell();
  
  // Get the app's config directory for storing .env file
  let app_dir = app.path().app_config_dir().unwrap_or_default();
  
  // Ensure the config directory exists
  if let Err(e) = fs::create_dir_all(&app_dir) {
    eprintln!("[Forge] Warning: Could not create config directory: {}", e);
  }
  
  let mut sidecar = shell
    .sidecar("forge-backend")
    .map_err(|e| {
      let mut started = state.started.lock().unwrap();
      *started = false;
      format!("Failed to create sidecar command: {}", e)
    })?;
  
  // Set the working directory to the app's config directory
  // This ensures the backend can find the .env file
  sidecar = sidecar.current_dir(&app_dir);
  
  let (mut rx, child) = sidecar
    .spawn()
    .map_err(|e| {
      let mut started = state.started.lock().unwrap();
      *started = false;
      format!("Failed to spawn sidecar: {}", e)
    })?;
  
  {
    let mut child_guard = state.child.lock().unwrap();
    *child_guard = Some(child);
  }
  
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
          println!("[Backend] {}", String::from_utf8_lossy(&line));
        }
        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
          eprintln!("[Backend Error] {}", String::from_utf8_lossy(&line));
        }
        tauri_plugin_shell::process::CommandEvent::Error(err) => {
          eprintln!("[Backend Fatal] {}", err);
        }
        _ => {}
      }
    }
  });
  
  Ok("Backend started".to_string())
}

fn stop_backend_sync(app: &tauri::AppHandle) {
  let state = app.state::<BackendState>();
  let mut child_guard = state.child.lock().unwrap();
  
  if let Some(child) = child_guard.take() {
    let _ = child.kill();
    println!("[Forge] Backend stopped");
  }
  
  let mut started = state.started.lock().unwrap();
  *started = false;
}

#[tauri::command]
async fn stop_backend(app: tauri::AppHandle) -> Result<String, String> {
  stop_backend_sync(&app);
  Ok("Backend stopped".to_string())
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(BackendState {
      child: Mutex::new(None),
      started: Mutex::new(false),
    })
    .invoke_handler(tauri::generate_handler![start_backend, stop_backend])
    .setup(|app| {
      let handle = app.handle().clone();
      let window = app.get_webview_window("main").unwrap();
      tauri::async_runtime::spawn(async move {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if let Err(e) = start_backend(handle).await {
          eprintln!("Failed to start backend: {}", e);
        }
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let _ = window.show();
      });
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        stop_backend_sync(window.app_handle());
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
