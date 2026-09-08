/**
 * E-mail notification service (Nodemailer) — fail-open by design.
 *
 * A real SMTP transport is only created when MAIL_ENABLED=true AND both
 * SMTP_HOST and MAIL_FROM are present in the environment. Otherwise every
 * send is logged to the console and skipped, so booking, cancellation and
 * consultation workflows never depend on an e-mail server being reachable.
 *
 * Template functions keep the transport-agnostic details in one place and
 * return the HTML bodies used by the notification dispatcher.
 */
const nodemailer = require('nodemailer');
const config = require('../config');

const cfg = config.mail;
let transporter = null;
let enabled = false;

if (cfg.enabled && cfg.host && cfg.from) {
  try {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: Boolean(cfg.secure),
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    enabled = true;
  } catch (err) {
    console.error(`[mail] transport setup failed (${err.message}); notifications disabled`);
  }
}

function wrap(title, bodyHtml) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px">
  <h2 style="color:#0f766e;margin:0 0 16px">${title}</h2>
  ${bodyHtml}
  <p style="color:#64748b;font-size:12px;margin-top:24px">Hospital Doctor Appointment Booking System</p>
  </body></html>`;
}

function row(label, value) {
  return `<p style="margin:4px 0"><strong>${label}:</strong> ${value}</p>`;
}

function bookingCreatedHtml({ patientName, doctorName, date, time, symptoms }) {
  return wrap(
    'Appointment request received',
    `<p>Hi ${patientName || 'there'},</p>
     <p>Your appointment request has been received and is <strong>Pending</strong> confirmation.</p>
     ${row('Doctor', doctorName)}
     ${row('Date', date)}
     ${row('Time', time)}
     ${symptoms ? row('Symptoms', symptoms) : ''}`
  );
}

function rescheduledHtml({ patientName, doctorName, date, time }) {
  return wrap(
    'Appointment rescheduled',
    `<p>Hi ${patientName || 'there'},</p>
     <p>Your appointment has been moved. It is <strong>Pending</strong> confirmation again.</p>
     ${row('Doctor', doctorName)}
     ${row('New date', date)}
     ${row('New time', time)}`
  );
}

function cancelledHtml({ patientName, doctorName, date, time }) {
  return wrap(
    'Appointment cancelled',
    `<p>Hi ${patientName || 'there'},</p>
     <p>Your appointment has been cancelled and the slot released.</p>
     ${row('Doctor', doctorName)}
     ${row('Date', date)}
     ${row('Time', time)}`
  );
}

function statusChangedHtml({ patientName, doctorName, date, time, status }) {
  return wrap(
    'Appointment status update',
    `<p>Hi ${patientName || 'there'},</p>
     <p>Your appointment status has changed to <strong>${status}</strong>.</p>
     ${row('Doctor', doctorName)}
     ${row('Date', date)}
     ${row('Time', time)}`
  );
}

function notesReadyHtml({ patientName, doctorName, date }) {
  return wrap(
    'Consultation record available',
    `<p>Hi ${patientName || 'there'},</p>
     <p>Your consultation record for Dr/Dept <strong>${doctorName}</strong> on <strong>${date}</strong>
     has been updated. Log in to review the diagnosis, prescription and notes.</p>`
  );
}

/**
 * Core send primitive — never throws. Returns { sent } so callers can decide
 * how much to surface, or { skipped: true } when e-mail is disabled.
 */
async function send({ to, subject, html }) {
  if (!enabled || !transporter || !to) {
    console.log(`[mail] (disabled) -> ${to || '(no recipient)'} :: ${subject}`);
    return { skipped: true };
  }
  try {
    const info = await transporter.sendMail({ from: cfg.from, to, subject, html });
    console.log(`[mail] sent -> ${to} :: ${subject}`);
    return { sent: true, messageId: info && info.messageId };
  } catch (err) {
    console.error(`[mail] delivery failed to ${to}: ${err.message}`);
    return { skipped: true, error: err.message };
  }
}

const sendBookingCreated = (a) =>
  send({
    to: a.patientEmail,
    subject: 'Appointment request received',
    html: bookingCreatedHtml(a),
  });

const sendRescheduled = (a) =>
  send({
    to: a.patientEmail,
    subject: 'Appointment rescheduled',
    html: rescheduledHtml(a),
  });

const sendCancelled = (a) =>
  send({
    to: a.patientEmail,
    subject: 'Appointment cancelled',
    html: cancelledHtml(a),
  });

const sendStatusChanged = (a) =>
  send({
    to: a.patientEmail,
    subject: `Appointment ${a.status}`,
    html: statusChangedHtml(a),
  });

const sendNotesReady = (a) =>
  send({
    to: a.patientEmail,
    subject: 'Consultation record available',
    html: notesReadyHtml(a),
  });

module.exports = {
  isEnabled: () => enabled,
  send,
  sendBookingCreated,
  sendRescheduled,
  sendCancelled,
  sendStatusChanged,
  sendNotesReady,
};