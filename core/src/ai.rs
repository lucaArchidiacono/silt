use anyhow::Result;

pub trait AiProvider {
    fn embed(&self, text: &str) -> Result<Vec<f32>>;
    fn complete(&self, prompt: &str) -> Result<String>;
}
