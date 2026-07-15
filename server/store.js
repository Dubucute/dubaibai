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
    this._profiles = new Map();
    this._loaded = false;
  }

  // ── Ensure fallback data is loaded from JSON file ──
  _ensureLoaded() {
    if (isDbReady() || this._loaded) return;
    this._load();
    this._loaded = true;
    if (!this._profiles) this._profiles = new Map();
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
        console.warn("DB createConversation failed:", e.message);
        // On Vercel, in-memory fallback doesn't work across instances — throw so caller knows
        if (process.env.VERCEL) throw new Error("Database unavailable: " + e.message);
      }
    }

    // Fallback: in-memory (local dev only — works because there's one instance)
    this._ensureLoaded();
    const convo = { id, title, model, messages: [], created: Date.now(), updated: Date.now() };
    this.conversations.set(id, convo);
    this._save();
    return convo;
  }

  async getConversation(id, userId = null) {
    if (isDbReady()) {
      try {
        const row = await db.queryOne(
          `SELECT * FROM conversations WHERE id = $1`,
          [id]
        );
        if (!row) {
          // Check if it exists at all (without user filter) for debugging
          const anyRow = await db.queryOne(`SELECT id, user_id FROM conversations WHERE id = $1`, [id]);
          console.log(`🔍 getConversation(${id}): not found. userId=${userId}, exists_in_db=${!!anyRow}, row_user_id=${anyRow?.user_id || "N/A"}`);
          return null;
        }
        // Verify ownership if userId provided
        if (userId && row.user_id && row.user_id !== userId) {
          console.warn(`🔍 getConversation(${id}): ownership mismatch. req userId=${userId}, db user_id=${row.user_id}`);
          return null;
        }
        return this._rowToConvo(row);
      } catch (e) {
        console.warn("DB getConversation failed:", e.message, e.code);
        if (process.env.VERCEL) throw new Error("Database unavailable: " + e.message);
      }
    }

    this._ensureLoaded();
    return this.conversations.get(id) || null;
  }

  async listConversations(userId = null) {
    if (isDbReady()) {
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
        if (process.env.VERCEL) throw new Error("Database unavailable: " + e.message);
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
    if (isDbReady()) {
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
        if (process.env.VERCEL) throw new Error("Database unavailable: " + e.message);
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
    if (isDbReady()) {
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
    if (isDbReady()) {
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
        if (process.env.VERCEL) throw new Error("Database unavailable: " + e.message);
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
    if (isDbReady()) {
      try {
        // First verify the conversation exists and user owns it
        const row = await db.queryOne(`SELECT id, user_id FROM conversations WHERE id = $1`, [id]);
        if (!row) return; // Already gone — not an error
        if (userId && row.user_id && row.user_id !== userId) return; // Not owner — silently skip
        await db.query(`DELETE FROM conversations WHERE id = $1`, [id]);
        console.log(`🗑️ Deleted conversation ${id}`);
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
    if (isDbReady()) {
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
    if (isDbReady()) {
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
    if (isDbReady()) {
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
    if (isDbReady()) {
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

    if (isDbReady()) {
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

  // ── User Profiles ──

  async getProfile(userId) {
    if (!userId) return null;

    if (isDbReady()) {
      try {
        const row = await db.queryOne(
          `SELECT user_id, username, display_name, avatar_url, bio, settings, created_at, updated_at
           FROM user_settings WHERE user_id = $1`,
          [userId]
        );
        if (!row) {
          // Create default profile
          await this.createProfile(userId);
          return await this.getProfile(userId);
        }
        return {
          userId: row.user_id,
          username: row.username || null,
          displayName: row.display_name || null,
          avatarUrl: row.avatar_url || null,
          bio: row.bio || null,
          settings: row.settings || {},
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
        };
      } catch (e) {
        console.warn("DB getProfile failed:", e.message);
      }
    }

    // In-memory fallback
    this._ensureLoaded();
    if (!this._profiles) this._profiles = new Map();
    if (!this._profiles.has(userId)) {
      this._profiles.set(userId, this._defaultProfile(userId));
    }
    return this._profiles.get(userId) || null;
  }

  async createProfile(userId) {
    if (isDbReady()) {
      try {
        await db.query(
          `INSERT INTO user_settings (user_id, settings, created_at, updated_at)
           VALUES ($1, '{}'::jsonb, NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );
        return;
      } catch (e) {
        console.warn("DB createProfile failed:", e.message);
      }
    }
    if (!this._profiles) this._profiles = new Map();
    if (!this._profiles.has(userId)) {
      this._profiles.set(userId, this._defaultProfile(userId));
    }
  }

  async updateProfile(userId, updates) {
    if (!userId) return null;
    const allowed = ["username", "displayName", "avatarUrl", "bio"];
    const safe = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safe[key] = updates[key];
    }

    if (isDbReady()) {
      try {
        const setClauses = [];
        const params = [userId];
        let idx = 2;
        if (safe.username !== undefined) {
          setClauses.push(`username = $${idx++}`);
          params.push(safe.username);
        }
        if (safe.displayName !== undefined) {
          setClauses.push(`display_name = $${idx++}`);
          params.push(safe.displayName);
        }
        if (safe.avatarUrl !== undefined) {
          setClauses.push(`avatar_url = $${idx++}`);
          params.push(safe.avatarUrl);
        }
        if (safe.bio !== undefined) {
          setClauses.push(`bio = $${idx++}`);
          params.push(safe.bio);
        }

        if (setClauses.length > 0) {
          setClauses.push(`updated_at = NOW()`);
          await db.query(
            `UPDATE user_settings SET ${setClauses.join(", ")} WHERE user_id = $1`,
            params
          );
        }
        return await this.getProfile(userId);
      } catch (e) {
        console.warn("DB updateProfile failed:", e.message);
      }
    }

    // In-memory fallback
    this._ensureLoaded();
    if (!this._profiles) this._profiles = new Map();
    const profile = this._profiles.get(userId) || this._defaultProfile(userId);
    if (safe.username !== undefined) profile.username = safe.username;
    if (safe.displayName !== undefined) profile.displayName = safe.displayName;
    if (safe.avatarUrl !== undefined) profile.avatarUrl = safe.avatarUrl;
    if (safe.bio !== undefined) profile.bio = safe.bio;
    profile.updatedAt = Date.now();
    this._profiles.set(userId, profile);
    this._save();
    return profile;
  }

  _defaultProfile(userId) {
    return {
      userId,
      username: null,
      displayName: null,
      avatarUrl: null,
      bio: null,
      settings: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
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
        profiles: this._profiles ? Array.from(this._profiles.entries()) : [],
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
        if (data.profiles) this._profiles = new Map(data.profiles);
        if (!this._profiles) this._profiles = new Map();
      }
    } catch (e) {
      /* start fresh */
    }
  }
}

module.exports = new Store();
