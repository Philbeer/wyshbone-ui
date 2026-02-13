export class UIExecutionForbiddenError extends Error {
  public readonly statusCode = 501;
  
  constructor(context?: string) {
    const msg = `UI execution path forbidden: must enqueue supervisor_tasks${context ? ` (attempted: ${context})` : ''}`;
    super(msg);
    this.name = 'UIExecutionForbiddenError';
  }
}

export function assertNoExecutionInUI(context?: string): never {
  throw new UIExecutionForbiddenError(context);
}

export function guardRoute(context: string) {
  return (_req: any, res: any) => {
    console.error(`🚫 [GUARDRAIL] Blocked execution path: ${context}`);
    res.status(501).json({
      error: 'UI execution path forbidden: must enqueue supervisor_tasks',
      context,
      resolution: 'This action must be performed via the Supervisor service',
    });
  };
}
