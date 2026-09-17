/**
 * Real-time client wrapper (Socket.IO) — fail-open by design.
 *
 * When the server's socket layer is not available (or the handshake fails)
 * the client silently disables itself and the app continues over plain REST.
 * Events carry lightweight triggers only; every listener refetches the
 * authoritative data through the normal API so nothing is ever stale.
 */
import { io } from 'socket.io-client';

function socketUrl() {
  const apiBase = import.meta.env.VITE_API_URL;
  if (!apiBase || apiBase.startsWith('/')) return undefined;
  try {
    return new URL(apiBase).origin;
  } catch {
    return undefined;
  }
}

let socket = null;

/** Connect with the current JWT. Safe to call repeatedly. */
export function connectRealtime(token) {
  if (!token) return null;
  if (socket) return socket;
  try {
    socket = io(socketUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 10000,
      auth: { token },
    });

    socket.on('connect', () => console.log('[realtime] connected'));
    socket.on('connect_error', () => {
      try {
        socket && socket.disconnect();
      } catch {
        /* ignore */
      }
      socket = null;
      console.log('[realtime] unavailable — running on REST only');
    });
    socket.on('disconnect', () => {
      socket = null;
    });
  } catch {
    socket = null;
  }
  return socket;
}

export function disconnectRealtime() {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
}

/** Subscribe to a socket event; returns an unsubscribe function. */
export function onRealtime(event, handler) {
  if (!socket) return () => {};
  socket.on(event, handler);
  return () => {
    try {
      socket.off(event, handler);
    } catch {
      /* ignore */
    }
  };
}