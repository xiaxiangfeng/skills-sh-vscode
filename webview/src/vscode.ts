declare const acquireVsCodeApi: undefined | (() => {
  postMessage: (message: unknown) => void;
  getState: () => Record<string, unknown> | undefined;
  setState: (state: Record<string, unknown>) => void;
});

type VscodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => Record<string, unknown> | undefined;
  setState: (state: Record<string, unknown>) => void;
};

const fallbackApi: VscodeApi = {
  postMessage: () => undefined,
  getState: () => undefined,
  setState: () => undefined
};

export const vscode: VscodeApi = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi()
  : fallbackApi;
