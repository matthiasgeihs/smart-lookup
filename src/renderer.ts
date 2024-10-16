import './index.css';
// Explicit reference to `dist` needed because of packaging problem with `ollama/browser`.
import ollama, { GenerateResponse } from 'ollama/dist/browser.cjs';
import markdownit from 'markdown-it';

const OLLAMA_MODEL = 'llama3.1';

const input = document.getElementById("input") as HTMLTextAreaElement;
const output = document.getElementById("output");

interface ElectronAPI {
  resizeWindow: (width: number, height: number) => void;
  hideWindow: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function refreshWindowSize() {
  const width = window.innerWidth;
  const height = document.documentElement.offsetHeight;
  window.electronAPI.resizeWindow(width, height);
}

const md = markdownit();

function setOutputMarkdown(text: string) {
  output.hidden = text.length == 0;
  const result = md.render(text);
  output.innerHTML = result;
  refreshWindowSize();
}

interface AbortableAsyncIterator<T extends object> {
  abort(): void;
  [Symbol.asyncIterator](): AsyncGenerator<Awaited<T>, void, unknown>;
}

let response: AbortableAsyncIterator<GenerateResponse>;

async function run() {
  try {
    // Disable input to signal generation is in progress.
    input.disabled = true;

    const prompt = `<!-- Request -->

${input.value}

<!-- Response in Markdown syntax -->

`;
    response = await ollama.generate({ model: OLLAMA_MODEL, prompt: prompt, stream: true });
    
    let responseText = '';
    setOutputMarkdown(responseText);
    for await (const part of response) {
      responseText += part.response;
      setOutputMarkdown(responseText);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      throw error;
    }
  } finally {
    response = undefined;
    input.disabled = false;

    // Return focus to input so that we can continue typing.
    // input.focus()
  }
}

// Submit on Enter.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    run();
  }
});

// Clear or hide on Escape.
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (input.value) {
      // Abort, if model is currently responding.
      if (response) {
        response.abort();
      }

      // Clear input and output. Set focus on input and refresh window size.
      input.value = '';
      input.disabled = false;
      input.focus()
      setOutputMarkdown('');
      refreshWindowSize();
    } else {
      window.electronAPI.hideWindow();
    }
  }
});

// Focus input and hide output on load.
input.focus();
output.hidden = true;

// Adapt input size when content changes.
input.addEventListener("input", () => {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
  refreshWindowSize();
});

input.rows = 1;
