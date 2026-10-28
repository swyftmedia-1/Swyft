
(function () {
  'use strict';

  // Responsive navigation.
  document.querySelectorAll('.menu-toggle').forEach(function (toggle, index) {
    var header =
      toggle.closest('.site-header') ||
      toggle.closest('header') ||
      document;

    var controlledId = toggle.getAttribute('aria-controls');
    var nav = controlledId
      ? document.getElementById(controlledId)
      : null;

    if (!nav) {
      nav =
        header.querySelector('.main-nav') ||
        document.querySelector('.main-nav');
    }

    if (!nav) return;

    if (!nav.id) {
      nav.id = 'swyft-main-nav-' + (index + 1);
    }

    toggle.setAttribute('aria-controls', nav.id);

    function setMenuOpen(open, returnFocus) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute(
        'aria-label',
        open ? 'Close menu' : 'Open menu'
      );

      if (!open && returnFocus) {
        toggle.focus();
      }
    }

    setMenuOpen(false, false);

    toggle.addEventListener('click', function () {
      setMenuOpen(
        toggle.getAttribute('aria-expanded') !== 'true',
        false
      );
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMenuOpen(false, false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (
        event.key === 'Escape' &&
        toggle.getAttribute('aria-expanded') === 'true'
      ) {
        setMenuOpen(false, true);
      }
    });

    document.addEventListener('click', function (event) {
      if (
        toggle.getAttribute('aria-expanded') === 'true' &&
        !header.contains(event.target)
      ) {
        setMenuOpen(false, false);
      }
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 981px)').matches) {
        setMenuOpen(false, false);
      }
    }, { passive: true });
  });

  // Reveal sections as they enter the viewport.
  var io;

  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      io.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  // Keep copyright dates current.
  document.querySelectorAll('[data-current-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Contact form mailto behaviour.
  var mailForm = document.querySelector('[data-mailto-form]');

  if (mailForm) {
    mailForm.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!mailForm.reportValidity()) return;

      var data = new FormData(mailForm);

     var lines = [
  'New website enquiry',
  '',
  'Name: ' + (data.get('name') || ''),
  'Phone: ' + (data.get('phone') || ''),
  'Email: ' + (data.get('email') || ''),
  'Company: ' + (data.get('company') || ''),
  'Service required: ' + (data.get('service') || ''),
  '',
  'Project details:',
  (data.get('message') || '')
];

      var subject = encodeURIComponent(
        'New Swyft Media website enquiry'
      );

      var body = encodeURIComponent(lines.join('\n'));

      window.location.href =
        'mailto:info@swyftmedia.in?subject=' +
        subject +
        '&body=' +
        body;
    });
  }

    // SWYFT ONE popup.
  // Display on every homepage load or refresh.
  // The visit number is stored locally in this browser.

  var pathname = window.location.pathname.toLowerCase();
  var hostname = window.location.hostname.toLowerCase();

  var isSwyftMediaDomain =
    hostname === 'swyftmedia.in' ||
    hostname === 'www.swyftmedia.in';

  var isHomePage =
    pathname === '/' ||
    pathname === '/home/' ||
    pathname === '/home' ||
    pathname === '/index.html';

  var isPassPage =
    /(?:^|\/)swyft-pass\.html$/.test(pathname);

  if (!isSwyftMediaDomain || !isHomePage || isPassPage) {
    return;
  }

  // Increase the homepage visit number on every page load.
  // This is a count for this browser, not a global visitor count.
  var homepageViewCount = 1;

  try {
    var savedCount = parseInt(
      window.localStorage.getItem('swyftHomepageRefreshCount'),
      10
    );

    homepageViewCount =
      Number.isFinite(savedCount) && savedCount >= 0
        ? savedCount + 1
        : 1;

    window.localStorage.setItem(
      'swyftHomepageRefreshCount',
      String(homepageViewCount)
    );
  } catch (storageError) {
    // The popup still works if browser storage is unavailable.
  }

  // Find the Swyft Pass destination.
  var navPassLink = document.querySelector(
    '.main-nav a[href*="swyft-pass.html"]'
  );

  var passUrl = navPassLink
    ? navPassLink.href
    : new URL('/swyft-pass.html', window.location.origin).href;

  // WhatsApp click-to-chat link for SWYFT Media.
  var whatsappMessage =
    'Hello Swyft Media, I would like to know more about Swyft Pass.';

  var whatsappUrl =
    'https://wa.me/918866205765?text=' +
    encodeURIComponent(whatsappMessage);

  function showPassPopup() {
    if (!document.body) return;

    // Prevent duplicate dialogs on the same page load.
    if (document.querySelector('dialog.pass-popup')) return;

    // Do not interrupt an open mobile navigation menu.
    if (
      document.querySelector(
        '.menu-toggle[aria-expanded="true"]'
      )
    ) {
      window.setTimeout(showPassPopup, 300);
      return;
    }

    var dialog = document.createElement('dialog');

    dialog.className = 'pass-popup';
    dialog.setAttribute('aria-labelledby', 'pass-popup-title');

    var safePassUrl = passUrl
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var safeWhatsappUrl = whatsappUrl
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    dialog.innerHTML =
      '<div class="pass-popup-card">' +

        '<button class="pass-popup-close" type="button" ' +
          'aria-label="Close popup">&times;</button>' +

        '<div class="pass-popup-eyebrow">' +
          '<span class="pass-popup-dot" aria-hidden="true"></span>' +
          ' SWYFT ONE · BUSINESS PASS' +
        '</div>' +

        '<h2 id="pass-popup-title">' +
          'Your Creative Team,<br>One Pass.' +
        '</h2>' +

        '<p>' +
          'Discover a connected creative wallet for branding, ' +
          'marketing, social media and PR, built to keep ' +
          'your brand moving all year.' +
        '</p>' +

        // Browser-local homepage visit number.
        '<div class="pass-popup-visit">' +
          '<span class="pass-popup-visit-label">' +
            'HOMEPAGE VISIT' +
          '</span>' +
          '<span class="pass-popup-visit-number">' +
            '#' + homepageViewCount +
          '</span>' +
        '</div>' +

        // One unified navy box containing all contact actions.
        '<div class="pass-popup-cta">' +

          '<a class="pass-popup-cta-title" href="' +
            safePassUrl + '">' +
            'Explore Swyft Pass ' +
            '<span aria-hidden="true">↗</span>' +
          '</a>' +

          '<span class="pass-popup-cta-divider" ' +
            'aria-hidden="true"></span>' +

          '<a class="pass-popup-whatsapp-link" href="' +
            safeWhatsappUrl + '" target="_blank" ' +
            'rel="noopener noreferrer">' +
            '<span class="pass-popup-whatsapp-label">' +
              'CHAT WITH OUR TEAM' +
            '</span>' +
            '<span class="pass-popup-whatsapp-title">' +
              'Chat on WhatsApp ↗' +
            '</span>' +
          '</a>' +

          '<span class="pass-popup-cta-divider" ' +
            'aria-hidden="true"></span>' +

          '<a class="pass-popup-call-link" ' +
            'href="tel:+918866205765">' +
            '<span class="pass-popup-call-label">' +
              'CALL US DIRECTLY' +
            '</span>' +
            '+91 8866205765' +
          '</a>' +

        '</div>' +

        '<button class="pass-popup-later" type="button">' +
          'Maybe later' +
        '</button>' +

        '<div class="pass-popup-footnote">' +
          'ONE PASS. YEAR-ROUND POSSIBILITIES.' +
        '</div>' +

      '</div>';

    document.body.appendChild(dialog);

    function closePopup() {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        dialog.remove();
      }
    }

    dialog
      .querySelector('.pass-popup-close')
      .addEventListener('click', closePopup);

    dialog
      .querySelector('.pass-popup-later')
      .addEventListener('click', closePopup);

    // Close when the user clicks the backdrop.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        closePopup();
      }
    });

    dialog.addEventListener(
      'close',
      function () {
        dialog.remove();
      },
      { once: true }
    );

    try {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        // Compatibility fallback for older browsers.
        dialog.setAttribute('open', '');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
      }
    } catch (popupError) {
      // Fallback if showModal() is unavailable or fails.
      try {
        dialog.setAttribute('open', '');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
      } catch (fallbackError) {
        dialog.remove();
      }
    }
  }

  // Open immediately when the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      showPassPopup,
      { once: true }
    );
  } else {
    showPassPopup();
  }
})();
