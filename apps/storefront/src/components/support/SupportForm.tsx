'use client';

/* Public support intake. A visitor sends a request that lands in
   the admin support queue (POST /v1/support/tickets, channel
   website), with an optional attachment uploaded first through
   the API upload system. The legacy mailto form stays above this
   one untouched; this form is the tracked route. States are
   honest: success names the queue the request joined, a 429 is
   worded as rate limiting with a wait, an unreachable or not yet
   live endpoint says the request was not sent and points back to
   email, and no success is ever shown for a failed send. */

import { useState, type FormEvent } from 'react';
import { submitSupportTicket, uploadFile } from '../../lib/publicApi';

export default function SupportForm() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setState('busy');
    setMessage(null);
    let attachmentUrl: string | undefined;
    const file = f.get('attachment');
    if (file instanceof File && file.size > 0) {
      const up = await uploadFile(file);
      if (!up.ok) {
        setState('error');
        setMessage(up.message + ' Your request was not sent yet; you can send it without the attachment.');
        return;
      }
      attachmentUrl = up.data.url;
    }
    const r = await submitSupportTicket({
      name: String(f.get('name') ?? ''),
      phone: String(f.get('phone') ?? ''),
      email: String(f.get('email') ?? '') || undefined,
      subject: String(f.get('subject') ?? ''),
      message: String(f.get('message') ?? ''),
      orderNumber: String(f.get('orderNumber') ?? '') || undefined,
      attachmentUrl,
    });
    if (r.ok) {
      setState('sent');
      setMessage(
        'Your request is in the support queue. A person from the workshop replies within one working day.',
      );
      form.reset();
    } else if (r.kind === 'rate-limited') {
      setState('error');
      setMessage('Too many requests in a short time. Please wait a little and try again, or email us instead.');
    } else if (r.kind === 'not-found' || r.kind === 'network' || r.kind === 'server') {
      setState('error');
      setMessage('The support form could not reach the store service, so your request was not sent. Please use the email form above instead.');
    } else {
      setState('error');
      setMessage(r.message);
    }
  }

  return (
    <div className="co-card" style={{ marginTop: 28 }}>
      <h3>Open a support request</h3>
      <p>
        Prefer a tracked request? Send it here and it joins the workshop support queue, with a
        reply to your phone or email.
      </p>
      <form className="cform" onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <label>
          Your name
          <input name="name" required maxLength={120} autoComplete="name" />
        </label>
        <label>
          Mobile number
          <input name="phone" required maxLength={30} autoComplete="tel" />
        </label>
        <label>
          Email (optional)
          <input name="email" type="email" maxLength={160} autoComplete="email" />
        </label>
        <label>
          Order number (optional)
          <input name="orderNumber" maxLength={40} placeholder="For example BP-123456" />
        </label>
        <label>
          Subject
          <input name="subject" required maxLength={160} />
        </label>
        <label>
          What do you need help with?
          <textarea name="message" required rows={5} maxLength={3000} />
        </label>
        <label>
          Attachment (optional, a photo helps with damage or defect reports)
          <input name="attachment" type="file" accept="image/*" />
        </label>
        {message ? <p role="status">{message}</p> : null}
        <button className="btn block" type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Sending.' : 'Send support request'}
        </button>
      </form>
    </div>
  );
}
