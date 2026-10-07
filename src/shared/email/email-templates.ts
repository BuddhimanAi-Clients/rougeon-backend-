import { envVariables } from '../../configs/env.config.js';

/**
 * Branded transactional email templates.
 *
 * Email clients ignore stylesheets and modern layout, so everything here is
 * table-based with inline styles. Every template returns matching HTML and
 * plain-text bodies; all dynamic values are HTML-escaped.
 */

export type EmailContent = { subject: string; html: string; text: string };

type Money = { toFixed(digits: number): string };

export type BillItem = {
  productName: string;
  productImageUrl: string | null;
  variantSku?: string | null;
  variantSize: string;
  variantColor: string;
  qty: number;
  price: Money;
  lineTotal: Money;
  membershipDiscountEligible?: boolean;
};

export type BillRow = { label: string; value: string; strong?: boolean; muted?: boolean };

const INK = '#0b0b0d';
const PAPER = '#f4f3ef';
const MUTED = '#6f706f';
const LINE = '#e3e2dd';
const ACCENT = '#b3122b';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function formatMoney(value: Money | string | number) {
  const fixed = typeof value === 'string' ? Number(value).toFixed(2) : typeof value === 'number' ? value.toFixed(2) : value.toFixed(2);
  const [whole = '0', fraction = '00'] = fixed.split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  return `${negative ? '-' : ''}NPR ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

function formatPercent(value: Money) {
  return `${Number(value.toFixed(2))}%`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: envVariables.BUSINESS_TIMEZONE }).format(date);
}

function safeImageUrl(url: string | null | undefined) {
  return url && url.startsWith('https://') ? url : null;
}

function storeUrl() {
  return envVariables.WEB_APP_URL?.replace(/\/$/, '');
}

function layout(input: { preheader: string; heading: string; intro: string; body: string }) {
  const site = storeUrl();
  const wordmark = `<span style="font-family:Impact,'Arial Narrow',${FONT};font-size:30px;letter-spacing:1px;color:#ffffff;text-decoration:none;">ROGUEON<sup style="font-family:Arial,sans-serif;font-size:10px;">&reg;</sup></span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER};">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};">
