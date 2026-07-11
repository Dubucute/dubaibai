// ===== Tool: Document Search / RAG =====
const CONFIG = require('../config');
const store = require('../store');
const { register } = require('./index');

register({
  name: 'search_documents',
  description: 'Search uploaded documents for relevant information, then answer questions using RAG (Retrieval Augmented Generation).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query or question to answer from documents.' },
      document_id: { type: 'string', description: 'Optional: search only a specific document by ID.' },
      use_llm: { type: 'boolean', description: 'Whether to use an LLM to synthesize the answer.', default: true },
    },
    required: ['query'],
  },

  async execute(args) {
    const { query, document_id, use_llm = true } = args;
    const apiKey = CONFIG.apiKey;

    // Search documents
    let results;
    if (document_id) {
      const doc = store.getDocument(document_id);
      if (!doc) throw new Error(`Document ${document_id} not found`);
      results = store.searchDocuments(query).filter(r => r.id === document_id);
    } else {
      results = store.searchDocuments(query);
    }

    if (results.length === 0) {
      return { found: false, message: 'No relevant documents found.', query };
    }

    // Build context from top matches
    const context = results.slice(0, 3).map(r => {
      const doc = store.getDocument(r.id);
      return `--- ${doc.name} ---\n${r.matches.map(m => `[Line ${m.line}] ${m.text}`).join('\n')}`;
    }).join('\n\n');

    if (!use_llm) {
      return { found: true, query, results: results.slice(0, 5) };
    }

    // Use LLM to answer
    const url = `${CONFIG.apiBase}/v1/chat/completions`;
    const body = {
      model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
      messages: [
        { role: 'system', content: 'You are a document analysis assistant. Answer the user\'s question based ONLY on the provided document context. If the context doesn\'t contain enough information, say so.' },
        { role: 'user', content: `Context from documents:\n${context}\n\nQuestion: ${query}\n\nAnswer based on the context above:` },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content || 'Could not generate answer.';

    return {
      found: true,
      query,
      answer,
      sources: results.slice(0, 3).map(r => ({ name: r.name, matches: r.matches.length })),
      document_count: results.length,
    };
  },
});
