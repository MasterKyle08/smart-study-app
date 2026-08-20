const fetch = require('node-fetch');
const { notifyEmails } = require('../utils/adminRules');

function smsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function emailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY
    || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

async function sendSms(to, body) {
  if (!smsConfigured()) return { sent: false, channel: 'sms', reason: 'unconfigured' };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Could not send SMS (${response.status}).`);
    error.statusCode = 502;
    error.details = text.slice(0, 300);
    throw error;
  }
  return { sent: true, channel: 'sms' };
}

async function sendSmtp({ to, subject, text }) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_err) {
    return { sent: false, channel: 'email', reason: 'nodemailer_missing' };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === '1',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  return { sent: true, channel: 'email' };
}

async function sendEmail({ to, subject, text }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return { sent: false, channel: 'email', reason: 'no_recipient' };

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Smart Study <noreply@smartstudy.local>',
        to: recipients,
        subject,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error('Could not send email.');
      error.statusCode = 502;
      error.details = body.slice(0, 300);
      throw error;
    }
    return { sent: true, channel: 'email' };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendSmtp({ to: recipients.join(', '), subject, text });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[notify:dev] email to ${recipients.join(', ')} | ${subject}\n${text}`);
    return { sent: true, channel: 'dev' };
  }
  return { sent: false, channel: 'email', reason: 'unconfigured' };
}

async function notifyAdminPermissionChange({ actorEmail, targetEmail, action, extra = '' }) {
  const watchers = notifyEmails().filter((email) => email !== String(targetEmail || '').toLowerCase());
  const subject = `Smart Study admin change: ${action}`;
  const text = [
    `An admin permission change was made.`,
    `Action: ${action}`,
    `Actor: ${actorEmail || 'unknown'}`,
    `Target: ${targetEmail || 'unknown'}`,
    extra ? `Details: ${extra}` : '',
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const results = [];
  if (watchers.length) {
    results.push(await sendEmail({ to: watchers, subject, text }));
  }
  if (targetEmail) {
    results.push(await sendEmail({
      to: targetEmail,
      subject: 'Your Smart Study admin access changed',
      text: `Your admin permission was changed (${action}) by ${actorEmail || 'an administrator'}. If you did not expect this, contact the site owner immediately.`,
    }));
  }
  return results;
}

module.exports = {
  smsConfigured,
  emailConfigured,
  sendSms,
  sendEmail,
  notifyAdminPermissionChange,
};
