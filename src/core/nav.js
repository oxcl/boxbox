// Pure navigation policy. See DESIGN.md §2.
import { isWebUrl } from './services.js';

const AUTH_RE = /(^|[?&])(redirect_uri|client_id|response_type|SAMLRequest|SAMLResponse|oauth_token|code_challenge|openid\.mode|wreply|wtrealm)=|\/(oauth2?|openid|authorize|saml2?|sso|signin\/oauth|o\/oauth2|login\/oauth)(\/|\?|$)/i;
export const looksLikeAuthFlow = (url) => AUTH_RE.test(url);

export const GESTURE_WINDOW_MS = 1500;

/**
 * @param {object} i
 * @param {string} i.url               target of the main-frame navigation
 * @param {string|null} i.targetService service id of url
 * @param {{accountId:string|null, home:string|null, flow:string|null}} i.tab
 * @param {boolean} i.userInitiated
 * @param {object} i.settings          {defaultMode, modes}
 * @param {Object} i.accounts          id -> account
 * @param {Object} i.lastAccount       serviceId -> accountId|null
 * @returns {{type:'stay', flow?:string|null, home?:string|null}
 *          |{type:'move', accountId:string|null, home:string, why:string}
 *          |{type:'ask', serviceId:string}}
 */
export function decide(i) {
  const { url, targetService: T, tab, userInitiated, settings, accounts, lastAccount } = i;
  if (!isWebUrl(url) || !T) return { type: 'stay' };

  const authish = looksLikeAuthFlow(url);

  if (tab.accountId) {
    if (T === tab.home) return { type: 'stay', flow: null };
    if (T === tab.flow) return { type: 'stay' };
    if (!userInitiated || authish) return { type: 'stay', flow: T };
    return enter(T, 'leave');
  }

  // default session
  if (T === tab.home) return { type: 'stay' };
  if (!userInitiated || authish) return { type: 'stay', home: T };
  return enter(T, 'enter');

  function enter(service, why) {
    const mode = settings.modes?.[service] || settings.defaultMode || 'default';
    const svcAccounts = Object.values(accounts).filter((a) => a.serviceId === service);
    if (mode === 'remember') {
      const last = lastAccount?.[service];
      if (last && accounts[last] && accounts[last].serviceId === service) return { type: 'move', accountId: last, home: service, why: why + ':remember' };
      return { type: 'move', accountId: null, home: service, why: why + ':remember-default' };
    }
    if (mode === 'ask' && svcAccounts.length) return { type: 'ask', serviceId: service };
    return { type: 'move', accountId: null, home: service, why: why + ':default' };
  }
}
