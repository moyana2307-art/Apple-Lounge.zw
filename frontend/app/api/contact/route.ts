import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; email?: string; subject?: string; message?: string };
    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ success: false, message: 'Name, email and message are required' }, { status: 400 });
    }

    const transporter = getTransporter();
    if (!transporter) {
      return NextResponse.json({ success: false, message: 'SMTP is not configured' }, { status: 500 });
    }

    const recipient = process.env.EMAIL_TO || 'gotocarlos197@gmail.com';

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      replyTo: email,
      subject: `New contact message: ${subject || 'No subject'}`,
      text: [
        `You have received a new message from the Apple Lounge contact form:`,
        '',
        `Name: ${name}`,
        `Email: ${email}`,
        `Subject: ${subject || 'None'}`,
        '',
        'Message:',
        message,
      ].join('\n'),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    console.error('Contact email failed:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
