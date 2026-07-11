// ===== Smart Intent Router =====
// Analyzes user messages to detect the task type and route to the best model.
// Uses keyword analysis, pattern matching, and context awareness.

const { TASK_ROUTES } = require('./models');

// ── Intent Detection Patterns ──

const INTENT_PATTERNS = [
  {
    task: 'code',
    weight: 10,
    patterns: [
      /\b(code|script|function|algorithm|program|debug|implement)\b/i,
      /```[\s\S]*```/,
      /\b(javascript|python|typescript|java|c\+\+|rust|golang)\b/i,
      /\b(write|create|generate)\s.*(function|class|method|app|script)\b/i,
      /\b(refactor|optimize|complexity|O\(n|recursion|iteration)\b/i,
      /\b(leetcode|hackerrank|coding|programming)\s+(challenge|problem|question)\b/i,
      /^(run|execute)\s/i,
    ],
  },
  {
    task: 'reasoning',
    weight: 8,
    patterns: [
      /\b(reason|logic|puzzle|riddle|brain.teaser|think step|chain.of.thought)\b/i,
      /\b(math|equation|calculus|theorem|proof|derivative|integral)\b/i,
      /\b(quantum|physics|philosophy|consciousness|existential)\b/i,
      /\b(prove|demonstrate|derive|verify)\b/i,
      /^(why|how\s+(does|can|would|should|could|is|are))\s/i,
      /\b(thought.experiment|what.if|hypothetical)\b/i,
      /solve\s.*(problem|puzzle|equation)/i,
    ],
  },
  {
    task: 'fast',
    weight: 5,
    patterns: [
      /^.{1,30}$/, // Very short messages
      /\b(hello|hi|hey|what's up|sup)\b/i,
      /\b(yes|no|maybe|thanks|ok|okay|sure)\b/i,
      /^(what|who|when|where)\s+(is|was|are|were)\s/i,
      /\b(weather|time|date|news)\b/i,
      /^(quick|fast|simple|short)\s/i,
    ],
  },
  {
    task: 'vision',
    weight: 9,
    patterns: [
      /\b(analyze|describe|examine|look.at)\s.*(image|picture|photo|screenshot|chart|graph|diagram)\b/i,
      /\b(what|what's|whats)\s.*(in|on|see|showing)\s.*(image|picture|photo)\b/i,
      /\b(image|picture|photo|screenshot|chart|graph)\s.*(analysis|description|explanation)\b/i,
      /^(describe|analyze|explain)\s+(this|the|an|that)/i,
    ],
  },
  {
    task: 'image',
    weight: 9,
    patterns: [
      /\b(generate|create|make|render|produce)\s.*(image|picture|art|illustration|photo|drawing|visual)\b/i,
      /\b(draw|paint|illustrate|design)\s/i,
      /\b(image|picture|art|illustration|photo)\s.*(of|with|showing|depicting)\b/i,
      /^(generate|create|make|draw|paint)\s+(a|an|the)\s/i,
    ],
  },
  {
    task: 'translate',
    weight: 8,
    patterns: [
      /\b(translate|translation|interpret)\s/i,
      /\b(how\s+do\s+you\s+say|what\s+is\s+the\s+word\s+for)\b/i,
      /\b(english|spanish|french|german|japanese|chinese|korean|russian|arabic)\s*(to|->|>)\s*(english|spanish|french|german|japanese|chinese|korean|russian|arabic)\b/i,
    ],
  },
  {
    task: 'safety',
    weight: 8,
    patterns: [
      /\b(safety|harmful|toxic|offensive|dangerous|inappropriate)\s.*(check|analyze|test|scan|evaluate)\b/i,
      /\b(check|analyze|test)\s.*(safety|harmful|toxic|offensive)\b/i,
      /^is\s+this\s+(safe|harmful|appropriate|ok)\b/i,
    ],
  },
  {
    task: 'embedding',
    weight: 6,
    patterns: [
      /\b(embed|embedding|vectorize|vector\s+representation)\b/i,
      /\b(generate|create)\s.*(embedding|vector)\b/i,
    ],
  },
];

// ── Image detection (for vision analysis when user attaches images) ──
function hasImage(context) {
  return context?.hasImage === true || context?.imageDescription != null;
}

/**
 * Detect the task/intent from the user message and context.
 * Returns the best task route with confidence score.
 */
function detectIntent(message, context = {}) {
  const scores = {};

  for (const intent of INTENT_PATTERNS) {
    let score = 0;
    for (const pattern of intent.patterns) {
      if (pattern.test(message)) {
        score += intent.weight;
      }
    }
    if (score > 0) {
      scores[intent.task] = (scores[intent.task] || 0) + score;
    }
  }

  // If user has attached an image AND is asking about it, boost vision score
  if (hasImage(context)) {
    const visionKeywords = /\b(who|what|where|when|why|how|describe|analyze|explain|tell|see|look|this)\b/i;
    if (visionKeywords.test(message)) {
      scores.vision = (scores.vision || 0) + 15;
    }
    // Even if no keywords, give vision a base score
    if (!scores.vision) {
      scores.vision = 5;
    }
  }

  // Check if user wants image generation (look for art/visual keywords)
  const imgGenKeywords = /\b(image|picture|art|illustration|drawing|photo|landscape|portrait|scene|view)\s+(of|with|in|at)\b/i;
  if (imgGenKeywords.test(message) && !scores.code) {
    scores.image = (scores.image || 0) + 3;
  }

  // If no intent detected, default to chat
  if (Object.keys(scores).length === 0) {
    return {
      task: 'chat',
      confidence: 0.3,
      route: TASK_ROUTES.chat,
      reasoning: 'No specific intent detected, using general chat',
    };
  }

  // Find the best match
  const sorted = Object.entries(scores)
    .sort(([, a], [, b]) => b - a);

  const bestTask = sorted[0][0];
  const bestScore = sorted[0][1];
  const maxPossibleScore = INTENT_PATTERNS.reduce((max, p) => Math.max(max, p.weight * p.patterns.length), 30);
  const confidence = Math.min(bestScore / maxPossibleScore, 1);

  return {
    task: bestTask,
    confidence,
    route: TASK_ROUTES[bestTask] || TASK_ROUTES.chat,
    reasoning: `Detected "${bestTask}" intent with ${(confidence * 100).toFixed(0)}% confidence`,
    allScores: scores,
  };
}

/**
 * Get a human-readable description of the detected task.
 */
function getIntentEmoji(task) {
  const emojis = {
    chat: '💬',
    code: '💻',
    reasoning: '🧠',
    fast: '⚡',
    vision: '👁️',
    image: '🎨',
    translate: '🌐',
    safety: '🛡️',
    embedding: '📊',
  };
  return emojis[task] || '🤖';
}

function getIntentLabel(task) {
  const labels = {
    chat: 'General Chat',
    code: 'Code & Programming',
    reasoning: 'Deep Reasoning',
    fast: 'Quick Response',
    vision: 'Image Analysis',
    image: 'Image Generation',
    translate: 'Translation',
    safety: 'Safety Check',
    embedding: 'Embeddings',
  };
  return labels[task] || 'General';
}

module.exports = {
  detectIntent,
  getIntentEmoji,
  getIntentLabel,
  INTENT_PATTERNS,
};
