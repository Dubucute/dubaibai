// ===== Tool: Code Execution =====
// Sandboxed JavaScript execution for calculations, data processing, and prototyping.
const vm = require('vm');
const { register } = require('./index');

register({
  name: 'execute_code',
  description: 'Execute JavaScript code in a sandboxed environment. Useful for calculations, data processing, algorithms, and testing code snippets.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute.' },
      timeout: { type: 'number', description: 'Execution timeout in ms.', default: 5000 },
    },
    required: ['code'],
  },

  async execute(args) {
    const { code, timeout = 5000 } = args;

    const sandbox = {
      console: { log: (...args) => logs.push(args.map(String).join(' ')) },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Math, JSON, Date, Array, Object, String, Number, Boolean,
      Map, Set, RegExp, Error, Promise, parseInt, parseFloat,
      isNaN, isFinite,
    };
    const logs = [];
    let result;

    try {
      const context = vm.createContext(sandbox);
      const script = new vm.Script(code, { timeout, filename: 'eval.js' });
      result = script.runInContext(context, { timeout, breakOnSigint: true });

      return {
        result: result !== undefined ? String(result) : undefined,
        logs,
        type: typeof result,
        success: true,
      };
    } catch (e) {
      return {
        result: null,
        logs,
        error: e.message,
        success: false,
      };
    }
  },
});