<tr><td align="center" style="background:${INK};padding:28px 24px;">${site ? `<a href="${escapeHtml(site)}" style="text-decoration:none;">${wordmark}</a>` : wordmark}<div style="font-family:${FONT};font-size:10px;letter-spacing:3px;color:#b9b9b6;text-transform:uppercase;padding-top:8px;">Break &#9733; rules &#9733; repeat</div></td></tr>
<tr><td style="padding:32px 28px 8px 28px;font-family:${FONT};color:${INK};">
<h1 style="margin:0 0 12px 0;font-family:${FONT};font-size:22px;line-height:1.25;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:${INK};">${escapeHtml(input.heading)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#2b2c2f;">${input.intro}</p>
</td></tr>
<tr><td style="padding:16px 28px 32px 28px;font-family:${FONT};color:${INK};">${input.body}</td></tr>
<tr><td style="background:${INK};padding:22px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:#b9b9b6;" align="center">
<strong style="color:#ffffff;letter-spacing:1px;">${escapeHtml(envVariables.STORE_NAME)}</strong><br>
${escapeHtml(envVariables.STORE_ADDRESS)}${envVariables.STORE_PHONE ? `<br>${escapeHtml(envVariables.STORE_PHONE)}` : ''}${site ? `<br><a href="${escapeHtml(site)}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>` : ''}
<div style="padding-top:10px;font-size:11px;color:#8a8a87;">This is an automated message about your ROGUEON account or purchase.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function metaTable(rows: Array<[string, string]>) {
  const cells = rows.map(([label, value]) => `<tr><td style="padding:6px 0;font-family:${FONT};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;font-family:${FONT};font-size:14px;font-weight:700;color:${INK};">${escapeHtml(value)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${INK};border-bottom:1px solid ${LINE};margin:0 0 20px 0;">${cells}</table>`;
}

function itemsTable(items: readonly BillItem[]) {
  const rows = items.map((item) => {
    const image = safeImageUrl(item.productImageUrl);
    const picture = image
      ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.productName)}" width="72" height="90" style="display:block;width:72px;height:90px;object-fit:cover;border:1px solid ${LINE};background:${PAPER};font-family:${FONT};font-size:10px;line-height:1.2;color:${MUTED};overflow:hidden;">`
      : `<div style="width:72px;height:90px;line-height:90px;text-align:center;background:${PAPER};border:1px solid ${LINE};font-family:Impact,${FONT};font-size:26px;color:#c9c8c3;">R</div>`;
    const noDiscount = item.membershipDiscountEligible === false
      ? `<div style="padding-top:4px;font-size:11px;color:${ACCENT};">Member discount not applicable</div>`
      : '';
    return `<tr>
<td width="72" valign="top" style="padding:14px 0;border-bottom:1px solid ${LINE};">${picture}</td>
<td valign="top" style="padding:14px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};">
<div style="font-size:15px;font-weight:700;color:${INK};line-height:1.3;">${escapeHtml(item.productName)}</div>
<div style="padding-top:4px;font-size:13px;color:${MUTED};">Size ${escapeHtml(item.variantSize)} &middot; ${escapeHtml(item.variantColor)}</div>
<div style="padding-top:4px;font-size:13px;color:${MUTED};">${item.qty} &times; ${formatMoney(item.price)}</div>${noDiscount}
</td>
<td valign="top" align="right" style="padding:14px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;font-weight:700;color:${INK};white-space:nowrap;">${formatMoney(item.lineTotal)}</td>
</tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};">${rows}</table>`;
}

function totalsTable(rows: readonly BillRow[]) {
  const cells = rows.map((row) => row.strong
    ? `<tr><td style="padding:12px 0 0 0;border-top:2px solid ${INK};font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${INK};">${escapeHtml(row.label)}</td><td align="right" style="padding:12px 0 0 0;border-top:2px solid ${INK};font-family:${FONT};font-size:18px;font-weight:800;color:${INK};white-space:nowrap;">${escapeHtml(row.value)}</td></tr>`
    : `<tr><td style="padding:5px 0;font-family:${FONT};font-size:14px;color:${row.muted ? MUTED : '#2b2c2f'};">${escapeHtml(row.label)}</td><td align="right" style="padding:5px 0;font-family:${FONT};font-size:14px;color:${row.muted ? MUTED : INK};white-space:nowrap;">${escapeHtml(row.value)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">${cells}</table>`;
}

function note(html: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr><td style="padding:14px 16px;background:${PAPER};border-left:3px solid ${INK};font-family:${FONT};font-size:13px;line-height:1.6;color:#2b2c2f;">${html}</td></tr></table>`;
}

function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px 0;"><tr><td align="center" bgcolor="${INK}" style="background:${INK};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

function textItems(items: readonly BillItem[]) {
  return items.map((item) => `${item.qty} x ${item.productName} (${item.variantSize} / ${item.variantColor}) - ${formatMoney(item.lineTotal)}${item.membershipDiscountEligible === false ? ' [no member discount]' : ''}`).join('\n');
}

function textRows(rows: readonly BillRow[]) {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n');
}

// ---------------------------------------------------------------------------
// POS receipt
// ---------------------------------------------------------------------------

export function posReceiptEmail(input: {
  customerName: string;
  saleNumber: string;
  createdAt: Date;
  cashierName: string;
  paymentMethod: 'cash' | 'qr' | 'split';
  cashAmount?: Money;
  qrAmount?: Money;
  items: readonly BillItem[];
  subtotal: Money;
  merchandiseDiscount: Money;
  membershipDiscountPercent: Money;
  tierName: string | null;
  discountWaived: boolean;
  total: Money;
  eligibleNetSpend: Money;
  newlyUnlockedTier: string | null;
}): EmailContent {
  const hasDiscount = Number(input.merchandiseDiscount.toFixed(2)) > 0;
  const rows: BillRow[] = [{ label: 'Subtotal', value: formatMoney(input.subtotal) }];
  if (hasDiscount) rows.push({ label: `Member discount${input.tierName ? ` (${input.tierName} ${formatPercent(input.membershipDiscountPercent)})` : ''}`, value: `-${formatMoney(input.merchandiseDiscount)}` });
  rows.push({ label: 'Total paid', value: formatMoney(input.total), strong: true });
  const payment = input.paymentMethod === 'split' && input.cashAmount && input.qrAmount
    ? `QR ${formatMoney(input.qrAmount)} + Cash ${formatMoney(input.cashAmount)}`
    : input.paymentMethod === 'qr' ? 'QR payment' : 'Cash';
  const meta: Array<[string, string]> = [
    ['Receipt no.', input.saleNumber],
    ['Date', formatDate(input.createdAt)],
    ['Paid by', payment],
    ['Served by', input.cashierName],
  ];
  const membership = `Membership spend this year: <strong>${formatMoney(input.eligibleNetSpend)}</strong>${input.tierName ? ` &middot; Tier: <strong>${escapeHtml(input.tierName)}</strong>` : ''}${input.newlyUnlockedTier ? `<br><strong style="color:${ACCENT};">You unlocked ${escapeHtml(input.newlyUnlockedTier)} membership.</strong>` : ''}`;
  const html = layout({
    preheader: `Receipt ${input.saleNumber} - ${formatMoney(input.total)} paid`,
    heading: 'Thank you for your purchase',
    intro: `Hi ${escapeHtml(input.customerName)}, here is the receipt for your in-store purchase.`,
    body: `${metaTable(meta)}${itemsTable(input.items)}${totalsTable(rows)}${note(membership)}`,
  });
  const text = [
    `Thank you, ${input.customerName}!`,
    `ROGUEON receipt ${input.saleNumber}`,
    `${formatDate(input.createdAt)} - ${payment} - served by ${input.cashierName}`,
    '',
    textItems(input.items),
    '',
    textRows(rows),
    '',
    `Membership spend this year: ${formatMoney(input.eligibleNetSpend)}${input.tierName ? ` - Tier: ${input.tierName}` : ''}`,
    ...(input.newlyUnlockedTier ? [`New membership unlocked: ${input.newlyUnlockedTier}`] : []),
  ].join('\n');
  return { subject: `Your ROGUEON receipt - ${input.saleNumber}`, html, text };
}

// ---------------------------------------------------------------------------
// Website orders
// ---------------------------------------------------------------------------

export type WebOrderBill = {
  orderNumber: string;
  createdAt: Date;
  paymentMethod: 'qr' | 'cod';
  items: readonly BillItem[];
  subtotal: Money;
  merchandiseDiscount: Money;
  membershipDiscountPercent: Money;
  tierName: string | null;
  shippingDeliveryFee: Money;
  shippingPickupFee: Money;
  shippingFee: Money;
  total: Money;
  advancePaymentAmount: Money;
  codCollectionAmount: Money;
  delivery?: { name: string | null; phone: string | null; fullAddress: string | null; city: string | null };
  // Set when the customer collects the parcel from this courier branch.
  collectBranch?: string | null | undefined;
};

function webOrderRows(order: WebOrderBill, stage: 'confirmed' | 'delivered') {
  const rows: BillRow[] = [{ label: 'Subtotal', value: formatMoney(order.subtotal) }];
  if (Number(order.merchandiseDiscount.toFixed(2)) > 0) rows.push({ label: `Member discount${order.tierName ? ` (${order.tierName} ${formatPercent(order.membershipDiscountPercent)})` : ''}`, value: `-${formatMoney(order.merchandiseDiscount)}` });
  rows.push({ label: 'Delivery', value: formatMoney(order.shippingFee) });
  rows.push({ label: 'Order total', value: formatMoney(order.total), strong: true });
  if (order.paymentMethod === 'cod') {
    rows.push({ label: 'Paid in advance by QR', value: formatMoney(order.advancePaymentAmount), muted: true });
    rows.push({ label: stage === 'delivered' ? 'Paid to courier on delivery' : 'To pay the courier on delivery', value: formatMoney(order.codCollectionAmount), muted: true });
  } else {
    rows.push({ label: 'Paid in full by QR', value: formatMoney(order.total), muted: true });
  }
  return rows;
}

function deliveryBlock(order: WebOrderBill) {
  const delivery = order.delivery;
  if (order.collectBranch) {
    const who = [delivery?.name, delivery?.phone].filter((line): line is string => Boolean(line)).map(escapeHtml).join('<br>');
    return note(`<strong style="letter-spacing:1px;text-transform:uppercase;font-size:11px;color:${MUTED};">Collect from</strong><br>Nepal Can Move, ${escapeHtml(order.collectBranch)} branch${who ? `<br>${who}` : ''}<br>The courier will call you when your parcel is ready to collect.`);
  }
  if (!delivery?.fullAddress) return '';
  const lines = [delivery.name, delivery.fullAddress, delivery.city, delivery.phone].filter((line): line is string => Boolean(line)).map(escapeHtml).join('<br>');
  return note(`<strong style="letter-spacing:1px;text-transform:uppercase;font-size:11px;color:${MUTED};">Delivering to</strong><br>${lines}`);
}

function orderLink(orderNumber: string) {
  const site = storeUrl();
  return site ? button('View your orders', `${site}/orders`) : `<p style="margin:0 0 20px 0;font-family:${FONT};font-size:13px;color:${MUTED};">Order ${escapeHtml(orderNumber)}</p>`;
}

export function webOrderConfirmedEmail(input: { customerName: string; order: WebOrderBill; eligibleNetSpend?: Money | undefined }): EmailContent {
  const { order } = input;
  const rows = webOrderRows(order, 'confirmed');
  const meta: Array<[string, string]> = [
    ['Order no.', order.orderNumber],
    ['Placed', formatDate(order.createdAt)],
    ['Payment', order.paymentMethod === 'cod' ? 'Cash on delivery (advance paid)' : 'Paid in full by QR'],
  ];
  const cod = order.paymentMethod === 'cod'
    ? note(`Please keep <strong>${formatMoney(order.codCollectionAmount)}</strong> ready to pay ${order.collectBranch ? 'at the Nepal Can Move branch when you collect your parcel' : 'the Nepal Can Move courier when your parcel arrives'}.`)
    : '';
  const membership = input.eligibleNetSpend ? note(`Membership spend this year: <strong>${formatMoney(input.eligibleNetSpend)}</strong>`) : '';
  const html = layout({
    preheader: `Order ${order.orderNumber} confirmed - ${formatMoney(order.total)}`,
    heading: 'Your order is confirmed',
    intro: `Hi ${escapeHtml(input.customerName)}, we have verified your payment and your order is now being prepared. Your receipt is below.`,
    body: `${metaTable(meta)}${itemsTable(order.items)}${totalsTable(rows)}${cod}${deliveryBlock(order)}${membership}<div style="padding-top:24px;">${orderLink(order.orderNumber)}</div>`,
  });
  const text = [
    `Thank you, ${input.customerName}!`,
    `Your ROGUEON order ${order.orderNumber} is confirmed.`,
    '',
    textItems(order.items),
    '',
    textRows(rows),
    ...(order.collectBranch ? ['', `Collect from: Nepal Can Move, ${order.collectBranch} branch. The courier will call you when your parcel is ready.`] : []),
    ...(input.eligibleNetSpend ? ['', `Membership spend this year: ${formatMoney(input.eligibleNetSpend)}`] : []),
  ].join('\n');
  return { subject: `Order confirmed - ${order.orderNumber}`, html, text };
}

export function webOrderDeliveredEmail(input: { customerName: string; order: WebOrderBill }): EmailContent {
  const { order } = input;
  const rows = webOrderRows(order, 'delivered');
  const meta: Array<[string, string]> = [
    ['Order no.', order.orderNumber],
    ['Placed', formatDate(order.createdAt)],
    ['Status', 'Delivered'],
  ];
  const html = layout({
    preheader: `Order ${order.orderNumber} has been delivered`,
    heading: 'Your order has been delivered',
    intro: `Hi ${escapeHtml(input.customerName)}, your ROGUEON order has arrived. Here is your final receipt. We hope you love it.`,
    body: `${metaTable(meta)}${itemsTable(order.items)}${totalsTable(rows)}`,
  });
  const text = [
    `Hi ${input.customerName}, your ROGUEON order ${order.orderNumber} was delivered.`,
    '',
    textItems(order.items),
    '',
    textRows(rows),
  ].join('\n');
  return { subject: `Delivered - ${order.orderNumber}`, html, text };
}

// ---------------------------------------------------------------------------
// Account emails
// ---------------------------------------------------------------------------

function actionEmail(input: { subject: string; heading: string; intro: string; buttonLabel: string; url: string; footnote: string; textLead: string }): EmailContent {
  const html = layout({
    preheader: input.heading,
    heading: input.heading,
    intro: escapeHtml(input.intro),
    body: `${button(input.buttonLabel, input.url)}<p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">If the button does not work, copy this link into your browser:</p><p style="margin:0 0 18px 0;font-family:${FONT};font-size:12px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(input.url)}" style="color:${INK};">${escapeHtml(input.url)}</a></p><p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(input.footnote)}</p>`,
  });
  // Auth emails are deduplicated on their text body, which must therefore
  // stay a pure function of the action link.
  return { subject: input.subject, html, text: `${input.textLead}: ${input.url}` };
}

export function verifyEmailEmail(input: { name?: string | null | undefined; url: string }): EmailContent {
  return actionEmail({
    subject: 'Verify your ROGUEON email',
    heading: 'Verify your email',
    intro: `${input.name ? `Hi ${input.name}, ` : ''}confirm this email address to activate your ROGUEON account and start earning membership rewards.`.replace(/^c/, 'C'),
    buttonLabel: 'Verify email',
    url: input.url,
    footnote: 'If you did not create a ROGUEON account, you can safely ignore this email.',
    textLead: 'Verify your email',
  });
}

export function resetPasswordEmail(input: { name?: string | null | undefined; url: string }): EmailContent {
  return actionEmail({
    subject: 'Reset your ROGUEON password',
    heading: 'Reset your password',
    intro: `${input.name ? `Hi ${input.name}, ` : ''}we received a request to reset the password for your ROGUEON account.`.replace(/^w/, 'W'),
    buttonLabel: 'Reset password',
    url: input.url,
    footnote: 'This link expires soon. If you did not ask to reset your password, you can safely ignore this email.',
    textLead: 'Reset your password',
  });
}
