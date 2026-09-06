import { currentEvent, nextEvent } from './eclipse';
import type { EventReply, EventRequest } from './eclipse';

self.addEventListener('message', (message: MessageEvent<EventRequest>) => {
  const request = message.data;
  let reply: EventReply;
  try {
    const event = request.mode === 'current' ? currentEvent(request.time, request.site) : nextEvent(request.time, request.site);
    reply = { ok: true, event };
  } catch (error) {
    // Worker boundary: turn thrown library strings and ordinary errors into
    // explicit failures, never fabricated geometry or a substitute date.
    reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
});
