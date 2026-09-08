/**
 * Real-time event layer (Socket.IO) — fail-open by design.
 *
 * Mounts a Socket.IO server on the same HTTP port as the REST API. Clients
 * authenticate during the handshake with the same JWT used for API calls.
 * Events carry only lightweight triggers (ids + status), never patient PII:
 * every client refetches the authoritative data over its own REST scope.
 *
 * If Socket.IO fails to initialise or an emit throws, the push is swallowed:
 * realtime delivery is a progressive enhancement, never a hard dependency.
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

let io = null;

function refId(ref) {
  return ref && ref._id ? ref._id : ref;
}

function init(httpServer) {
  if (!httpServer || io) return io;
  try {
    io = new Server(httpServer, {
      path: '/socket.io',
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(new Error('unauthorized'));
        const payload = jwt.verify(token, config.jwtSecret);
        socket.userId = String(payload.id);
        socket.role = payload.role;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    io.on('connection', (socket) => {
      socket.join(`user:${socket.userId}`);
      socket.join(`role:${socket.role}`);
      console.log(`[realtime] client connected user=${socket.userId} role=${socket.role}`);
      socket.on('disconnect', () => {
        console.log(`[realtime] client disconnected user=${socket.userId}`);
      });
    });

    console.log(`[realtime] Socket.IO ready at /socket.io (port ${config.port})`);
  } catch (err) {
    io = null;
    console.error(`[realtime] initialisation failed (${err.message}); running REST-only`);
  }
  return io;
}

/**
 * Target one patient + all doctors + all admins with an appointment-change
 * trigger. Payload is intentionally minimal — clients refetch via REST.
 */
function emitAppointment(event, appointment) {
  if (!io || !appointment || !appointment._id) return;
  try {
    const patientId = refId(appointment.patientId);
    const doctorId = refId(appointment.doctorId);
    const payload = {
      event,
      appointment: {
        id: String(appointment._id),
        status: appointment.status,
        date: appointment.date,
        startTime: appointment.startTime,
      },
    };
    if (patientId) io.to(`user:${patientId}`).emit(event, payload);
    io.to('role:doctor').emit(event, payload);
    io.to('role:admin').emit(event, payload);
  } catch (err) {
    console.error(`[realtime] emit ${event} failed: ${err.message}`);
  }
}

/** Broadcast that a doctor's slot availability changed on the server. */
function slotsChanged(doctorId) {
  if (!io || !doctorId) return;
  try {
    io.emit('slots:changed', { doctorId: String(refId(doctorId)) });
  } catch (err) {
    console.error(`[realtime] emit slots:changed failed: ${err.message}`);
  }
}

module.exports = { init, emitAppointment, slotsChanged };