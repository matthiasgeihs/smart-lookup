import "./index.css";
import "./tooltip.css";

// Explicit reference to `dist` needed because of packaging problem with `ollama/browser`.
import ollama, { GenerateResponse } from "ollama/dist/browser.cjs";

import markdownit from "markdown-it";
import mila from "markdown-it-link-attributes";
import hljs from "highlight.js";
import "highlight.js/styles/default.min.css";
import { defaultSettings, Settings } from "./settings";

let settings = defaultSettings();

const input = document.getElementById("input") as HTMLTextAreaElement;
const outputContainer = document.getElementById("output-container");
const outputText = document.getElementById("output-text");
const copyMarkdownButton = document.getElementById("copy-markdown-button");
const loader = document.getElementById("loader");

let markdownText = "";

interface ElectronAPI {
  resizeWindow: (width: number, height: number) => void;
  hideWindow: () => void;
  getSettings: () => void;
  onUpdateSettings: (callback: (settings: Settings) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function refreshColors() {
  document.body.style.color = settings.foregroundColor;
  document.body.style.backgroundColor = settings.backgroundColor;
  loader.style.borderTopColor = settings.foregroundColor;
}
refreshColors();

window.electronAPI.onUpdateSettings((_settings: Settings) => {
  settings = _settings;
  refreshColors();
});

function refreshWindowSize() {
  // +1 to ensure scrollbars are not shown
  const height = document.documentElement.offsetHeight + 1;
  window.electronAPI.resizeWindow(null, height);
}

const md = markdownit({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (err) {
        console.warn(err);
      }
    }
    return ""; // use external default escaping
  },
});

md.use(mila, {
  attrs: {
    target: "_blank",
    rel: "noopener",
  },
});

function setOutputMarkdown(text: string) {
  outputContainer.hidden = text.length == 0;

  if (text.startsWith("```")) {
    const i = text.indexOf("\n");
    text = text.substring(i + 1);
  }

  const result = md.render(text);
  outputText.innerHTML = result;
  // outputText.innerText = text + "\n\n" + result; // For testing.
  markdownText = text;

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
    loader.hidden = false;
    copyMarkdownButton.style.display = "none";

    const prompt = `<!-- Request -->

${input.value}

<!-- Response in Markdown syntax -->

`;
    response = await ollama.generate({
      model: settings.model,
      prompt: prompt,
      // system: "Respond in raw Markdown. Do not start with triple backticks.", // May need to adapt this depending on model.
      stream: true,
    });

    let responseText = "";
    setOutputMarkdown(responseText);
    for await (const part of response) {
      responseText += part.response;
      setOutputMarkdown(responseText);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      alert(`${error}\n\nIs Ollama running?`);
    }
  } finally {
    // Reset UI state.
    response = undefined;
    input.disabled = false;
    loader.hidden = true;
    copyMarkdownButton.style.display = "inline-block";
    refreshWindowSize();

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
      input.value = "";
      input.disabled = false;
      input.focus();
      setOutputMarkdown("");
      refreshWindowSize();
    } else {
      window.electronAPI.hideWindow();
    }
  }
});

// Adapt input size when content changes.
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
  refreshWindowSize();
});

// Copy Markdown.
copyMarkdownButton.addEventListener("click", () => {
  if (markdownText) {
    navigator.clipboard.writeText(markdownText).then(() => {
      alert("Copied to clipboard");
    });
  }
});

// Initialize HTML elements.
input.focus();
outputContainer.hidden = true;
refreshWindowSize();
loader.hidden = true;

// Load settings.
window.electronAPI.getSettings();

// Error handling

window.addEventListener("error", (event) => {
  alert(`Renderer: Unhandled error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  alert(`Renderer: Unhandled promise rejection: ${event.reason}`);
});
