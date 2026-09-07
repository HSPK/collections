export type AgentErrorCode = 'configuration' | 'network' | 'http' | 'protocol' | 'validation' | 'timeout' | 'cancelled';

export class AgentError extends Error {
  readonly code: AgentErrorCode;

  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
  }
}

export class AgentValidationError extends AgentError {
  constructor(message: string) {
    super('validation', message);
    this.name = 'AgentValidationError';
  }
}

export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AgentValidationError(message);
}
