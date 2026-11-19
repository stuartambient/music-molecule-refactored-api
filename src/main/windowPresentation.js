const modes = {
  default: { size: [800, 600], resizable: true },
  'player-library': { size: [660, 500], resizable: true },
  player: { size: [300, 500], resizable: false },
  mini: { size: [290, 350], resizable: false, pinned: true },
  'mini-expanded': { size: [380, 620], resizable: false, pinned: true }
};

export function createWindowPresentation(getWindow) {
  let mode;
  let artwork;
  let currentWindow;
  function activeWindow() {
    const window = getWindow();
    if (window !== currentWindow) {
      currentWindow = window;
      mode = undefined;
      artwork = null;
    }
    return window;
  }

  function configure(window, next) {
    const config = modes[next];
    if (window.isMaximized()) window.unmaximize();
    window.setResizable(true);
    window.setMinimumSize(...config.size);
    window.setSize(...config.size, false);
    window.setMaximizable(config.resizable);
    window.setResizable(config.resizable);
    window.setAlwaysOnTop(!!config.pinned);
  }

  return {
    setMode(next) {
      const window = activeWindow();
      if (!modes[next] || mode === next || !window || window.isDestroyed()) return;
      mode = next;
      if (!artwork) configure(window, next);
    },
    setArtwork(enabled) {
      const window = activeWindow();
      if (!window || window.isDestroyed()) return false;
      if (enabled) {
        if (artwork) return true;
        artwork = {
          mode,
          bounds: window.getNormalBounds(),
          maximized: window.isMaximized(),
          minimum: window.getMinimumSize(),
          resizable: window.isResizable(),
          maximizable: window.isMaximizable(),
          pinned: window.isAlwaysOnTop()
        };
        window.setResizable(true);
        window.setMaximizable(true);
        window.setAlwaysOnTop(false);
        window.setMinimumSize(480, 360);
        window.maximize();
        return true;
      }
      if (!artwork) return false;
      const previous = artwork;
      artwork = null;
      if (previous.mode !== mode) configure(window, mode);
      else {
        window.setMinimumSize(...previous.minimum);
        if (previous.maximized) window.maximize();
        else {
          window.unmaximize();
          window.setBounds(previous.bounds, false);
        }
        window.setMaximizable(previous.maximizable);
        window.setResizable(previous.resizable);
        window.setAlwaysOnTop(previous.pinned);
      }
      return false;
    }
  };
}
