// ===== State Management =====
class AppState {
  constructor() {
    this._listeners = {};
    this._data = {
      theme: localStorage.getItem("dubu_theme") || "dark",
      temperature: parseFloat(localStorage.getItem("dubu_temp")) || 0.7,
      agentModel: localStorage.getItem("dubu_agent_model") || "",
      autoFallback: localStorage.getItem("dubu_auto_fallback") !== "false",
      autoModelSelect: localStorage.getItem("dubu_auto_select") !== "false",
      activePanel: "agent",
      conversations: [],
      documents: [],
      agentHistory: [],
      tokenCount: 0,
      agentImages: [],
      agentDocs: [],
    };
  }

  get(key) {
    return this._data[key];
  }

  set(key, val) {
    const prev = this._data[key];

    // Basic validation
    if (key === "temperature") {
      val = Math.max(0, Math.min(2, parseFloat(val) || 0.7));
    }

    this._data[key] = val;
    this._notify(key, val, prev);

    if (this._persistKeys.includes(key)) {
      this._persist();
    }
  }

  get _persistKeys() {
    return [
      "temperature",
      "agentModel",
      "theme",
      "autoFallback",
      "autoModelSelect",
    ];
  }

  on(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(fn);
    return () => {
      this._listeners[key] = this._listeners[key].filter((f) => f !== fn);
    };
  }

  _notify(key, val, prev) {
    (this._listeners[key] || []).forEach((fn) => fn(val, prev));
    (this._listeners["*"] || []).forEach((fn) => fn(key, val, prev));
  }

  _persist() {
    try {
      localStorage.setItem("dubu_theme", this._data.theme || "dark");
      localStorage.setItem("dubu_temp", String(this._data.temperature));
      localStorage.setItem("dubu_agent_model", this._data.agentModel || "");
      localStorage.setItem("dubu_auto_fallback", String(this._data.autoFallback !== false));
      localStorage.setItem("dubu_auto_select", String(this._data.autoModelSelect !== false));
    } catch (e) {
      // Storage full or unavailable - silently continue
      console.warn("State persist failed:", e.message);
    }
  }
}

window.state = new AppState();
