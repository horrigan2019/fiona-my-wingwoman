/**
 * Fiona beta tester bypass.
 * ?beta=true or ?tester=vip, or passphrases WINGWOMAN2026 / FIONAVIP,
 * set is_beta_tester and unlock VIP with no Stripe checkout.
 */
(function (global) {
  var BETA_TESTER_KEY = 'is_beta_tester';
  var VIP_STATUS_KEY = 'fiona_vip_status';
  var VIP_META_KEY = 'fiona_vip_meta';
  var LEGACY_INVITE = 'wingwoman-beta';
  var PASSPHRASES = ['WINGWOMAN2026', 'FIONAVIP'];

  function readMeta() {
    try {
      return JSON.parse(localStorage.getItem(VIP_META_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeMeta(patch) {
    var next = {};
    var cur = readMeta();
    var key;
    for (key in cur) {
      if (Object.prototype.hasOwnProperty.call(cur, key)) next[key] = cur[key];
    }
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    try { localStorage.setItem(VIP_META_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function isBetaTester() {
    try {
      if (localStorage.getItem(BETA_TESTER_KEY) === 'true') return true;
    } catch (_) {}
    var meta = readMeta();
    return meta.is_beta_tester === true;
  }

  function unlockBetaTester() {
    var now = new Date().toISOString();
    try { localStorage.setItem(BETA_TESTER_KEY, 'true'); } catch (_) {}
    try { localStorage.setItem(VIP_STATUS_KEY, 'vip'); } catch (_) {}
    writeMeta({
      plan: 'beta',
      beta: true,
      is_beta_tester: true,
      converted: true,
      convertedAt: now,
      betaUnlockedAt: now
    });
    return true;
  }

  function queryGrantsBeta(params) {
    var beta = String(params.get('beta') || '').trim().toLowerCase();
    var tester = String(params.get('tester') || '').trim().toLowerCase();
    var invite = String(params.get('invite') || '').trim().toLowerCase();
    if (beta === 'true' || beta === '1') return true;
    if (tester === 'vip') return true;
    if (beta === LEGACY_INVITE || invite === LEGACY_INVITE) return true;
    return false;
  }

  function queryAttempted(params) {
    return !!(params.get('beta') || params.get('tester') || params.get('invite'));
  }

  function passphraseGrantsBeta(raw) {
    var norm = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '');
    return PASSPHRASES.indexOf(norm) !== -1;
  }

  global.FionaBeta = {
    BETA_TESTER_KEY: BETA_TESTER_KEY,
    isBetaTester: isBetaTester,
    unlockBetaTester: unlockBetaTester,
    queryGrantsBeta: queryGrantsBeta,
    queryAttempted: queryAttempted,
    passphraseGrantsBeta: passphraseGrantsBeta
  };
})(typeof window !== 'undefined' ? window : globalThis);
