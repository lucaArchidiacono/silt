use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub trait AiProvider: Send + Sync {
    fn chat(&self, messages: &[ChatMessage]) -> Result<String>;
}

// --- Ollama (local) ---

pub struct OllamaProvider {
    base_url: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(base_url: &str, model: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            model: model.to_string(),
        }
    }
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaMessage>,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

impl AiProvider for OllamaProvider {
    fn chat(&self, messages: &[ChatMessage]) -> Result<String> {
        let url = format!("{}/api/chat", self.base_url);
        let body = OllamaChatRequest {
            model: self.model.clone(),
            messages: messages.to_vec(),
            stream: false,
        };

        log::info!("[ai] ollama request to {} model={}", url, self.model);

        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .map_err(|e| anyhow!("Ollama request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("Ollama error {status}: {text}"));
        }

        let data: OllamaChatResponse = resp
            .json()
            .map_err(|e| anyhow!("Failed to parse Ollama response: {e}"))?;

        let content = data
            .message
            .map(|m| m.content)
            .unwrap_or_default();

        log::info!("[ai] ollama response: {} chars", content.len());
        Ok(content)
    }
}

// --- OpenRouter (online) ---

pub struct OpenRouterProvider {
    api_key: String,
    model: String,
}

impl OpenRouterProvider {
    pub fn new(api_key: &str, model: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            model: model.to_string(),
        }
    }
}

#[derive(Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct OpenRouterResponse {
    choices: Option<Vec<OpenRouterChoice>>,
    error: Option<OpenRouterError>,
}

#[derive(Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMsg,
}

#[derive(Deserialize)]
struct OpenRouterMsg {
    content: String,
}

#[derive(Deserialize)]
struct OpenRouterError {
    message: String,
}

impl AiProvider for OpenRouterProvider {
    fn chat(&self, messages: &[ChatMessage]) -> Result<String> {
        let body = OpenRouterRequest {
            model: self.model.clone(),
            messages: messages.to_vec(),
        };

        log::info!("[ai] openrouter request model={}", self.model);

        let client = reqwest::blocking::Client::new();
        let resp = client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .map_err(|e| anyhow!("OpenRouter request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(anyhow!("OpenRouter error {status}: {text}"));
        }

        let data: OpenRouterResponse = resp
            .json()
            .map_err(|e| anyhow!("Failed to parse OpenRouter response: {e}"))?;

        if let Some(err) = data.error {
            return Err(anyhow!("OpenRouter API error: {}", err.message));
        }

        let content = data
            .choices
            .and_then(|c| c.into_iter().next())
            .map(|c| c.message.content)
            .unwrap_or_default();

        log::info!("[ai] openrouter response: {} chars", content.len());
        Ok(content)
    }
}

// --- Provider factory ---

pub fn make_provider(
    provider: &str,
    model: &str,
    ollama_url: Option<&str>,
    openrouter_api_key: Option<&str>,
) -> Result<Box<dyn AiProvider>> {
    match provider {
        "ollama" => {
            let url = ollama_url.unwrap_or("http://localhost:11434");
            Ok(Box::new(OllamaProvider::new(url, model)))
        }
        "openrouter" => {
            let key = openrouter_api_key
                .ok_or_else(|| anyhow!("openrouter_api_key is required for OpenRouter"))?;
            Ok(Box::new(OpenRouterProvider::new(key, model)))
        }
        other => Err(anyhow!("Unknown AI provider: {other}")),
    }
}
