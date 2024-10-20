
import './index.css';

// Explicit reference to `dist` needed because of packaging problem with `ollama/browser`.
import ollama, { GenerateResponse } from 'ollama/dist/browser.cjs';

import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/default.min.css';

const OLLAMA_MODEL = 'llama3.1';

const input = document.getElementById("input") as HTMLTextAreaElement;
const outputDiv = document.getElementById("output");
const outputText = document.getElementById("output-text");

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
  // +1 to ensure scrollbars are not shown
  const height = document.documentElement.offsetHeight + 1;
  window.electronAPI.resizeWindow(null, height);
}

const md = markdownit({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, {language: lang}).value;
      } catch (err) {
        console.warn(err);
      }
    }
    return ''; // use external default escaping
  }
});

function setOutputMarkdown(text: string) {
  outputDiv.hidden = text.length == 0;
  const result = md.render(text);
  outputText.innerHTML = result;
  // output.innerText = text + '\n\n' + result;
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
      alert(`${error}\n\nIs Ollama running?`);
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
        return;
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

// Adapt input size when content changes.
input.addEventListener("input", () => {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
  refreshWindowSize();
});

// Focus input and hide output on load.
input.focus();
outputDiv.hidden = true;
refreshWindowSize();

window.addEventListener("error", (event) => {
  alert(`Renderer: Unhandled error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  alert(`Renderer: Unhandled promise rejection: ${event.reason}`);
});
