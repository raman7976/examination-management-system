import nodemailer from 'nodemailer';

// ─────────────────────────────────────────────────────────────────────────────
//  Mailer — a single shared SMTP transport built from environment variables.
//
//  Required env (set these in backend/.env):
//    SMTP_HOST       e.g. smtp.gmail.com
//    SMTP_PORT       e.g. 587  (STARTTLS)  or  465 (implicit TLS)
//    SMTP_USER       the mailbox / API username
//    SMTP_PASS       the mailbox password or app-password / API key
//    MAIL_FROM       the visible "From" address, e.g. "LNMIIT Exams <no-reply@lnmiit.ac.in>"
//
//  If SMTP isn't configured we DON'T crash the server — we log a clear warning
//  and `sendMail` throws a friendly error so the calling route can surface a
//  500 with a useful message instead of leaking a stack trace.
// ─────────────────────────────────────────────────────────────────────────────

let transporter = null;
let configError = null;

function buildTransport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
        configError =
            'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in backend/.env.';
        console.warn(`⚠️  ${configError}`);
        return null;
    }
    const port = Number(SMTP_PORT);
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465, // 465 = implicit TLS; 587/25 = STARTTLS (secure:false + upgrade)
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

// Lazily build on first use so importing this module never throws at boot.
function getTransport() {
    if (transporter) return transporter;
    transporter = buildTransport();
    return transporter;
}

/**
 * Send an email. Throws if SMTP isn't configured or delivery fails.
 * @param {{to:string, subject:string, text?:string, html?:string}} msg
 */
export async function sendMail({ to, subject, text, html }) {
    const tx = getTransport();
    if (!tx) throw new Error(configError || 'Email transport unavailable.');
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    return tx.sendMail({ from, to, subject, text, html });
}

/**
 * Render the OTP email body. Kept separate so the wording lives in one place.
 */
export function otpEmail(otp) {
    const subject = 'Your LNMIIT Exam Portal password-reset code';
    const text =
        `Your one-time password (OTP) is ${otp}.\n\n` +
        `It is valid for 10 minutes and can be used once. ` +
        `If you did not request a password reset, you can safely ignore this email.`;
    const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1f2937">
          <h2 style="color:#8B1A1A;margin:0 0 12px">Password Reset</h2>
          <p style="margin:0 0 16px">Use the one-time code below to reset your password:</p>
          <div style="font-size:30px;font-weight:700;letter-spacing:8px;background:#f8fafc;
                      border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;color:#111827">
            ${otp}
          </div>
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280">
            This code is valid for 10 minutes and can be used once.
            If you didn't request this, you can ignore this email.
          </p>
        </div>`;
    return { subject, text, html };
}

export default { sendMail, otpEmail };
