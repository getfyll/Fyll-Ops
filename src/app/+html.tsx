import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no" />
        <meta name="theme-color" content="#111111" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="shortcut icon" href="/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />

        {/*
          Runs synchronously during HTML parsing, before the SPA bundle
          loads/hydrates. iOS reads the <link> tags and page title the
          instant "Add to Home Screen" is tapped, so a React useEffect
          (which only fires after hydration) can lose that race and leave
          the default Fyll icon/name showing. This inline script rewrites
          them for the partner portal domain as early as physically
          possible on the page.
        */}
        <script dangerouslySetInnerHTML={{ __html: partnerBrandingScript }} />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        <style dangerouslySetInnerHTML={{ __html: iosInstallPromptStyles }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: pwaBootScript }} />
      </body>
    </html>
  );
}

const partnerBrandingScript = `
(function () {
  try {
    var hostname = window.location.hostname.replace(/^www\\./, '');
    if (hostname !== 'partner.fyll.app') return;

    document.title = 'Fyll Partner';

    var setMeta = function (name, content) {
      var el = document.querySelector('meta[name="' + name + '"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('apple-mobile-web-app-title', 'Fyll Partner');

    var setLinkHref = function (selector, href) {
      var el = document.querySelector(selector);
      if (el) el.setAttribute('href', href);
    };
    setLinkHref('link[rel="icon"]', '/favicon-partner-32.png');
    setLinkHref('link[rel="shortcut icon"]', '/favicon-partner-32.png');
    setLinkHref('link[rel="apple-touch-icon"]', '/icons/apple-touch-icon-partner-180.png');
    setLinkHref('link[rel="manifest"]', '/manifest-partner.json');
  } catch (e) {}
})();
`;

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;

const iosInstallPromptStyles = `
#ios-install-coachmark {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  z-index: 2147483647;
  background: rgba(17, 17, 17, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  color: #fff;
  padding: 12px 14px 14px 14px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}
#ios-install-coachmark::after {
  content: "";
  position: absolute;
  right: 34px;
  bottom: -10px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid rgba(17, 17, 17, 0.94);
}
#ios-install-coachmark .title {
  margin: 0 24px 4px 0;
  font-size: 14px;
  font-weight: 700;
}
#ios-install-coachmark .body {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.9);
}
#ios-install-coachmark .icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px;
  font-weight: 700;
}
#ios-install-coachmark .close {
  position: absolute;
  top: 8px;
  right: 8px;
  border: 0;
  border-radius: 999px;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
@media (min-width: 768px) {
  #ios-install-coachmark {
    max-width: 420px;
    left: auto;
    right: 16px;
  }
}
`;

const pwaBootScript = `
(function () {
  var DISMISS_KEY = 'fyll_ios_install_prompt_hidden_until';
  var DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

  function isIosDevice() {
    var ua = window.navigator.userAgent.toLowerCase();
    var iOS = /iphone|ipad|ipod/.test(ua);
    var iPadOS = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    return iOS || iPadOS;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function shouldShowCoachMark() {
    if (!isIosDevice() || isStandalone()) return false;
    try {
      var hiddenUntil = Number(window.localStorage.getItem(DISMISS_KEY) || '0');
      return Date.now() > hiddenUntil;
    } catch (_err) {
      return true;
    }
  }

  function hideCoachMark() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch (_err) {}
    var existing = document.getElementById('ios-install-coachmark');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function showCoachMark() {
    if (document.getElementById('ios-install-coachmark')) return;
    var el = document.createElement('div');
    el.id = 'ios-install-coachmark';
    el.innerHTML =
      '<button class="close" aria-label="Dismiss">×</button>' +
      '<p class="title">Install Fyll on your Home Screen</p>' +
      '<p class="body">Tap <span class="icon">↑</span> Share, then <span class="icon">⊞</span> Add to Home Screen.</p>';
    var close = el.querySelector('.close');
    if (close) {
      close.addEventListener('click', hideCoachMark);
    }
    document.body.appendChild(el);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        registrations.forEach(function (registration) {
          registration.unregister().catch(function () {});
        });
      }).catch(function () {});
      return;
    }
    window.addEventListener('load', function () {
      var serviceWorkerUrl = new URL('/service-worker.js', window.location.origin).toString();
      navigator.serviceWorker.register(serviceWorkerUrl).catch(function (error) {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  registerServiceWorker();
  if (shouldShowCoachMark()) {
    window.setTimeout(showCoachMark, 1200);
  }
})();
`;
