import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

type Item = {
  name: string;
  category: string;
  borrowed: number;
  returned: number;
  outstanding: number;
};

type OutboxRow = {
  id: number;
  recipient_email: string;
  recipient_name: string | null;
  student_name: string;
  student_year_section: string | null;
  student_course: string | null;
  student_email: string | null;
  reservation_date: string;
  end_time: string;
  items: Item[];
  attempts: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
  });
};

const formatTime = (value: string) => {
  const [hour = "0", minute = "0"] = value.split(":");
  const date = new Date(2000, 0, 1, Number(hour), Number(minute));
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const renderEmail = (row: OutboxRow) => {
  const professor = escapeHtml(row.recipient_name || "Professor");
  const student = escapeHtml(row.student_name);
  const items = row.items.map((item) => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#172033;">${escapeHtml(item.name)}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#667085;">${escapeHtml(item.category)}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.borrowed}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.returned}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#b42318;font-weight:700;">${item.outstanding}</td>
    </tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="max-width:680px;margin:32px auto;background:#fff;border:1px solid #e4e7ec;border-radius:16px;overflow:hidden;">
      <div style="background:#123b5d;padding:28px 32px;color:#fff;"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8;">Scilab3.0</div><h1 style="margin:8px 0 0;font-size:24px;font-weight:700;">Unreturned laboratory items</h1></div>
      <div style="padding:32px;line-height:1.6;"><p style="margin-top:0;">Dear ${professor},</p><p>Your student has laboratory item(s) that remain unreturned after the scheduled reservation end time. Please follow up with the student when convenient.</p>
        <div style="margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e4e7ec;border-radius:12px;"><h2 style="margin:0 0 14px;font-size:16px;">Student information</h2><p style="margin:5px 0;"><strong>Student:</strong> ${student}</p><p style="margin:5px 0;"><strong>Year &amp; Section:</strong> ${escapeHtml(row.student_year_section || "Not provided")}</p><p style="margin:5px 0;"><strong>Course:</strong> ${escapeHtml(row.student_course || "Not provided")}</p><p style="margin:5px 0;"><strong>Student email:</strong> ${escapeHtml(row.student_email || "Not provided")}</p></div>
        <h2 style="font-size:16px;margin:26px 0 10px;">Unreturned items</h2><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#f8fafc;text-align:left;"><th style="padding:12px 10px;">Item</th><th style="padding:12px 10px;">Category</th><th style="padding:12px 10px;text-align:center;">Borrowed</th><th style="padding:12px 10px;text-align:center;">Returned</th><th style="padding:12px 10px;text-align:center;">Outstanding</th></tr></thead><tbody>${items}</tbody></table></div>
        <div style="margin-top:24px;padding:16px 18px;border-left:4px solid #d92d20;background:#fff4f2;"><strong>Reservation date:</strong> ${escapeHtml(formatDate(row.reservation_date))}<br><strong>Scheduled end time:</strong> ${escapeHtml(formatTime(row.end_time))}</div>
        <p style="margin-bottom:0;">You can review the complete details in the <strong>Students with Unreturned Items</strong> section in Scilab3.0.</p><p style="margin-bottom:0;">Regards,<br><strong>Scilab3.0 Laboratory Management System</strong></p></div>
      <div style="padding:18px 32px;background:#f8fafc;color:#667085;font-size:12px;">This is an automated notification. Please do not reply to this email.</div>
    </div></body></html>`;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("x-email-dispatch-secret") !== Deno.env.get("EMAIL_DISPATCH_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: rows, error: claimError } = await supabase.rpc("claim_unreturned_item_email", { p_limit: 25 });
  if (claimError) return json({ error: claimError.message }, 500);

  let sent = 0;
  for (const row of (rows || []) as OutboxRow[]) {
    try {
      const smtpUser = Deno.env.get("GMAIL_USER");
      const smtpPass = Deno.env.get("GMAIL_APP_PASS");
      if (!smtpUser || !smtpPass) throw new Error("GMAIL_USER and GMAIL_APP_PASS are not configured");
      const transporter = nodemailer.createTransport({
        host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
        port: Number(Deno.env.get("SMTP_PORT") || "587"),
        secure: Deno.env.get("SMTP_SECURE") === "true",
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: `${Deno.env.get("GMAIL_FROM_NAME") || "Scilab3.0"} <${smtpUser}>`,
        to: row.recipient_email,
        subject: "Unreturned Laboratory Items — Action Needed",
        html: renderEmail(row),
      });
      await supabase.rpc("complete_unreturned_item_email", { p_outbox_id: row.id });
      sent++;
    } catch (error) {
      await supabase.rpc("fail_unreturned_item_email", { p_outbox_id: row.id, p_error: String(error).slice(0, 1000) });
    }
  }
  return json({ claimed: rows?.length || 0, sent });
});
