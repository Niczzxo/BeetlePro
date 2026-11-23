'use client';

/* Contact view, the legacy #view-contact: the page head, the
   three contact feats, and the #contactForm. The submit is the
   legacy handler exactly: prevent the submit, build a mailto
   link to hello@dostelo.example with the subject "DOSTELO
   enquiry" and the message plus the sender's name as the body,
   click it through a temporary anchor (which opens the
   visitor's mail app), then reveal #contactNote. There is no
   toast in the legacy contact flow. */

import { useState, type FormEvent } from 'react';

export default function ContactView() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = encodeURIComponent(String(f.get('msg') ?? '') + '\n\n- ' + String(f.get('name') ?? ''));
    const a = document.createElement('a');
    a.href =
      'mailto:hello@dostelo.example?subject=' +
      encodeURIComponent('DOSTELO enquiry') +
      '&body=' +
      body;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSent(true);
  }

  return (
    <main>
      <div className="view" id="view-contact">
        <div className="wrap">
          <div className="page-head">
            <h1>Contact</h1>
            <p>
              Questions about a size, a delivery, or which fabric survives the playground? Write to
              us - a person from the workshop replies within one working day.
            </p>
          </div>
          <div className="split" style={{ marginTop: 36 }}>
            <div>
              <div className="feats" style={{ gridTemplateColumns: '1fr', marginTop: 0 }}>
                <div className="feat">
                  <span className="ic">
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M4 6h16v12H4z" />
                      <path d="m4 7 8 6 8-6" />
                    </svg>
                  </span>
                  <span>
                    <b>hello@dostelo.example</b>
                    <span>For orders, swatches and advice</span>
                  </span>
                </div>
                <div className="feat">
                  <span className="ic">
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M12 21c-4-3.5-7-6.6-7-10a7 7 0 0 1 14 0c0 3.4-3 6.5-7 10Z" />
                      <circle cx="12" cy="11" r="2.6" />
                    </svg>
                  </span>
                  <span>
                    <b>The Atelier</b>
                    <span>Workshop visits by appointment</span>
                  </span>
                </div>
                <div className="feat">
                  <span className="ic">
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M3 8h11v9H3zM14 11h4l3 3v3h-7z" />
                      <circle cx="7" cy="19" r="1.6" />
                      <circle cx="17" cy="19" r="1.6" />
                    </svg>
                  </span>
                  <span>
                    <b>Free size exchange · COD</b>
                    <span>7-day exchange, pay at your door</span>
                  </span>
                </div>
              </div>
            </div>
            <form className="cform" id="contactForm" onSubmit={onSubmit}>
              <label>
                Your name
                <input required name="name" placeholder="Jane Appleseed" />
              </label>
              <label>
                Email
                <input required type="email" name="email" placeholder="jane@example.com" />
              </label>
              <label>
                Message
                <textarea
                  required
                  name="msg"
                  rows={5}
                  placeholder="Tell us about the size, piece or order you’re asking about…"
                />
              </label>
              <button className="btn block" type="submit">
                Send message
              </button>
              <div className="formnote" id="contactNote" hidden={!sent}>
                Thank you - your note is ready in your mail app. We reply within one working day.
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
