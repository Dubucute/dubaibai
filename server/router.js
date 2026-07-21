// ===== Smart Intent Router =====
// Analyzes user messages to detect the task type and route to the best model.
// Uses keyword analysis, pattern matching, and context awareness.

const { TASK_ROUTES } = require("./models");

// ── Intent Detection Patterns ──

const INTENT_PATTERNS = [
  {
    task: "websearch",
    weight: 10,
    patterns: [
      /^search\s+(for|the|about|on|in)?\s/i,
      /\b(search\s+the\s+web|look\s+up|find\s+information|find\s+(out|more)|google\s+(it|this|for))\b/i,
      /\b(what\s+is\s+the\s+(latest|current|recent|newest|trending))\b/i,
      /\b(news\s+(about|on|regarding|of)|latest\s+(news|update|updates|trends|headlines|developments))\b/i,
      /\b(price|cost|how\s+much\s+(is|are|does|do))\b/i,
      /\b(weather|forecast|temperature)\s+(in|for|at|today|tomorrow)\b/i,
      /^(how\s+(much|many|long|far|old|tall|heavy|big|fast))\s/is,
    ],
  },    {
    task: "code",
    weight: 10,
    patterns: [
      /\b(code|script|function|algorithm|program|debug|implement|build|compile|deploy)\b/i,
      /```[\s\S]*```/,
      /\b(javascript|python|typescript|java|c\+\+|rust|golang|php|ruby|swift|kotlin|go|sql|bash)\b/i,
      /\b(write|create|generate|build|make)\s.*(function|class|method|app|script|component|endpoint|api|module|route|service|middleware|hook|handler)\b/i,
      /\b(react|vue|angular|svelte|node|express|django|flask|spring|docker|kubernetes|aws|git)\b/i,
      /\b(refactor|optimize|complexity|O\(n|recursion|iteration|timeout|memory.leak|race.condition)\b/i,
      /\b(leetcode|hackerrank|coding|programming|codeforces)\s+(challenge|problem|question|solution)\b/i,
      /^(run|execute|install)\s/i,
      /\b(debug|fix|help)\s.*(code|bug|program|script|function|error|issue|problem)\b/i,
    ],
  },    {
    task: "reasoning",
    weight: 9,
    patterns: [
      /\b(reason|logic|puzzle|riddle|brain.teaser|think step|chain.of.thought)\b/i,
      /\b(math|equation|calculus|theorem|proof|derivative|integral|algebra|geometry|trigonometry)\b/i,
      /\b(quantum|physics|philosophy|consciousness|existential|metaphysics|epistemology)\b/i,
      /\b(theory|relativity|gravity|entanglement|evolution|cosmology|biology|psychology|phenomenon|paradox)\b/i,
      /\b(meaning|purpose|origin|nature|essence)\s+(of|behind)\b/i,
      /\b(prove|demonstrate|derive|verify|validate)\b/i,
      /^(why|how\s+(does|can|would|should|could|is|are|do))\s/i,
      /\b(thought.experiment|what.if|hypothetical|gedanken)\b/i,
      /solve\s.*(problem|puzzle|equation|riddle|mystery)/i,
    ],
  },
  {
    task: "chat",
    weight: 10,
    patterns: [
      /^(what|who)\s+(is|was|are|were|do|does|did|can|could|would|should)\b/i,
      /\b(tell me about|explain|describe|who are you|what are you|your name|about you)\b/i,
      /\b(how do|how can|how does|how would|how should)\b/i,
      /\b(I want|I need|can you|could you|please|would you)\b/i,
      /\b(hello|hi|hey|what's up|sup|greetings)\b/i,
      /\b(yes|no|maybe|thanks|ok|okay|sure|good|great|nice)\b/i,
    ],
  },
  {
    task: "fast",
    weight: 5,
    patterns: [
      /^(when|where)\s+(is|was|are|were)\s/i,
      /\b(weather|time|date|news)\b/i,
      /^(quick|fast|simple|short)\s/i,
      /^.{46,60}$/, // Medium factual queries only (not short messages)
    ],
  },    {
    task: "vision",
    weight: 10,
    patterns: [
      /\b(analyze|describe|examine|look.at)\s.*(image|picture|photo|screenshot|chart|graph|diagram|figure|plot)\b/i,
      /\b(what|what's|whats)\s.*(in|on|see|showing)\s.*(image|picture|photo|screenshot|diagram|chart)\b/i,
      /\b(image|picture|photo|screenshot|chart|graph|diagram|figure|plot)\s.*(analysis|description|explanation|interpretation)\b/i,
      /^(describe|analyze|explain|interpret|read)\s+(this|the|an|that)\s+(image|picture|photo|screenshot|chart|graph|diagram|figure|plot)\b/i,
      /\b(can you|could you|please)\s.*(analyze|describe|explain|read)\s.*(image|picture|photo|screenshot|chart|graph|diagram)\b/i,
    ],
  },
  {
    task: "image",
    weight: 9,
    patterns: [
      /\b(generate|create|make|render|produce)\s.*(image|picture|art|illustration|photo|drawing|visual)\b/i,
      /\b(draw|paint|illustrate|design)\s/i,
      /\b(image|picture|art|illustration|photo)\s.*(of|with|showing|depicting)\b/i,
      /^(generate|create|make|draw|paint)\s+(a|an|the)\s/i,
      /\bimagine\s+(a|an|the|me|this)\b/i,
      /\b(make|create|generate)\s+(me\s+)?(a|an)\s+(picture|art|image|drawing|illustration|painting)\b/i,
    ],
  },    {
    task: "translate",
    weight: 9,
    patterns: [
      /\b(translate|translation|translator|interpret)\s/i,
      /\b(how\s+do\s+you\s+say|what\s+is\s+the\s+word\s+for)\b/i,
      /\b(english|spanish|french|german|japanese|chinese|korean|russian|arabic|italian|portuguese|hindi)\s*(to|->|>)\s*(english|spanish|french|german|japanese|chinese|korean|russian|arabic|italian|portuguese|hindi)\b/i,
      /\b(say|mean|write|speak)\s.*(in|to)\s+(english|spanish|french|german|japanese|chinese|korean|russian|arabic|italian|portuguese|hindi)\b/i,
      /\b(can you|could you|please|i need|i want)\s+(translate|interpret)\b/i,
      /\b(in|to)\s+(english|spanish|french|german|japanese|chinese|korean|russian|arabic|italian|portuguese|hindi)\s*$/i,
    ],
  },    {
    task: "safety",
    weight: 8,
    patterns: [
      /\b(safety|safe|harmful|toxic|toxicity|offensive|dangerous|inappropriate|abusive|hateful)\s.*(check|analyze|test|scan|evaluate|rate|review)\b/i,
      /\b(check|analyze|test|scan|evaluate)\s.*(safety|safe|harmful|toxic|toxicity|offensive|appropriate|inappropriate)\b/i,
      /^is\s+this\s+.*\b(safe|harmful|appropriate|inappropriate|ok|offensive)\b/i,
      /\b(content.safety|moderation|toxicity)\b/i,
      /\b(check|see|find)\s+(if|whether)\s.*\b(safe|harmful|offensive|appropriate|toxic)\b/i,
    ],
  },    {
    task: "embedding",
    weight: 7,
    patterns: [
      /\b(embed|embedding|vectorize|vector\s+representation|embeddings)\b/i,
      /\b(generate|create|get|compute)\s.*(embedding|embed|vector)\b/i,
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
    const visionKeywords =
      /\b(who|what|where|when|why|how|describe|analyze|explain|tell|see|look|this)\b/i;
    if (visionKeywords.test(message)) {
      scores.vision = (scores.vision || 0) + 15;
    }
    // Even if no keywords, give vision a base score
    if (!scores.vision) {
      scores.vision = 5;
    }
  }

  // Force image generation when the frontend sets forceImageGeneration (from /imagine command)
  if (context.forceImageGeneration) {
    scores.image = (scores.image || 0) + 50;
  }

  // Check if user wants image generation (look for art/visual keywords)
  const imgGenKeywords =
    /\b(image|picture|art|illustration|drawing|photo|landscape|portrait|scene|view)\s+(of|with|in|at)\b/i;
  if (imgGenKeywords.test(message) && !scores.code) {
    scores.image = (scores.image || 0) + 3;
  }

  // If no intent detected, default to chat
  if (Object.keys(scores).length === 0) {
    return {
      task: "chat",
      confidence: 0.3,
      route: TASK_ROUTES.chat,
      reasoning: "No specific intent detected, using general chat",
    };
  }

  // Find the best match
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  const bestTask = sorted[0][0];
  const bestScore = sorted[0][1];
  const maxPossibleScore = INTENT_PATTERNS.reduce(
    (max, p) => Math.max(max, p.weight * p.patterns.length),
    30,
  );
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
  const labels = {
    chat: "Chat",
    code: "Code",
    reasoning: "Reasoning",
    fast: "Fast",
    vision: "Vision",
    image: "Image",
    translate: "Translate",
    safety: "Safety",
    embedding: "Embedding",
  };
  return labels[task] || "AI";
}

function getIntentLabel(task) {
  const labels = {
    chat: "General Chat",
    code: "Code & Programming",
    reasoning: "Deep Reasoning",
    fast: "Quick Response",
    websearch: "🔍 Web Search",
    vision: "Image Analysis",
    image: "Image Generation",
    translate: "Translation",
    safety: "Safety Check",
    embedding: "Embeddings",
  };
  return labels[task] || "General";
}

module.exports = {
  detectIntent,
  getIntentEmoji,
  getIntentLabel,
  INTENT_PATTERNS,
};
