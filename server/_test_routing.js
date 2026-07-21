const { detectIntent } = require("./router");

const tests = {
  code: [
    "write me a react component",
    "create a new api endpoint",
    "build a rest api",
    "write me a sorting module",
  ],
  reasoning: [
    "why is the sky blue",
    "prove that p = np",
    "what is the meaning of consciousness",
    "explain the theory of relativity",
    "how does gravity work",
    "explain quantum entanglement",
  ],
  translate: [
    "translate hello to spanish",
    "how do you say thank you in french",
    "what is the word for cat in german",
    "can you translate this document",
    "spanish -> english",
    "translate this to french",
    "english to korean translation",
  ],
  websearch: [
    "latest updates on AI technology",
    "what is the current price of bitcoin",
    "google this for me",
    "find out what happened",
  ],
  vision: [
    "what is shown in this picture",
    "describe this photo",
    "look at this screenshot and explain it",
    "explain this diagram",
    "analyze this image for me",
  ],
  embedding: [
    "embed this paragraph",
    "generate embedding for this text",
  ],
  safety: [
    "check if this content is safe",
    "analyze this text for toxicity",
    "is this text appropriate",
  ],
};

for (const [expectedTask, messages] of Object.entries(tests)) {
  console.log(`\n=== ${expectedTask.toUpperCase()} ===`);
  for (const msg of messages) {
    const result = detectIntent(msg);
    const pass = result.task === expectedTask;
    const icon = pass ? "✅" : "❌";
    console.log(`${icon} [${result.task}] "${msg}" (scores: ${JSON.stringify(result.allScores)})`);
  }
}
