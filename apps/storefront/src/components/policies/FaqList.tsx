'use client';

/* The FAQ accordion, the legacy #faqList with its click
   handler: clicking an item's button closes every answer,
   then opens the clicked one unless it was already open (the
   legacy reads willOpen from the answer's hidden flag before
   closing the rest). All answers start hidden, as in the
   legacy markup. */

import { useState } from 'react';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'How can I pay?',
    a: 'Cash on Delivery anywhere in Bangladesh, or pay ahead with bKash, Nagad, Rocket, Upay, or any debit/credit card.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Dhaka city 1-2 working days; nationwide 2-4 working days. Delivery is ৳70 in Dhaka city, ৳100 in Dhaka sub city and ৳150 outside Dhaka - worked out automatically from your delivery address at checkout. Cash on Delivery adds ৳10. Your first order gets free delivery; after that the three-zone rates apply.',
  },
  {
    q: 'What if the size is wrong?',
    a: 'Size exchanges are free within 7 days. Keep the tags on, message us your order number, and we arrange pickup and send the right size. See our size guide in the Journal before ordering.',
  },
  {
    q: 'Can I return a piece?',
    a: 'Yes - any unworn piece with tags can be returned within 7 days for a full refund of its price, processed within 3 working days of it reaching us.',
  },
  {
    q: 'Do I need an account to order?',
    a: 'Yes - ordering needs a free DOSTELO account. Sign in or create one at checkout; your bag stays exactly as it is while you do. Your orders are kept under your account, so we can welcome you back as a returning customer.',
  },
  {
    q: 'Do I get free delivery on my first order?',
    a: 'Yes - the first order on your account gets free delivery at checkout, anywhere in Bangladesh, no matter where you came from. No code is needed; it is tied to your account, so each account gets it once. From your second order onward the normal zone rates apply. Cash on Delivery still adds ৳10.',
  },
  {
    q: 'How do I track my order?',
    a: 'Your confirmation screen shows an order number. We call/SMS before dispatch and the courier calls before arriving. For updates, message us your order number any time.',
  },
  {
    q: 'What does the stitching guarantee cover?',
    a: 'Seam splits, button loss, buckle and print faults are repaired or replaced free within 12 months. See the Stitching guarantee page for details.',
  },
];

export default function FaqList() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ maxWidth: 820 }} id="faqList">
      {FAQ_ITEMS.map((item, i) => (
        <div className="faq-item" key={item.q}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)}>
            {item.q}
            <svg className="icon" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div className="fa" hidden={open !== i}>
            {item.a}
          </div>
        </div>
      ))}
    </div>
  );
}
