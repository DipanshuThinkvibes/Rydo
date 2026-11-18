/** Mobile push. Feature code depends on this interface, never on Firebase. */
export interface PushMessage {
  title: string;
  body: string;
  /** Small string values only (ids the app uses to open the right screen). */
  data?: Record<string, string>;
}

export interface PushResult {
  /** Tokens the provider says are dead (app uninstalled, token rotated). The caller deletes them. */
  invalidTokens: string[];
}

export interface PushAdapter {
  /** Never throws for one bad token; reports it in invalidTokens. */
  send(tokens: string[], msg: PushMessage): Promise<PushResult>;
}

export const PUSH_ADAPTER = Symbol('PUSH_ADAPTER');
