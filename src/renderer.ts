import './index.css';
// Explicit reference to `dist` needed because of packaging problem with `ollama/browser`.
import ollama from 'ollama/dist/browser.cjs';

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

function setOutput(text: string) {
  output.hidden = text.length == 0;
  output.innerText = text;
  refreshWindowSize();
}

async function run() {
  try {
    input.disabled = true;
    const inputText = input.value;
    const message = { role: 'user', content: inputText };
    const response = await ollama.chat({ model: 'llama3.1', messages: [message], stream: true });
    
    setOutput('');
    for await (const part of response) {
      setOutput(output.innerText + part.message.content);
    }
  } finally {
    input.disabled = false;
  }
}

// Submit on Enter.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    run();
  } else if (event.key === "Escape") {
    if (input.value) {
      input.value = '';
      setOutput('');
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
