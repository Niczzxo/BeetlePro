import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Header from '../components/shell/Header';
import Footer from '../components/shell/Footer';
import BagDrawer from '../components/shell/BagDrawer';
import MenuSidebar from '../components/shell/MenuSidebar';
import MenuProvider from '../features/menu/Menu';
import CartProvider from '../features/cart/CartProvider';
import AccountProvider from '../features/account/AccountProvider';
import CheckoutProvider from '../features/checkout/CheckoutProvider';
import WishlistProvider from '../features/wishlist/WishlistProvider';
import ModalProvider from '../features/modals/Modals';
import ToastProvider from '../features/toast/Toast';
import Tracker from '../features/tracking/Tracker';
import NavSystem from '../components/shell/NavSystem';

/* The legacy <title> and meta description for the home view.
   Every route carries its own legacy SEO_PAGES pair (or the
   applySEO() dynamic rule for shop, product and article) as
   static metadata; see src/lib/seo.ts. */
export const metadata: Metadata = {
  title: 'Dostelo - Boys Clothing in Bangladesh | Shirts, Tees, Pants & Belts',
  description:
    'DOSTELO is a boys clothing store in Bangladesh - shirts, t-shirts, polos, pants, jeans, belts and accessories in honest fabrics and fair taka prices. Cash on Delivery, bKash, Nagad, Rocket, Upay and cards accepted.',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  themeColor: '#F4F2ED',
  viewportFit: 'cover',
};

/* Theme init before paint, replicated exactly from the legacy head:
   the visitor's saved choice only. There is deliberately NO
   system-preference fallback - the store always opens in its light
   off-white theme unless the visitor has used the navbar toggle to
   choose dark on an earlier visit. */
const THEME_INIT = `/* Theme init before paint: the visitor's saved choice only. There is
   deliberately NO system-preference fallback - the store always opens
   in its light off-white theme unless the visitor has used the navbar
   toggle to choose dark on an earlier visit. */
(function(){
  var t = null;
  try { t = localStorage.getItem('dostelo-theme'); } catch(e) {}
  if (t !== 'dark' && t !== 'light') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <canvas id="inkCanvas" aria-hidden="true" data-html2canvas-ignore={true}></canvas>
        <div id="dragBadge" aria-hidden="true" data-html2canvas-ignore={true}>
          {'\u2039\u00A0Drag\u00A0\u203A'}
        </div>
        <ToastProvider>
          <WishlistProvider>
            <AccountProvider>
              <CheckoutProvider>
                <ModalProvider>
                  <CartProvider>
                    <MenuProvider>
                      <NavSystem />
                      <Header />
                      {children}
                      <Footer />
                      <BagDrawer />
                      <MenuSidebar />
                      <Tracker />
                    </MenuProvider>
                  </CartProvider>
                </ModalProvider>
              </CheckoutProvider>
            </AccountProvider>
          </WishlistProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
