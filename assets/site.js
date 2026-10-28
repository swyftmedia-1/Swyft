
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
        'Email: ' + (data.get('email') || ''),
        'Company: ' + (data.get('company') || ''),
        'Service: ' + (data.get('service') || ''),
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
  // Show once per tab session after successfully opening.
  var sessionKey = 'swyftPassPopupSeen';
  var pathname = window.location.pathname.toLowerCase();
  var hostname = window.location.hostname.toLowerCase();

  // Show only on the SWYFT Media homepage.
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

  if (
    !isSwyftMediaDomain ||
    !isHomePage ||
    isPassPage
  ) {
    return;
  }

  // Check whether the popup has already appeared this tab session.
  var popupAlreadySeen = false;

  try {
    popupAlreadySeen =
      window.sessionStorage.getItem(sessionKey) === '1';
  } catch (storageError) {
    // Continue if session storage is unavailable.
  }

  if (popupAlreadySeen) return;

  // Avoid duplicate popup dialogs.
  if (document.querySelector('dialog.pass-popup')) return;

  // Show immediately when the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      function () {
        showPassPopup();
      },
      { once: true }
    );
  } else {
    showPassPopup();
  }

  function showPassPopup() {
    if (!document.body) return;

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

    // Find the Swyft Pass destination.
    var navPassLink = document.querySelector(
      '.main-nav a[href*="swyft-pass.html"]'
    );

    var passUrl;

    if (navPassLink) {
      passUrl = navPassLink.href;
    } else {
      passUrl = new URL(
        '/swyft-pass.html',
        window.location.origin
      ).href;
    }

    var dialog = document.createElement('dialog');

    dialog.className = 'pass-popup';
    dialog.setAttribute(
      'aria-labelledby',
      'pass-popup-title'
    );

    var safePassUrl = passUrl
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Popup HTML content.
    dialog.innerHTML =
      '<div class="pass-popup-card">' +

        '<button class="pass-popup-close" type="button" ' +
          'aria-label="Close popup">&times;</button>' +

        '<div class="pass-popup-eyebrow">' +
          '<span class="pass-popup-dot" aria-hidden="true"></span>' +
          ' SWYFT ONE · BUSINESS PASS' +
        '</div>' +

        '<h2 id="pass-popup-title">' +
         'Your Creative Team <br>One Pass.' +
         '</h2>' +

        '<p>' +
          'Discover a connected creative wallet for branding, ' +
          'marketing, social media and PR, built to keep ' +
          'your brand moving all year.' +
        '</p>' +

        // One visual box containing two independent links.
        '<div class="pass-popup-cta">' +

          '<a class="pass-popup-cta-title" href="' +
            safePassUrl + '">' +
            'Explore Swyft Pass ' +
            '<span aria-hidden="true">↗</span>' +
          '</a>' +

          '<span class="pass-popup-cta-divider" ' +
            'aria-hidden="true"></span>' +

          '<a class="pass-popup-call-link" ' +
            'href="tel:+918866205765">' +
            '<span class="pass-popup-call-label">' +
              'Call us directly' +
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

    var popupOpened = false;

    function closePopup() {
      if (
        typeof dialog.close === 'function' &&
        dialog.open
      ) {
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
        popupOpened = dialog.open;
      } else {
        // Compatibility fallback for older browsers.
        dialog.setAttribute('open', '');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        popupOpened = true;
      }
    } catch (popupError) {
      // Try the compatibility fallback if showModal fails.
      try {
        dialog.setAttribute('open', '');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        popupOpened = true;
      } catch (fallbackError) {
        dialog.remove();
        return;
      }
    }

    // Mark as seen only after opening successfully.
    if (popupOpened) {
      try {
        window.sessionStorage.setItem(sessionKey, '1');
      } catch (storageError) {
        // Popup still works if session storage is unavailable.
      }
    } else {
      dialog.remove();
    }
  }
})();
