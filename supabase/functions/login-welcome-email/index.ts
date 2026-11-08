// Supabase Edge Function: send a LIFEVERSE welcome email after each password login.
// Required function secrets: RESEND_API_KEY and EMAIL_FROM.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Nicht angemeldet." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  if (!supabaseUrl || !anonKey || !resendKey || !emailFrom) {
    return response({ error: "Mailversand ist noch nicht vollständig konfiguriert." }, 503);
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return response({ error: "Sitzung ungültig oder E-Mail fehlt." }, 401);

  const username = String(data.user.user_metadata?.username || "Abenteurer")
    .replace(/[<>]/g, "")
    .slice(0, 40);

  const emailPayload = {
    from: emailFrom,
    to: [data.user.email],
    subject: "LIFEVERSE – Dein Abenteuer beginnt!",
    text: `Hallo ${username}!\n\nDu bist jetzt eingeloggt, dein Abenteuer beginnt.\n\nViel Spaß beim Erkunden, Bauen und Spielen mit deinen Freunden!\n\nDein LIFEVERSE-Team ❤️`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18212b"><h1 style="color:#2878d0">🌍 LIFEVERSE</h1><h2>Dein Abenteuer beginnt!</h2><p>Hallo ${username}!</p><p>Du bist jetzt eingeloggt, dein Abenteuer beginnt. ✨</p><p>Viel Spaß beim Erkunden, Bauen und Spielen mit deinen Freunden!</p><p>Dein LIFEVERSE-Team ❤️</p></div>`,
  };

  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emailPayload),
  });
  if (!mailResponse.ok) {
    const details = await mailResponse.text();
    console.error("Resend error:", details);
    return response({ error: "Die Willkommens-Mail konnte gerade nicht versendet werden." }, 502);
  }

  return response({ success: true });
});
