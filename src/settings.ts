export interface Settings {
  model: string;
  foregroundColor: string;
  backgroundColor: string;
  runOnStartup: boolean;
  keyboardShortcut: string;
}

export function defaultSettings(): Settings {
  return {
    model: 'llama3.1',
    foregroundColor: 'black',
    backgroundColor: 'whitesmoke',
    runOnStartup: false,
    keyboardShortcut: 'Alt+Space',
  }
}
