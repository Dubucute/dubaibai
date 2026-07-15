// ===== Data Store =====
// Hybrid store: PostgreSQL-backed when DB is available, in-memory/JSON fallback otherwise.
// All conversations and documents can be scoped to a user (userId).

const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");
const { v4: uuidv4 } = require("uuid");

// DB module — gracefully handles missing DATABASE_URL
let db;
try {
  db = require("./db");
} catch (e) {
  db = null;
}

function isDbReady() {
  return db && db.DB_READY;
}

const DATA_FILE = path.join(CONFIG.dataDir, "store.json");

class Store {
  constructor() {
    // In-memory fallback maps (used when DB is not enabled)
    this.conversations = new Map();
    this.documents = new Map();
    this._loaded = false;
  }

  // ── Ensure fallback data is loaded from JSON file ──
  _ensureLoaded() {
    if (isDbReady() || this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // ── Build userId filter condition ──
  _userClause(userId) {
    if (userId) {
      return { text: "user_id = $1", params: [userId] };
    }
    return { text: "user_id IS NULL", params: [] };
  }

  // ── Conversations ──

  async createConversation(title = "New Chat", model = CONFIG.defaultModel, userId = null) {
    const id = uuidv4();

    if (isDbReady()) {
      try {
        await db.query(
          `INSERT INTO conversations (id, user_id, title, model, messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4, '[]', NOW(), NOW())`,
          [id, userId || null, title, model]
        );
        return { id, title, model, messages: [], created: Date.now(), updated: Date.now(), userId: userId || null };
      } catch (e) {
        console.warn("DB createConversation failed, falling back:", e.message);
      }
    }

    // Fallback: in-memory
    this._ensureLoaded();
    const convo = { id, title, model, messages: [], created: Date.now(), updated: Date.now() };
    this.conversations.set(id, convo);
    this._save();
    return convo;
  }

  async getConversation(id, userId = null) {
    if (DB_ENABLED) {
      try {
        const row = await db.queryOne(
          `SELECT * FROM conversations WHERE id = $1`,
          [id]
        );
        if (!row) return null;
        // Verify ownership if userId provided
        if (userId && row.user_id && row.user_id !== userId) return null;
        return this._rowToConvo(row);
      } catch (e) {
        console.warn("DB getConversation failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    return this.conversations.get(id) || null;
  }

  async listConversations(userId = null) {
    if (DB_ENABLED) {
      try {
        const clause = this._userClause(userId);
        const rows = await db.query(
          `SELECT id, title, model, created_at, updated_at, messages
           FROM conversations
           WHERE ${clause.text}
           ORDER BY updated_at DESC
           LIMIT 100`,
          clause.params
        );
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          model: r.model,
          created: new Date(r.created_at).getTime(),
          updated: new Date(r.updated_at).getTime(),
          msgCount: (r.messages || []).length,
          preview:
            r.messages && r.messages.length > 0 && r.messages[r.messages.length - 1]?.content
              ? r.messages[r.messages.length - 1].content.slice(0, 80)
              : "",
        }));
      } catch (e) {
        console.warn("DB listConversations failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updated - a.updated)
      .map(({ id, title, model, created, updated, messages }) => ({
        id,
        title,
        model,
        created,
        updated,
        msgCount: messages.length,
        preview:
          messages.length > 0 && messages[messages.length - 1]?.content
            ? messages[messages.length - 1].content.slice(0, 80)
            : "",
      }));
  }

  async addMessage(convoId, message, userId = null) {
    if (DB_ENABLED) {
      try {
        // Check ownership
        const convo = await this.getConversation(convoId, userId);
        if (!convo) return null;

        const msgWithTimestamp = { ...message, timestamp: Date.now() };
        await db.query(
          `UPDATE conversations
           SET messages = messages || $1::jsonb, updated_at = NOW(),
               title = CASE
                 WHEN jsonb_array_length(messages) = 0 AND $2 THEN LEFT($3, 50) || CASE WHEN LENGTH($3) > 50 THEN '...' ELSE '' END
                 ELSE title
               END
           WHERE id = $4`,
          [JSON.stringify([msgWithTimestamp]), message.role === "user", message.content || "", convoId]
        );
        return await this.getConversation(convoId);
      } catch (e) {
        console.warn("DB addMessage failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
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

  async updateMessage(convoId, msgIndex, updates, userId = null) {
    if (DB_ENABLED) {
      try {
        const convo = await this.getConversation(convoId, userId);
        if (!convo) return null;

        const row = await db.queryOne(
          `SELECT messages FROM conversations WHERE id = $1`,
          [convoId]
        );
        if (!row || !row.messages[msgIndex]) return null;
        const msgs = row.messages;
        msgs[msgIndex] = { ...msgs[msgIndex], ...updates };
        await db.query(
          `UPDATE conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(msgs), convoId]
        );
        return await this.getConversation(convoId);
      } catch (e) {
        console.warn("DB updateMessage failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    const convo = this.conversations.get(convoId);
    if (!convo || !convo.messages[msgIndex]) return null;
    Object.assign(convo.messages[msgIndex], updates);
    convo.updated = Date.now();
    this._save();
    return convo;
  }

  async updateConversationTitle(id, title, userId = null) {
    if (DB_ENABLED) {
      try {
        const convo = await this.getConversation(id, userId);
        if (!convo) return null;
        await db.query(
          `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
          [title, id]
        );
        return { ...convo, title };
      } catch (e) {
        console.warn("DB updateConversationTitle failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    const convo = this.conversations.get(id);
    if (!convo) return null;
    convo.title = title;
    convo.updated = Date.now();
    this._save();
    return convo;
  }

  async deleteConversation(id, userId = null) {
    if (DB_ENABLED) {
      try {
        const clause = userId ? "id = $1 AND user_id = $2" : "id = $1 AND user_id IS NULL";
        const params = userId ? [id, userId] : [id];
        await db.query(`DELETE FROM conversations WHERE ${clause}`, params);
        return;
      } catch (e) {
        console.warn("DB deleteConversation failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    this.conversations.delete(id);
    this._save();
  }

  async forkConversation(id, userId = null) {
    if (DB_ENABLED) {
      try {
        const orig = await this.getConversation(id, userId);
        if (!orig) return null;

        const newId = uuidv4();
        await db.query(
          `INSERT INTO conversations (id, user_id, title, model, messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())`,
          [newId, userId || null, orig.title + " (fork)", orig.model, JSON.stringify(orig.messages)]
        );
        return await this.getConversation(newId, userId);
      } catch (e) {
        console.warn("DB forkConversation failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
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

  async addDocument(name, content, type = "text", userId = null) {
    const id = uuidv4();

    if (isDbReady()) {
      try {
        await db.query(
          `INSERT INTO documents (id, user_id, name, content, type, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [id, userId || null, name, content, type]
        );
        return { id, name, content, type, created: Date.now() };
      } catch (e) {
        console.warn("DB addDocument failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    const doc = { id, name, content, type, created: Date.now() };
    this.documents.set(id, doc);
    this._save();
    return doc;
  }

  async getDocument(id, userId = null) {
    if (DB_ENABLED) {
      try {
        const row = await db.queryOne(`SELECT * FROM documents WHERE id = $1`, [id]);
        if (!row) return null;
        if (userId && row.user_id && row.user_id !== userId) return null;
        return {
          id: row.id,
          name: row.name,
          content: row.content,
          type: row.type,
          created: new Date(row.created_at).getTime(),
        };
      } catch (e) {
        console.warn("DB getDocument failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    return this.documents.get(id) || null;
  }

  async listDocuments(userId = null) {
    if (DB_ENABLED) {
      try {
        const clause = this._userClause(userId);
        const rows = await db.query(
          `SELECT id, name, type, created_at, content
           FROM documents
           WHERE ${clause.text}
           ORDER BY created_at DESC`,
          clause.params
        );
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          created: new Date(r.created_at).getTime(),
          size: r.content.length,
        }));
      } catch (e) {
        console.warn("DB listDocuments failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    return Array.from(this.documents.values()).map(({ id, name, type, created, content }) => ({
      id,
      name,
      type,
      created,
      size: content.length,
    }));
  }

  async deleteDocument(id, userId = null) {
    if (DB_ENABLED) {
      try {
        const clause = userId ? "id = $1 AND user_id = $2" : "id = $1 AND user_id IS NULL";
        const params = userId ? [id, userId] : [id];
        await db.query(`DELETE FROM documents WHERE ${clause}`, params);
        return;
      } catch (e) {
        console.warn("DB deleteDocument failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    this.documents.delete(id);
    this._save();
  }

  async searchDocuments(query, userId = null) {
    const q = query.toLowerCase();

    if (DB_ENABLED) {
      try {
        const clause = this._userClause(userId);
        const rows = await db.query(
          `SELECT id, name, content FROM documents WHERE ${clause.text}`,
          clause.params
        );
        return this._searchInDocs(rows, q);
      } catch (e) {
        console.warn("DB searchDocuments failed, falling back:", e.message);
      }
    }

    this._ensureLoaded();
    return this._searchInDocs(Array.from(this.documents.values()), q);
  }

  _searchInDocs(docs, q) {
    const results = [];
    for (const doc of docs) {
      const content = doc.content || "";
      const lines = content.split("\n");
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

  // ── Row to conversation object mapper ──
  _rowToConvo(row) {
    return {
      id: row.id,
      title: row.title,
      model: row.model,
      messages: row.messages || [],
      created: new Date(row.created_at).getTime(),
      updated: new Date(row.updated_at).getTime(),
      userId: row.user_id,
    };
  }

  // ── Fallback: JSON file persistence ──
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
