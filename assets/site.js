(function () {
  'use strict';

  // Responsive navigation: support every header, keep ARIA state in sync, and close by Escape/outside click.
  document.querySelectorAll('.menu-toggle').forEach(function (toggle, index) {
    var header = toggle.closest('.site-header') || toggle.closest('header') || document;
    var controlledId = toggle.getAttribute('aria-controls');
    var nav = controlledId ? document.getElementById(controlledId) : null;
    if (!nav) nav = header.querySelector('.main-nav') || document.querySelector('.main-nav');
    if (!nav) return;

    if (!nav.id) nav.id = 'swyft-main-nav-' + (index + 1);
    toggle.setAttribute('aria-controls', nav.id);

    function setMenuOpen(open, returnFocus) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (!open && returnFocus) toggle.focus();
    }

    setMenuOpen(false, false);
    toggle.addEventListener('click', function () {
      setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setMenuOpen(false, false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false, true);
      }
    });
    document.addEventListener('click', function (event) {
      if (toggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) {
        setMenuOpen(false, false);
      }
    });
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 981px)').matches) setMenuOpen(false, false);
    }, { passive: true });
  });

  // Reveal page sections as they enter the viewport.
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
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  }

  // Keep copyright dates current.
  document.querySelectorAll('[data-current-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Existing contact form mailto behavior.
  var mailForm = document.querySelector('[data-mailto-form]');
  if (mailForm) {
    mailForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!mailForm.reportValidity()) return;
      var data = new FormData(mailForm);
      var lines = [
        'New website enquiry', '',
        'Name: ' + (data.get('name') || ''),
        'Email: ' + (data.get('email') || ''),
        'Company: ' + (data.get('company') || ''),
        'Service: ' + (data.get('service') || ''), '',
        'Project details:', (data.get('message') || '')
      ];
      var subject = encodeURIComponent('New Swyft Media website enquiry');
      var body = encodeURIComponent(lines.join('\n'));
      window.location.href = 'mailto:info@swyftmedia.in?subject=' + subject + '&body=' + body;
    });
  }

  // A compact SWYFT ONE invitation, shown at most once per tab session.
  // If a visitor opens Swyft Pass directly, do not show a redundant invitation.
  var sessionKey = 'swyftPassPopupSeen';
  var pathname = window.location.pathname.toLowerCase();
  var isPassPage = /(?:^|\/)swyft-pass\.html$/.test(pathname);
  var popupAlreadySeen = false;
  // Do not allow the promotional dialog to interrupt mobile-menu use or other first-page interaction.
  var popupInteractionDetected = false;
  ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(function (eventName) {
    window.addEventListener(eventName, function () { popupInteractionDetected = true; }, { once: true, passive: true });
  });
  try {
    popupAlreadySeen = window.sessionStorage.getItem(sessionKey) === '1';
  } catch (storageError) {
    // If storage is blocked, the popup still works for this page load.
  }

  if (!popupAlreadySeen) {
    try { window.sessionStorage.setItem(sessionKey, '1'); } catch (storageError) {}
    if (!isPassPage) {
      window.setTimeout(function () {
        if (!document.body || document.querySelector('dialog.pass-popup') || popupInteractionDetected) return;
        if (document.querySelector('.menu-toggle[aria-expanded="true"]')) return;

        var navPassLink = document.querySelector('.main-nav a[href*="swyft-pass.html"]');
        var passUrl = navPassLink ? navPassLink.href : new URL(
          pathname.indexOf('/blog/') !== -1 ? '../swyft-pass.html' : 'swyft-pass.html',
          window.location.href
        ).href;

        var dialog = document.createElement('dialog');
        dialog.className = 'pass-popup';
        dialog.setAttribute('aria-labelledby', 'pass-popup-title');
        dialog.innerHTML =
          '<div class="pass-popup-card">' +
            '<button class="pass-popup-close" type="button" aria-label="Close popup">&times;</button>' +
            '<div class="pass-popup-eyebrow"><span class="pass-popup-dot" aria-hidden="true"></span> SWYFT ONE · BUSINESS PASS</div>' +
            '<h2 id="pass-popup-title">Your creative team, on one pass.</h2>' +
            '<p>Discover a connected creative wallet for branding, marketing, content, digital and PR—built to keep your brand moving all year.</p>' +
            '<a class="pass-popup-cta" href="' + passUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" autofocus>Explore Swyft Pass <span aria-hidden="true">↗</span></a>' +
            '<button class="pass-popup-later" type="button">Maybe later</button>' +
            '<div class="pass-popup-footnote">ONE PASS. YEAR-ROUND POSSIBILITIES.</div>' +
          '</div>';

        document.body.appendChild(dialog);
        function closePopup() {
          if (dialog.open) dialog.close();
        }
        dialog.querySelector('.pass-popup-close').addEventListener('click', closePopup);
        dialog.querySelector('.pass-popup-later').addEventListener('click', closePopup);
        dialog.addEventListener('click', function (event) {
          if (event.target === dialog) closePopup();
        });
        dialog.addEventListener('close', function () {
          dialog.remove();
        }, { once: true });

        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          // Compatibility fallback for browsers without native dialog support.
          dialog.setAttribute('open', '');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-modal', 'true');
        }
      }, 4500);
    }
  }
})();
