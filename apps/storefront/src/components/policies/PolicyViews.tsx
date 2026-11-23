/* The legacy help views: #view-shipping, #view-returns,
   #view-warranty and #view-faq, ported with their exact
   markup and text. The legacy reaches them through the
   product and checkout policy links and its hash routes
   (#/shipping, #/returns, #/warranty, #/faq); here they are
   the /policies/<slug> routes. Privacy and Terms have no
   legacy views: they exist only as help modal topics, and
   stay that way. */

import FaqList from './FaqList';

export const POLICY_SLUGS = ['shipping', 'returns', 'warranty', 'faq'] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function ShippingView() {
  return (
    <main>
      <div className="view" id="view-shipping">
        <div className="wrap">
          <div className="page-head">
            <div className="eyebrow">Help</div>
            <h1>Shipping &amp; delivery</h1>
            <p>
              We deliver to every district in Bangladesh - Dhaka city, district towns and
              everywhere the courier roads reach.
            </p>
          </div>
          <div className="infocols">
            <div className="value">
              <h3>Dhaka city</h3>
              <p>1-2 working days. Delivery ৳70 per order. Same-week dispatch on everything in stock.</p>
            </div>
            <div className="value">
              <h3>Dhaka sub city &amp; nationwide</h3>
              <p>
                Dhaka sub city (Gazipur, Savar, Narayanganj and nearby areas) ৳100 per order;
                outside Dhaka ৳150 per order. 2-4 working days via trusted couriers, with a
                tracking call/SMS before the rider arrives. Cash on Delivery adds ৳10.
              </p>
            </div>
            <div className="value">
              <h3>Pay your way</h3>
              <p>
                Cash on Delivery everywhere, or pay ahead with bKash, Nagad, Rocket, Upay or card.
                Nothing is dispatched until COD is phone-confirmed or the mobile payment lands.
              </p>
            </div>
          </div>
          <div className="article" style={{ marginTop: 44 }}>
            <h3>How delivery works</h3>
            <p>
              Place your order and keep the order number from the confirmation screen. At checkout,
              your delivery charge is worked out automatically from the address you enter - ৳70 in
              Dhaka city, ৳100 in Dhaka sub city, ৳150 outside Dhaka, and Cash on Delivery adds
              ৳10. Your first order gets free delivery - the offer is applied automatically at
              checkout, no code needed. From your second order onward the normal zone rates above
              apply. We call or message to confirm, pack your pieces, and hand them to the courier
              the same or next working day. The rider calls before arriving - please keep your
              phone reachable on the delivery day.
            </p>
            <h3>Checking your pieces</h3>
            <p>
              With Cash on Delivery you can check the size and fabric in front of the rider. If the
              size is wrong, do not worry - size exchange is free within 7 days; just keep the tags
              on.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export function ReturnsView() {
  return (
    <main>
      <div className="view" id="view-returns">
        <div className="wrap">
          <div className="page-head">
            <div className="eyebrow">Help</div>
            <h1>Returns &amp; exchanges</h1>
            <p>Wrong size is the most common reason - so we made fixing it free, fast and painless.</p>
          </div>
          <div className="infocols">
            <div className="value">
              <h3>Free size exchange</h3>
              <p>
                Within 7 days of delivery, anywhere in Bangladesh. Keep the tags on, message us
                your order number and the size you need - we arrange pickup and send the new size.
              </p>
            </div>
            <div className="value">
              <h3>7-day returns</h3>
              <p>
                Changed your mind? Return any unworn piece with tags within 7 days for a full
                refund of its price.
              </p>
            </div>
            <div className="value">
              <h3>Fast refunds</h3>
              <p>
                Refunds land within 3 working days of the piece reaching us - back to your
                bKash/Nagad or as cash adjustment on your next order, your choice.
              </p>
            </div>
          </div>
          <div className="article" style={{ marginTop: 44 }}>
            <h3>How to start an exchange or return</h3>
            <p>
              Message us from the Contact page with your order number, the item, and the size you
              want instead. We book the pickup - you hand the piece to the rider, and the
              replacement or refund follows automatically. Pieces must be unworn (trying on at
              home is fine) with tags attached.
            </p>
            <h3>Damaged or wrong item?</h3>
            <p>
              If anything arrives damaged, or we sent the wrong piece, tell us within 48 hours with
              a photo - replacement or full refund, and the pickup is on us, always.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export function WarrantyView() {
  return (
    <main>
      <div className="view" id="view-warranty">
        <div className="wrap">
          <div className="page-head">
            <div className="eyebrow">Help</div>
            <h1>Stitching guarantee</h1>
            <p>
              Clothing should fail from years of wear, not from a loose seam in month two. If our
              stitching fails, we fix it.
            </p>
          </div>
          <div className="infocols">
            <div className="value">
              <h3>Covered free</h3>
              <p>
                Seam splits, button loss, zip and buckle faults, and print defects - repaired or
                replaced free within 12 months of delivery.
              </p>
            </div>
            <div className="value">
              <h3>How to claim</h3>
              <p>
                Send your order number and a photo of the fault via the Contact page. We arrange
                pickup, repair in the workshop, and return it - usually within a week.
              </p>
            </div>
            <div className="value">
              <h3>Not covered</h3>
              <p>
                Wear-and-tear fading, stains, and damage from misuse or alterations by outside
                tailors. Honest clothes, honest limits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function FaqView() {
  return (
    <main>
      <div className="view" id="view-faq">
        <div className="wrap">
          <div className="page-head">
            <div className="eyebrow">Help</div>
            <h1>Frequently asked questions</h1>
            <p>Payments, delivery, sizes and exchanges - the things customers ask us most.</p>
          </div>
          <FaqList />
        </div>
      </div>
    </main>
  );
}

export const POLICY_VIEWS: Record<PolicySlug, () => React.JSX.Element> = {
  shipping: ShippingView,
  returns: ReturnsView,
  warranty: WarrantyView,
  faq: FaqView,
};
