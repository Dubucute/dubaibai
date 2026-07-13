// ===== In-Memory Store with Persistence =====
const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");
const { v4: uuidv4 } = require("uuid");

const DATA_FILE = path.join(CONFIG.dataDir, "store.json");

class Store {
  constructor() {
    this.conversations = new Map();
    this.documents = new Map();
    this.sessions = new Map();
    this._load();
  }

  // ── Conversations ──
  createConversation(title = "New Chat", model = CONFIG.defaultModel) {
    const id = uuidv4();
    const convo = { id, title, model, messages: [], created: Date.now(), updated: Date.now() };
    this.conversations.set(id, convo);
    this._save();
    return convo;
  }

  getConversation(id) {
    return this.conversations.get(id);
  }

  listConversations() {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updated - a.updated)
      .map(({ id, title, model, created, updated, messages }) => ({
        id,
        title,
        model,
        created,
        updated,
        msgCount: messages.length,
        preview: messages.length > 0 ? messages[messages.length - 1].content.slice(0, 80) : "",
      }));
  }

  addMessage(convoId, message) {
    const convo = this.conversations.get(convoId);
    if (!convo) return null;
    convo.messages.push({ ...message, timestamp: Date.now() });
    convo.updated = Date.now();
    if (convo.messages.length === 1 && message.role === "user") {
      convo.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
    }
    this._save();
    return convo;
  }

  updateMessage(convoId, msgIndex, updates) {
    const convo = this.conversations.get(convoId);
    if (!convo || !convo.messages[msgIndex]) return null;
    Object.assign(convo.messages[msgIndex], updates);
    convo.updated = Date.now();
    this._save();
    return convo;
  }

  updateConversationTitle(id, title) {
    const convo = this.conversations.get(id);
    if (!convo) return null;
    convo.title = title;
    convo.updated = Date.now();
    this._save();
    return convo;
  }

  deleteConversation(id) {
    this.conversations.delete(id);
    this._save();
  }

  forkConversation(id) {
    const convo = this.conversations.get(id);
    if (!convo) return null;
    const fork = {
      ...convo,
      id: uuidv4(),
      title: convo.title + " (fork)",
      created: Date.now(),
      updated: Date.now(),
      messages: [...convo.messages],
    };
    this.conversations.set(fork.id, fork);
    this._save();
    return fork;
  }

  // ── Documents (for RAG) ──
  addDocument(name, content, type = "text") {
    const id = uuidv4();
    const doc = { id, name, content, type, created: Date.now() };
    this.documents.set(id, doc);
    this._save();
    return doc;
  }

  getDocument(id) {
    return this.documents.get(id);
  }

  listDocuments() {
    return Array.from(this.documents.values()).map(({ id, name, type, created, content }) => ({
      id,
      name,
      type,
      created,
      size: content.length,
    }));
  }

  deleteDocument(id) {
    this.documents.delete(id);
    this._save();
  }

  searchDocuments(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const doc of this.documents.values()) {
      const lines = doc.content.split("\n");
      let score = 0;
      const matches = [];
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(q)) {
          score++;
          matches.push({ line: i + 1, text: line.trim().slice(0, 200) });
        }
      });
      if (score > 0)
        results.push({ id: doc.id, name: doc.name, score, matches: matches.slice(0, 5) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // ── Persistence ──
  _save() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        conversations: Array.from(this.conversations.entries()),
        documents: Array.from(this.documents.entries()),
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      /* silent */
    }
  }

  _load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (data.conversations) this.conversations = new Map(data.conversations);
        if (data.documents) this.documents = new Map(data.documents);
      }
    } catch (e) {
      /* start fresh */
    }
  }
}

module.exports = new Store();
