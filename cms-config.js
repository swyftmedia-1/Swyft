
/*
 * Public CMS API endpoint.
 * Never put credentials or secrets in this file.
 */
(() => {
  'use strict';

  const hostname = String(window.location.hostname || '').toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1']);

  if (localHosts.has(hostname)) {
    window.SWYFT_CMS_API_URL = 'http://127.0.0.1:3000';
  } else {
    window.SWYFT_CMS_API_URL = 'https://cms-api.swyftmedia.in';
  }
})();
