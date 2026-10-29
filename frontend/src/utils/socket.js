// BUG-46 FIXED: Socket created once but NOT auto-connected at module level
// connectSocket() is called only after successful auth check
import { io } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

// Create socket instance but with autoConnect: false
export const socket = io(BACKEND, {
  withCredentials: true,
  autoConnect: false,  // BUG-46: Don't connect at module load time
  transports: ['websocket', 'polling']
});

export function connectSocket() { if (!socket.connected) socket.connect(); }
export function disconnectSocket() { if (socket.connected) socket.disconnect(); }
