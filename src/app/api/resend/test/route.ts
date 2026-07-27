import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "Missing Resend environment variables" },
      { status: 500 }
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: ["thorin22.dr@gmail.com"],
      subject: "Prueba de correo desde SmarTrack CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h1>SmarTrack CRM</h1>
          <p>La integración con Resend está funcionando correctamente.</p>
        </div>
      `,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Resend error:", result);

    return NextResponse.json(
      { error: "Email could not be sent", details: result },
      { status: response.status }
    );
  }

  return NextResponse.json({
    success: true,
    emailId: result.id,
  });
}
