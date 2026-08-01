/**
 * ignoshashi WebSocket Chat Manager (Singleton)
 *
 * Connects to wss:// or ws:// current host at /ws.
 * Auto-reconnects with exponential backoff (1s/2s/4s/8s, max 30s).
 * Handles subscribe/unsubscribe, message receipt, typing indicators, and presence.
 */

export interface WsChatMessage {
  id: string;
  username: string;
  channel: string;
  text: string;
  timestamp: number;
  reactions: Record<string, string[]>;
  pinned: boolean;
  image?: string;
}

export interface WsPresenceEntry {
  callsign: string;
  online: boolean;
}

type MessageCallback = (msg: WsChatMessage) => void;
type ReactionCallback = (messageId: string, reactions: Record<string, string[]>) => void;
type PinCallback = (messageId: string, pinned: boolean, channel: string) => void;
type PresenceCallback = (channel: string, users: WsPresenceEntry[]) => void;
type TypingCallback = (channel: string, callsign: string, isTyping: boolean) => void;
type ErrorCallback = (error: string) => void;
type ConnectionCallback = (connected: boolean) => void;

class ChatSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private maxBackoff = 30000;
  private shouldReconnect = true;
  private messageListeners: Set<MessageCallback> = new Set();
  private reactionListeners: Set<ReactionCallback> = new Set();
  private pinListeners: Set<PinCallback> = new Set();
  private presenceListeners: Set<PresenceCallback> = new Set();
  private typingListeners: Set<TypingCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private connectionListeners: Set<ConnectionCallback> = new Set();
  private subscribedChannels: Set<string> = new Set();
  private callsign = "";
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  /** Connect to the WebSocket server and begin auto-reconnect. */
  connect(callsign: string): void {
    this.callsign = callsign || "anon";
    this.shouldReconnect = true;
    this._connect();
  }

  /** Disconnect and stop auto-reconnect. */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.subscribedChannels.clear();
    this._setConnected(false);
  }

  /** Subscribe to a channel. Re-sends on reconnect automatically. */
  subscribe(channel: string): void {
    this.subscribedChannels.add(channel);
    this._send({ type: "subscribe", channel, callsign: this.callsign });
  }

  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    this._send({ type: "unsubscribe", channel });
  }

  /** Send a chat message via WebSocket. */
  sendMessage(msg: WsChatMessage): void {
    this._send({
      type: "message",
      channel: msg.channel,
      text: msg.text,
      image: msg.image,
      id: msg.id,
      username: msg.username,
      timestamp: msg.timestamp,
    });
  }

  /** Send a reaction toggle. */
  sendReaction(messageId: string, emoji: string): void {
    this._send({ type: "reaction", messageId, emoji });
  }

  /** Send a pin toggle. */
  sendPin(messageId: string): void {
    this._send({ type: "pin", messageId });
  }

  /** Send a typing indicator. */
  sendTyping(channel: string, isTyping: boolean): void {
    this._send({ type: "typing", channel, isTyping });
  }

  /** Register a listener for incoming chat messages. Returns unsubscribe. */
  onMessage(cb: MessageCallback): () => void {
    this.messageListeners.add(cb);
    return () => { this.messageListeners.delete(cb); };
  }

  /** Register a listener for reaction updates. Returns unsubscribe. */
  onReaction(cb: ReactionCallback): () => void {
    this.reactionListeners.add(cb);
    return () => { this.reactionListeners.delete(cb); };
  }

  /** Register a listener for pin updates. Returns unsubscribe. */
  onPin(cb: PinCallback): () => void {
    this.pinListeners.add(cb);
    return () => { this.pinListeners.delete(cb); };
  }

  /** Register a listener for presence updates. Returns unsubscribe. */
  onPresence(cb: PresenceCallback): () => void {
    this.presenceListeners.add(cb);
    return () => { this.presenceListeners.delete(cb); };
  }

  /** Register a listener for typing indicators. Returns unsubscribe. */
  onTyping(cb: TypingCallback): () => void {
    this.typingListeners.add(cb);
    return () => { this.typingListeners.delete(cb); };
  }

  /** Register a listener for errors. Returns unsubscribe. */
  onError(cb: ErrorCallback): () => void {
    this.errorListeners.add(cb);
    return () => { this.errorListeners.delete(cb); };
  }

  /** Register a listener for connection state changes. Returns unsubscribe. */
  onConnectionChange(cb: ConnectionCallback): () => void {
    this.connectionListeners.add(cb);
    return () => { this.connectionListeners.delete(cb); };
  }

  /* ═══════════════════════════════════════════════
     PRIVATE
     ═══════════════════════════════════════════════ */

  private _connect(): void {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this._setConnected(true);
        this.backoff = 1000;
        // Re-subscribe to all channels
        for (const ch of this.subscribedChannels) {
          this._send({ type: "subscribe", channel: ch, callsign: this.callsign });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          this._handleMessage(data);
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        // handled by onclose
      };

      this.ws.onclose = () => {
        this._setConnected(false);
        this.ws = null;
        if (this.shouldReconnect) {
          this._scheduleReconnect();
        }
      };
    } catch {
      // WebSocket not supported or failed to create
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, this.backoff);
    // Exponential backoff with cap
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }

  private _send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
    // If not connected, the message is dropped (REST fallback handles persistence)
  }

  private _setConnected(connected: boolean): void {
    if (this._connected === connected) return;
    this._connected = connected;
    for (const cb of this.connectionListeners) {
      try { cb(connected); } catch { /* */ }
    }
  }

  private _handleMessage(data: Record<string, unknown>): void {
    const type = data.type as string;

    switch (type) {
      case "message": {
        const msg = data.message as WsChatMessage;
        if (!msg || !msg.id) return;
        for (const cb of this.messageListeners) {
          try { cb(msg); } catch { /* */ }
        }
        break;
      }
      case "reaction": {
        const messageId = data.messageId as string;
        const reactions = data.reactions as Record<string, string[]>;
        if (!messageId) return;
        for (const cb of this.reactionListeners) {
          try { cb(messageId, reactions); } catch { /* */ }
        }
        break;
      }
      case "pin": {
        const messageId = data.messageId as string;
        const pinned = !!data.pinned;
        const channel = data.channel as string;
        if (!messageId) return;
        for (const cb of this.pinListeners) {
          try { cb(messageId, pinned, channel); } catch { /* */ }
        }
        break;
      }
      case "presence": {
        const channel = data.channel as string;
        const users = data.users as WsPresenceEntry[];
        if (!channel) return;
        for (const cb of this.presenceListeners) {
          try { cb(channel, users); } catch { /* */ }
        }
        break;
      }
      case "typing": {
        const channel = data.channel as string;
        const callsign = data.callsign as string;
        const isTyping = !!data.isTyping;
        if (!channel || !callsign) return;
        for (const cb of this.typingListeners) {
          try { cb(channel, callsign, isTyping); } catch { /* */ }
        }
        break;
      }
      case "error": {
        const message = data.message as string;
        for (const cb of this.errorListeners) {
          try { cb(message); } catch { /* */ }
        }
        break;
      }
    }
  }
}

/** Singleton instance. */
export const chatSocket = new ChatSocket();
