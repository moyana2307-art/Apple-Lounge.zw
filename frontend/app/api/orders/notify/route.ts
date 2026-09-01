import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

type OrderPayload = {
  id: number;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  delivery_method?: string;
  delivery_address?: string;
  order_notes?: string;
  total_amount: number;
};

type ItemPayload = {
  name: string;
  quantity: number;
  color?: string;
  price: number;
};

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
    const body = await request.json() as { order?: OrderPayload; items?: ItemPayload[] };
    const order = body.order;
    const items = body.items || [];

    if (!order?.id) {
      return NextResponse.json({ success: false, message: 'Invalid order' }, { status: 400 });
    }

    const transporter = getTransporter();
    if (!transporter) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const recipient = process.env.EMAIL_TO || 'gotocarlos197@gmail.com';
    const itemLines = items
      .map((item) => `${item.name} x${item.quantity}${item.color ? ` (${item.color})` : ''} - $${Number(item.price * item.quantity).toLocaleString('en-US')}`)
      .join('\n');

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject: `New Apple Lounge order #${order.id}`,
      text: [
        `A new order has been placed: #${order.id}`,
        '',
        `Customer: ${order.customer_name}`,
        `Phone: ${order.customer_phone}`,
        `Email: ${order.customer_email || 'Not provided'}`,
        `Delivery: ${order.delivery_method || 'pickup'}`,
        `Address: ${order.delivery_address || 'Pickup'}`,
        '',
        'Items:',
        itemLines,
        '',
        `Total: $${Number(order.total_amount).toLocaleString('en-US')}`,
        `Notes: ${order.order_notes || 'None'}`,
      ].join('\n'),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    console.error('Order email failed:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
