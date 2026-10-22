(() => {
  // src/core/ext.js
  var TARGET = true ? "chrome-mv3" : "firefox";
  var IS_MV2 = TARGET === "chrome-mv2";
  var g = globalThis;
  var base = typeof g.browser !== "undefined" && g.browser.runtime ? g.browser : g.chrome;
  var SYNC = /* @__PURE__ */ new Set(["getURL", "getManifest", "connect", "connectNative", "getViews", "getBackgroundPage_sync"]);
  function promisified(obj) {
    return new Proxy(obj, {
      get(t, k) {
        const v = t[k];
        if (typeof k !== "string") return v;
        if (typeof v === "function" && SYNC.has(k)) return v.bind(t);
        if (typeof v === "function") {
          return (...args) => {
            if (typeof args[args.length - 1] === "function") return v.apply(t, args);
            return new Promise((resolve, reject) => {
              try {
                v.call(t, ...args, (res) => {
                  const e = g.chrome.runtime.lastError;
                  if (e) reject(new Error(e.message));
                  else resolve(res);
                });
              } catch (e) {
                reject(e);
              }
            });
          };
        }
        if (v && typeof v === "object" && !/^on[A-Z]/.test(k)) return promisified(v);
        return v;
      }
    });
  }
  var ext = IS_MV2 ? promisified(base) : base;
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var uid = (n = 10) => {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return [...a].map((b) => (b % 36).toString(36)).join("");
  };

  // src/core/model.js
  var COLORS = [
    { key: "blue", hex: "#3b82f6", ff: "blue", chrome: "blue" },
    { key: "indigo", hex: "#6366f1", ff: "purple", chrome: "purple" },
    { key: "violet", hex: "#a855f7", ff: "purple", chrome: "purple" },
    { key: "pink", hex: "#ec4899", ff: "pink", chrome: "pink" },
    { key: "red", hex: "#ef4444", ff: "red", chrome: "red" },
    { key: "orange", hex: "#f97316", ff: "orange", chrome: "orange" },
    { key: "amber", hex: "#f59e0b", ff: "yellow", chrome: "yellow" },
    { key: "lime", hex: "#84cc16", ff: "green", chrome: "green" },
    { key: "green", hex: "#22c55e", ff: "green", chrome: "green" },
    { key: "teal", hex: "#14b8a6", ff: "turquoise", chrome: "cyan" },
    { key: "cyan", hex: "#06b6d4", ff: "turquoise", chrome: "cyan" },
    { key: "slate", hex: "#64748b", ff: "toolbar", chrome: "grey" }
  ];
  var CHROME_GROUP_COLORS = { grey: "#5f6368", blue: "#1a73e8", red: "#d93025", yellow: "#f9ab00", green: "#188038", pink: "#d01884", purple: "#9334e6", cyan: "#007b83", orange: "#e8710a" };
  var ICONS = ["user", "briefcase", "home", "heart", "star", "bolt", "cart", "game", "code", "book", "cloud", "shield", "gift", "camera", "music", "flask"];
  var DEFAULT_STATE = () => ({
    v: 1,
    settings: { defaultMode: "default", modes: {}, theme: "auto", border: true, badge: true, tabGroups: true },
    accounts: {},
    // id -> {id, serviceId, name, color, icon, proxy, createdAt, cookieStoreId?}
    user: { services: {}, domainMap: {}, names: {} },
    lastAccount: {},
    // serviceId -> accountId | null
    origins: {}
    // accountId -> [origin]   (Chrome: where the account has stored data)
  });
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function nearest(hex, table) {
    const [r, g2, b] = hexToRgb(hex);
    let best = null, bd = Infinity;
    for (const [k, v] of Object.entries(table)) {
      const [r2, g22, b2] = hexToRgb(v);
      const d = (r - r2) ** 2 + (g2 - g22) ** 2 + (b - b2) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
  var MODES = ["default", "remember", "ask"];
  var PROXY_TYPES = ["http", "https", "socks5"];
  function sanitizeProxy(p) {
    if (!p || !p.host) return null;
    return {
      type: PROXY_TYPES.includes(p.type) ? p.type : "http",
      host: String(p.host).trim(),
      port: Number(p.port) || (p.type === "socks5" ? 1080 : 8080),
      username: p.username ? String(p.username) : "",
      password: p.password ? String(p.password) : ""
    };
  }

  // src/core/store.js
  var KEY = "box";
  var Store = class {
    constructor() {
      this.state = DEFAULT_STATE();
      this.listeners = /* @__PURE__ */ new Set();
      this.ready = null;
      this._chain = Promise.resolve();
    }
    load() {
      if (!this.ready) this.ready = (async () => {
        const got = await ext.storage.local.get(KEY);
        const saved = got[KEY];
        const d = DEFAULT_STATE();
        this.state = saved ? { ...d, ...saved, settings: { ...d.settings, ...saved.settings }, user: { ...d.user, ...saved.user } } : d;
        return this.state;
      })();
      return this.ready;
    }
    get() {
      return this.state;
    }
    /** Serialised read-modify-write. The mutator may mutate the draft in place or return a replacement. */
    update(mutator) {
      const run = async () => {
        await this.load();
        const draft = this.state;
        const ret = await mutator(draft);
        if (ret && ret !== draft) this.state = ret;
        await ext.storage.local.set({ [KEY]: this.state });
        for (const l of this.listeners) {
          try {
            l(this.state);
          } catch (e) {
            console.error(e);
          }
        }
        return this.state;
      };
      const p = this._chain.catch(() => {
      }).then(run);
      this._chain = p.catch(() => {
      });
      return p;
    }
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
  };

  // node_modules/tldts-core/dist/es6/src/domain.js
  function shareSameDomainSuffix(hostname, vhost) {
    if (hostname.endsWith(vhost)) {
      return hostname.length === vhost.length || hostname[hostname.length - vhost.length - 1] === ".";
    }
    return false;
  }
  function extractDomainWithSuffix(hostname, publicSuffix) {
    const publicSuffixIndex = hostname.length - publicSuffix.length - 2;
    const lastDotBeforeSuffixIndex = hostname.lastIndexOf(".", publicSuffixIndex);
    if (lastDotBeforeSuffixIndex === -1) {
      return hostname;
    }
    return hostname.slice(lastDotBeforeSuffixIndex + 1);
  }
  function getDomain(suffix, hostname, options) {
    if (options.validHosts !== null) {
      const validHosts = options.validHosts;
      for (const vhost of validHosts) {
        if (
          /*@__INLINE__*/
          shareSameDomainSuffix(hostname, vhost)
        ) {
          return vhost;
        }
      }
    }
    let numberOfLeadingDots = 0;
    if (hostname.startsWith(".")) {
      while (numberOfLeadingDots < hostname.length && hostname[numberOfLeadingDots] === ".") {
        numberOfLeadingDots += 1;
      }
    }
    if (suffix.length === hostname.length - numberOfLeadingDots) {
      return null;
    }
    return (
      /*@__INLINE__*/
      extractDomainWithSuffix(hostname, suffix)
    );
  }

  // node_modules/tldts-core/dist/es6/src/domain-without-suffix.js
  function getDomainWithoutSuffix(domain, suffix) {
    return domain.slice(0, -suffix.length - 1);
  }

  // node_modules/tldts-core/dist/es6/src/extract-hostname.js
  var CONTROL_CHARS = /[\t\n\r]/g;
  var extractedHostnameValidated = false;
  function isValidHostnameChar(code) {
    return code >= 97 && code <= 122 || // a-z
    code >= 48 && code <= 57 || // 0-9
    code > 127 || // non-ASCII (accepted, not punycode-checked)
    code >= 65 && code <= 90 || // A-Z (becomes valid once lowercased)
    code === 45 || // '-'
    code === 95;
  }
  function getSpecialScheme(url, schemeStart, colonIndex) {
    const length = colonIndex - schemeStart;
    const c0 = url.charCodeAt(schemeStart) | 32;
    if (length === 2) {
      return c0 === 119 && (url.charCodeAt(schemeStart + 1) | 32) === 115 ? 1 : 0;
    } else if (length === 3) {
      const c1 = url.charCodeAt(schemeStart + 1) | 32;
      const c2 = url.charCodeAt(schemeStart + 2) | 32;
      if (c0 === 119 && c1 === 115 && c2 === 115)
        return 1;
      if (c0 === 102 && c1 === 116 && c2 === 112)
        return 1;
      return 0;
    } else if (length === 4) {
      const c1 = url.charCodeAt(schemeStart + 1) | 32;
      const c2 = url.charCodeAt(schemeStart + 2) | 32;
      const c3 = url.charCodeAt(schemeStart + 3) | 32;
      if (c0 === 104 && c1 === 116 && c2 === 116 && c3 === 112)
        return 1;
      if (c0 === 102 && c1 === 105 && c2 === 108 && c3 === 101)
        return 2;
      return 0;
    } else if (length === 5) {
      return c0 === 104 && (url.charCodeAt(schemeStart + 1) | 32) === 116 && (url.charCodeAt(schemeStart + 2) | 32) === 116 && (url.charCodeAt(schemeStart + 3) | 32) === 112 && (url.charCodeAt(schemeStart + 4) | 32) === 115 ? 1 : 0;
    }
    return 0;
  }
  function extractHostname(url, urlIsValidHostname, validate = false) {
    let start = 0;
    let end = url.length;
    let hasUpper = false;
    let isSpecial = false;
    extractedHostnameValidated = false;
    if (!urlIsValidHostname) {
      if (url.startsWith("data:")) {
        return null;
      }
      while (start < url.length && url.charCodeAt(start) <= 32) {
        start += 1;
      }
      while (end > start + 1 && url.charCodeAt(end - 1) <= 32) {
        end -= 1;
      }
      if (url.charCodeAt(start) === 47 && url.charCodeAt(start + 1) === 47) {
        start += 2;
      } else {
        const indexOfProtocol = url.indexOf(":/", start);
        if (indexOfProtocol !== -1) {
          const special = getSpecialScheme(url, start, indexOfProtocol);
          if (special === 1) {
            isSpecial = true;
            start = indexOfProtocol + 2;
            while (url.charCodeAt(start) === 47 || url.charCodeAt(start) === 92) {
              start += 1;
            }
          } else if (special === 2) {
            isSpecial = true;
            start = indexOfProtocol + 1;
            let slashes = 0;
            while ((url.charCodeAt(start) === 47 || url.charCodeAt(start) === 92) && slashes < 2) {
              start += 1;
              slashes += 1;
            }
            if (slashes < 2) {
              return null;
            }
          } else {
            for (let i = start; i < indexOfProtocol; i += 1) {
              const code = url.charCodeAt(i) | 32;
              if (!(code >= 97 && code <= 122 || // [a, z]
              code >= 48 && code <= 57 || // [0, 9]
              code === 46 || // '.'
              code === 45 || // '-'
              code === 43)) {
                const raw = url.charCodeAt(i);
                if (raw === 9 || raw === 10 || raw === 13) {
                  return extractHostname(url.replace(CONTROL_CHARS, ""), urlIsValidHostname, validate);
                }
                return null;
              }
            }
            if (url.charCodeAt(indexOfProtocol + 2) === 47) {
              start = indexOfProtocol + 3;
            } else {
              return null;
            }
          }
        } else if (url.charCodeAt(start) !== 91) {
          let indexOfColon = -1;
          for (let i = start; i < end; i += 1) {
            const code = url.charCodeAt(i);
            if (code === 9 || code === 10 || code === 13) {
              return extractHostname(url.replace(CONTROL_CHARS, ""), urlIsValidHostname, validate);
            }
            if (code === 58) {
              indexOfColon = i;
              break;
            }
            if (code === 47 || code === 92 || code === 63 || code === 35) {
              break;
            }
          }
          if (indexOfColon !== -1) {
            let hasIdentifier = false;
            for (let i = indexOfColon + 1; i < end; i += 1) {
              const code = url.charCodeAt(i);
              if (code === 47 || code === 92 || code === 63 || code === 35) {
                break;
              }
              if (code === 64) {
                hasIdentifier = true;
                break;
              }
            }
            if (!hasIdentifier) {
              let allDigits = true;
              let i = indexOfColon + 1;
              for (; i < end; i += 1) {
                const code = url.charCodeAt(i);
                if (code === 47 || code === 92 || code === 63 || code === 35) {
                  break;
                }
                if (code < 48 || code > 57) {
                  allDigits = false;
                  break;
                }
              }
              if (i === indexOfColon + 1) {
                allDigits = false;
              }
              if (!allDigits) {
                const special = getSpecialScheme(url, start, indexOfColon);
                if (special === 0) {
                  let isBareIpv6 = false;
                  for (let j = indexOfColon + 1; j < end; j += 1) {
                    const code = url.charCodeAt(j);
                    if (code === 47 || code === 92 || code === 63 || code === 35) {
                      break;
                    }
                    if (code === 58) {
                      isBareIpv6 = true;
                      break;
                    }
                  }
                  if (!isBareIpv6) {
                    return null;
                  }
                } else {
                  isSpecial = true;
                  start = indexOfColon + 1;
                  if (special === 2) {
                    let slashes = 0;
                    while ((url.charCodeAt(start) === 47 || url.charCodeAt(start) === 92) && slashes < 2) {
                      start += 1;
                      slashes += 1;
                    }
                    if (slashes < 2) {
                      return null;
                    }
                  } else {
                    while (url.charCodeAt(start) === 47 || url.charCodeAt(start) === 92) {
                      start += 1;
                    }
                  }
                }
              }
            }
          }
        }
      }
      let indexOfIdentifier = -1;
      let indexOfClosingBracket = -1;
      let indexOfPort = -1;
      let indexOfFirstColon = -1;
      let hasControl = false;
      let vValid = validate;
      let vLastDot = start - 1;
      let vLastCode = -1;
      if (validate && start < end) {
        const c0 = url.charCodeAt(start);
        if (
          // Keep these parens: they scope /*@__INLINE__*/ for terser.
          // prettier-ignore
          !/*@__INLINE__*/
          (isValidHostnameChar(c0) || c0 === 46 || c0 === 95) || c0 === 45
        ) {
          vValid = false;
        }
      }
      for (let i = start; i < end; i += 1) {
        const code = url.charCodeAt(i);
        if (code < 64) {
          if (code === 47 || code === 35 || code === 63) {
            end = i;
            break;
          } else if (code === 58) {
            if (indexOfFirstColon === -1) {
              indexOfFirstColon = i;
            }
            indexOfPort = i;
          } else if (code === 9 || code === 10 || code === 13) {
            hasControl = true;
          } else if (validate) {
            if (code === 46) {
              if (i - vLastDot > 64 || vLastCode === 46 || vLastCode === 45) {
                vValid = false;
              }
              vLastDot = i;
            } else if (code < 48 || code > 57) {
              if (code !== 45 || vLastCode === 46) {
                vValid = false;
              }
            }
          }
        } else if (isSpecial && code === 92) {
          end = i;
          break;
        } else if (code === 64) {
          indexOfIdentifier = i;
          indexOfFirstColon = -1;
        } else if (code === 93) {
          indexOfClosingBracket = i;
        } else if (code >= 65 && code <= 90) {
          hasUpper = true;
        } else if (validate && !/*@__INLINE__*/
        isValidHostnameChar(code)) {
          vValid = false;
        }
        if (validate) {
          vLastCode = code;
        }
      }
      if (hasControl) {
        return extractHostname(url.replace(CONTROL_CHARS, ""), urlIsValidHostname, validate);
      }
      if (indexOfIdentifier !== -1 && indexOfIdentifier >= start && indexOfIdentifier < end) {
        start = indexOfIdentifier + 1;
      }
      if (url.charCodeAt(start) === 91) {
        if (indexOfClosingBracket !== -1) {
          return url.slice(start + 1, indexOfClosingBracket).toLowerCase();
        }
        return null;
      } else if (indexOfPort !== -1 && indexOfPort > start && indexOfPort < end && // A host:port has exactly one ':' in the host (so its first ':' is its
      // last); a bare, unbracketed IPv6 literal ("2a01:e35::1") has >= 2, so
      // its first ':' precedes the last. Only the former has a ':port' to trim.
      indexOfFirstColon === indexOfPort) {
        end = indexOfPort;
      }
      if (start >= end) {
        return null;
      }
      if (validate && vValid && indexOfIdentifier === -1 && indexOfPort === -1 && indexOfClosingBracket === -1 && url.charCodeAt(end - 1) !== 46 && end - start <= 255 && // total length
      end - vLastDot - 1 <= 63 && // last label length
      vLastCode !== 45) {
        extractedHostnameValidated = true;
      }
    }
    while (end > start + 1 && url.charCodeAt(end - 1) === 46) {
      end -= 1;
    }
    const hostname = start !== 0 || end !== url.length ? url.slice(start, end) : url;
    if (hasUpper) {
      return hostname.toLowerCase();
    }
    return hostname;
  }

  // node_modules/tldts-core/dist/es6/src/is-ip.js
  function isProbablyIpv4(hostname) {
    if (hostname.length < 7) {
      return false;
    }
    if (hostname.length > 15) {
      return false;
    }
    let numberOfDots = 0;
    for (let i = 0; i < hostname.length; i += 1) {
      const code = hostname.charCodeAt(i);
      if (code === 46) {
        numberOfDots += 1;
      } else if (code < 48 || code > 57) {
        return false;
      }
    }
    return numberOfDots === 3 && hostname.charCodeAt(0) !== 46 && hostname.charCodeAt(hostname.length - 1) !== 46;
  }
  function isProbablyIpv6(hostname) {
    if (hostname.length < 3) {
      return false;
    }
    let start = hostname.startsWith("[") ? 1 : 0;
    let end = hostname.length;
    if (hostname[end - 1] === "]") {
      end -= 1;
    }
    if (end - start > 39) {
      return false;
    }
    let hasColon = false;
    for (; start < end; start += 1) {
      const code = hostname.charCodeAt(start);
      if (code === 58) {
        hasColon = true;
      } else if (!(code >= 48 && code <= 57 || // 0-9
      code >= 97 && code <= 102 || // a-f
      code >= 65 && code <= 70)) {
        return false;
      }
    }
    return hasColon;
  }
  function isIp(hostname) {
    return isProbablyIpv6(hostname) || isProbablyIpv4(hostname);
  }

  // node_modules/tldts-core/dist/es6/src/is-special-use.js
  var SPECIAL_USE_DOMAINS = [
    "test",
    // RFC 6761
    "localhost",
    // RFC 6761
    "invalid",
    // RFC 6761
    "example",
    // RFC 6761
    "example.com",
    // RFC 6761
    "example.net",
    // RFC 6761
    "example.org",
    // RFC 6761
    "local",
    // RFC 6762 (mDNS)
    "onion",
    // RFC 7686 (Tor)
    "alt",
    // RFC 9476
    "home.arpa",
    // RFC 8375
    "ipv4only.arpa",
    // RFC 8880
    "resolver.arpa",
    // RFC 9462
    "service.arpa",
    // RFC 9665
    "6tisch.arpa",
    // RFC 9031
    "eap.arpa"
    // RFC 9965
  ];
  function isSpecialUse(hostname) {
    for (const name of SPECIAL_USE_DOMAINS) {
      if (hostname.endsWith(name) && (hostname.length === name.length || hostname.charCodeAt(hostname.length - name.length - 1) === 46)) {
        return true;
      }
    }
    return false;
  }

  // node_modules/tldts-core/dist/es6/src/is-valid.js
  function isValidAscii(code) {
    return code >= 97 && code <= 122 || code >= 48 && code <= 57 || code > 127;
  }
  function is_valid_default(hostname) {
    if (hostname.length > 255) {
      return false;
    }
    if (hostname.length === 0) {
      return false;
    }
    if (
      /*@__INLINE__*/
      !isValidAscii(hostname.charCodeAt(0)) && hostname.charCodeAt(0) !== 46 && // '.' (dot)
      hostname.charCodeAt(0) !== 95
    ) {
      return false;
    }
    let lastDotIndex = -1;
    let lastCharCode = -1;
    const len = hostname.length;
    for (let i = 0; i < len; i += 1) {
      const code = hostname.charCodeAt(i);
      if (code === 46) {
        if (
          // Check that previous label is < 63 bytes long (64 = 63 + '.')
          i - lastDotIndex > 64 || // Check that previous character was not already a '.'
          lastCharCode === 46 || // Check that the previous label does not end with '-' (RFC 1035 §2.3.1 LDH).
          // '_' is intentionally NOT restricted: DNS allows any octet (RFC 2181 §11) and
          // WHATWG URL does not treat '_' as a forbidden host code point.
          lastCharCode === 45
        ) {
          return false;
        }
        lastDotIndex = i;
      } else if (
        // A forbidden character in the label...
        // Keep these parens: they scope /*@__INLINE__*/ for terser.
        // prettier-ignore
        !/*@__INLINE__*/
        (isValidAscii(code) || code === 45 || code === 95) || // ...or a '-' starting a label (the byte right after a '.'). A label must
        // not begin with a hyphen (RFC 1034 §3.5 / RFC 1035 §2.3.1 LDH, as amended
        // by RFC 1123 §2.1; cf. UTS #46 CheckHyphens). The first label is covered by
        // the leading-character guard above; mirrors the trailing-'-' rule below.
        code === 45 && lastCharCode === 46
      ) {
        return false;
      }
      lastCharCode = code;
    }
    return (
      // Check that last label is shorter than 63 chars
      len - lastDotIndex - 1 <= 63 && // Check that the last character is an allowed trailing label character.
      // Since we already checked that the char is a valid hostname character,
      // we only need to check that it's different from '-'.
      lastCharCode !== 45
    );
  }

  // node_modules/tldts-core/dist/es6/src/options.js
  function setDefaultsImpl({ allowIcannDomains = true, allowPrivateDomains = false, detectIp = true, detectSpecialUse = false, extractHostname: extractHostname2 = true, mixedInputs = true, validHosts = null, validateHostname = true }) {
    return {
      allowIcannDomains,
      allowPrivateDomains,
      detectIp,
      detectSpecialUse,
      extractHostname: extractHostname2,
      mixedInputs,
      validHosts,
      validateHostname
    };
  }
  var DEFAULT_OPTIONS = (
    /*@__INLINE__*/
    setDefaultsImpl({})
  );
  function setDefaults(options) {
    if (options === void 0) {
      return DEFAULT_OPTIONS;
    }
    return (
      /*@__INLINE__*/
      setDefaultsImpl(options)
    );
  }

  // node_modules/tldts-core/dist/es6/src/subdomain.js
  function getSubdomain(hostname, domain) {
    if (domain.length === hostname.length) {
      return "";
    }
    return hostname.slice(0, -domain.length - 1);
  }

  // node_modules/tldts-core/dist/es6/src/factory.js
  function getEmptyResult() {
    return {
      domain: null,
      domainWithoutSuffix: null,
      hostname: null,
      isIcann: null,
      isIp: null,
      isPrivate: null,
      isSpecialUse: null,
      publicSuffix: null,
      subdomain: null
    };
  }
  function resetResult(result) {
    result.domain = null;
    result.domainWithoutSuffix = null;
    result.hostname = null;
    result.isIcann = null;
    result.isIp = null;
    result.isPrivate = null;
    result.isSpecialUse = null;
    result.publicSuffix = null;
    result.subdomain = null;
  }
  function parseImpl(url, step, suffixLookup2, partialOptions, result) {
    const options = (
      /*@__INLINE__*/
      setDefaults(partialOptions)
    );
    if (typeof url !== "string") {
      return result;
    }
    let urlIsValid = false;
    if (!options.extractHostname) {
      result.hostname = url;
    } else if (options.mixedInputs) {
      urlIsValid = is_valid_default(url);
      result.hostname = extractHostname(url, urlIsValid, options.validateHostname);
    } else {
      result.hostname = extractHostname(url, false, options.validateHostname);
    }
    if (options.detectIp && result.hostname !== null) {
      result.isIp = isIp(result.hostname);
      if (result.isIp) {
        return result;
      }
    }
    if (options.validateHostname && options.extractHostname && result.hostname !== null && // Skip the re-scan when `url` was already validated and extractHostname
    // returned it unchanged (same reference => identical string, still valid).
    !(urlIsValid && result.hostname === url) && // Skip the re-scan when extractHostname already validated the host inline
    // (a confirmed-valid simple authority — see extract-hostname.ts).
    !extractedHostnameValidated && !is_valid_default(result.hostname)) {
      result.hostname = null;
      return result;
    }
    if (step === 0 || result.hostname === null) {
      return result;
    }
    if (step === 5 && options.detectSpecialUse) {
      result.isSpecialUse = isSpecialUse(result.hostname);
    }
    suffixLookup2(result.hostname, options, result);
    if (step === 2 || result.publicSuffix === null) {
      return result;
    }
    result.domain = getDomain(result.publicSuffix, result.hostname, options);
    if (step === 3 || result.domain === null) {
      return result;
    }
    result.subdomain = getSubdomain(result.hostname, result.domain);
    if (step === 4) {
      return result;
    }
    result.domainWithoutSuffix = getDomainWithoutSuffix(result.domain, result.publicSuffix);
    return result;
  }

  // node_modules/tldts-core/dist/es6/src/lookup/fast-path.js
  function fast_path_default(hostname, options, out) {
    if (!options.allowPrivateDomains && hostname.length > 3) {
      const last = hostname.length - 1;
      const c3 = hostname.charCodeAt(last);
      const c2 = hostname.charCodeAt(last - 1);
      const c1 = hostname.charCodeAt(last - 2);
      const c0 = hostname.charCodeAt(last - 3);
      if (c3 === 109 && c2 === 111 && c1 === 99 && c0 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "com";
        return true;
      } else if (c3 === 103 && c2 === 114 && c1 === 111 && c0 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "org";
        return true;
      } else if (c3 === 117 && c2 === 100 && c1 === 101 && c0 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "edu";
        return true;
      } else if (c3 === 118 && c2 === 111 && c1 === 103 && c0 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "gov";
        return true;
      } else if (c3 === 116 && c2 === 101 && c1 === 110 && c0 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "net";
        return true;
      } else if (c3 === 101 && c2 === 100 && c1 === 46) {
        out.isIcann = true;
        out.isPrivate = false;
        out.publicSuffix = "de";
        return true;
      }
    }
    return false;
  }

  // node_modules/tldts/dist/es6/src/data/trie.js
  var nodeFlags = /* @__PURE__ */ new Uint8Array([1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 0, 2, 0, 0, 1, 0, 0, 2, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 2, 2, 0, 0, 0, 2, 0, 1, 1, 0, 2, 0, 2, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 0, 2, 2, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 2, 2, 0, 2, 2, 2, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 2, 2, 0, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  var edgeStart = /* @__PURE__ */ new Uint16Array([0, 0, 0, 10, 11, 18, 106, 111, 117, 124, 130, 136, 145, 146, 147, 148, 149, 150, 151, 153, 154, 155, 157, 159, 228, 241, 243, 244, 245, 260, 267, 268, 271, 272, 273, 276, 278, 297, 298, 300, 309, 314, 331, 332, 335, 336, 338, 340, 376, 377, 379, 382, 383, 387, 389, 393, 396, 428, 431, 444, 445, 453, 454, 456, 466, 480, 481, 482, 483, 492, 493, 530, 535, 551, 571, 577, 619, 620, 647, 674, 675, 823, 829, 832, 833, 834, 839, 844, 853, 875, 876, 877, 878, 879, 880, 881, 899, 901, 902, 905, 907, 908, 910, 912, 927, 942, 947, 948, 950, 951, 952, 953, 954, 956, 959, 964, 965, 966, 968, 969, 972, 975, 976, 977, 990, 992, 1004, 1015, 1023, 1025, 1065, 1068, 1072, 1073, 1075, 1078, 1089, 1091, 1101, 1103, 1109, 1111, 1112, 1114, 1117, 1118, 1119, 1172, 1174, 1176, 1196, 1197, 1198, 1199, 1201, 1212, 1243, 1254, 1255, 1268, 1278, 1287, 1295, 1296, 1301, 1315, 1326, 1338, 1350, 1364, 1365, 1376, 1410, 1411, 1412, 1428, 1444, 1456, 1529, 1530, 1532, 1533, 1569, 1588, 1589, 1590, 1591, 1592, 1595, 1599, 1602, 1604, 1638, 1639, 1647, 1648, 1649, 1650, 1651, 1652, 1654, 1656, 1658, 1659, 1663, 1664, 1665, 1667, 1669, 1670, 1672, 1673, 1674, 1685, 1687, 1688, 1692, 1693, 1696, 1703, 1704, 1709, 1713, 1714, 1716, 1717, 1718, 1719, 1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727, 1728, 1729, 1731, 1732, 1733, 2193, 2196, 2197, 2199, 2206, 2213, 2223, 2227, 2238, 2239, 2240, 2252, 2253, 2255, 2257, 2258, 2265, 2266, 2268, 2269, 2271, 2272, 2273, 2274, 2275, 2349, 2351, 2372, 2373, 2374, 2376, 2378, 2379, 2430, 2431, 2433, 2440, 2446, 2456, 2466, 2519, 2520, 2521, 2531, 2545, 2546, 2549, 2556, 2557, 2565, 2567, 2568, 2569, 2570, 2581, 2582, 2583, 2585, 2586, 2587, 2596, 2608, 2614, 2646, 2650, 2652, 2653, 2655, 2656, 2667, 2668, 2670, 2678, 2685, 2691, 2696, 2697, 2703, 2706, 2712, 2719, 2720, 2727, 2735, 2736, 2737, 2775, 2781, 2796, 2797, 2802, 2820, 2851, 2869, 2871, 2874, 2882, 2884, 2891, 2943, 2967, 2968, 2969, 2970, 2971, 2972, 2973, 2980, 2981, 2982, 2983, 2984, 2985, 2987, 2988, 2992, 3072, 3085, 3086, 3523, 3527, 3541, 3593, 3621, 3643, 3701, 3723, 3738, 3801, 3852, 3890, 3926, 3951, 4093, 4139, 4190, 4209, 4243, 4258, 4278, 4308, 4339, 4362, 4393, 4423, 4455, 4482, 4557, 4579, 4617, 4627, 4661, 4680, 4706, 4748, 4798, 4824, 4893, 4894, 4896, 4919, 4942, 4978, 5009, 5026, 5083, 5096, 5120, 5149, 5151, 5185, 5201, 5229, 5534, 5543, 5552, 5559, 5576, 5580, 5586, 5625, 5627, 5634, 5641, 5650, 5657, 5658, 5659, 5671, 5674, 5689, 5690, 5699, 5700, 5709, 5718, 5724, 5726, 5727, 5728, 5765, 5766, 5768, 5776, 5783, 5796, 5800, 5802, 5803, 5809, 5816, 5830, 5840, 5845, 5853, 5861, 5867, 5868, 5872, 5874, 5875, 5887, 5959, 5960, 5961, 5962, 5964, 5965, 5968, 5970, 5973, 5977, 5978, 5979, 5985, 5986, 5987, 5989, 5991, 5993, 5994, 5995, 5998, 6e3, 6003, 6004, 6006, 6204, 6211, 6212, 6213, 6223, 6228, 6245, 6259, 6268, 6269, 6270, 6274, 6275, 6277, 6279, 6285, 6286, 6289, 6290, 6292, 6293, 6294, 7194, 7197, 7201, 7219, 7228, 7231, 7238, 7239, 7241, 7242, 7243, 7245, 7297, 7298, 7301, 7302, 7419, 7420, 7431, 7442, 7449, 7452, 7461, 7462, 7463, 7478, 7533, 7725, 7727, 7728, 7730, 7735, 7748, 7763, 7770, 7779, 7782, 7785, 7792, 7800, 7804, 7805, 7806, 7820, 7824, 7833, 7834, 7835, 7839, 7874, 7875, 7893, 7900, 7908, 7909, 7914, 7922, 7966, 7967, 7973, 7976, 7988, 7993, 7994, 7996, 7998, 8033, 8034, 8040, 8047, 8048, 8057, 8066, 8081, 8085, 8086, 8138, 8139, 8144, 8145, 8148, 8150, 8151, 8152, 8161, 8175, 8183, 8197, 8209, 8210, 8212, 8214, 8236, 8247, 8253, 8254, 8266, 8278, 8365, 8377, 8385, 8388, 8394, 8419, 8422, 8423, 8424, 8425, 8427, 8430, 8433, 8444, 8446, 8448, 8476, 8551, 8558, 8562, 8563, 8572, 8594, 8595, 8600, 8601, 8680, 8682, 8684, 8693, 8697, 8703, 8709, 8715, 8725, 8730, 8731, 8749, 8760, 8765, 8770, 8780, 8786, 8790, 8796, 8802, 10410, 10411, 10412, 10419, 10421]);
  var edgeLength = /* @__PURE__ */ new Uint8Array([3, 3, 3, 3, 3, 3, 3, 3, 5, 8, 8, 2, 2, 3, 3, 3, 3, 3, 8, 5, 5, 5, 5, 5, 3, 3, 5, 5, 9, 12, 19, 8, 19, 8, 11, 9, 9, 8, 7, 7, 6, 8, 9, 16, 10, 7, 7, 11, 8, 6, 6, 9, 7, 11, 7, 14, 4, 4, 4, 4, 4, 4, 10, 7, 6, 6, 6, 6, 10, 10, 6, 10, 10, 22, 11, 9, 10, 10, 10, 9, 10, 8, 7, 7, 7, 8, 21, 13, 11, 11, 9, 10, 9, 13, 10, 8, 8, 9, 12, 9, 7, 10, 7, 7, 13, 7, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 8, 6, 3, 3, 3, 3, 3, 3, 2, 5, 3, 3, 3, 7, 2, 2, 2, 2, 2, 2, 3, 3, 3, 1, 1, 7, 8, 5, 2, 2, 7, 2, 2, 1, 4, 1, 11, 9, 9, 5, 5, 8, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 5, 11, 9, 9, 13, 7, 14, 7, 6, 6, 6, 7, 6, 6, 6, 6, 6, 6, 10, 7, 11, 9, 4, 4, 4, 4, 4, 6, 6, 6, 6, 13, 6, 8, 7, 10, 9, 9, 7, 9, 8, 9, 8, 7, 10, 6, 9, 8, 10, 10, 7, 8, 1, 9, 10, 12, 12, 12, 10, 9, 9, 10, 10, 9, 9, 1, 1, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 6, 6, 4, 3, 3, 3, 7, 4, 4, 4, 3, 3, 6, 7, 3, 4, 1, 2, 2, 2, 6, 1, 2, 2, 2, 2, 2, 12, 5, 3, 8, 9, 13, 4, 4, 13, 9, 9, 11, 7, 3, 12, 9, 2, 2, 2, 3, 3, 3, 3, 3, 8, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 7, 10, 15, 15, 7, 15, 20, 15, 9, 10, 10, 12, 14, 14, 14, 12, 12, 12, 12, 12, 14, 14, 10, 10, 10, 10, 14, 9, 9, 9, 9, 10, 14, 14, 14, 13, 13, 14, 9, 9, 9, 9, 9, 9, 7, 8, 6, 8, 8, 6, 8, 13, 8, 8, 6, 13, 8, 11, 13, 8, 6, 13, 8, 6, 9, 10, 10, 12, 14, 14, 14, 12, 12, 12, 12, 14, 14, 10, 10, 10, 10, 9, 9, 9, 10, 14, 14, 11, 13, 13, 9, 9, 9, 9, 9, 9, 2, 6, 9, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 2, 3, 3, 3, 3, 3, 3, 7, 7, 2, 3, 2, 2, 5, 3, 3, 3, 3, 3, 3, 4, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 5, 7, 4, 2, 2, 12, 8, 10, 8, 10, 7, 18, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 2, 2, 3, 3, 3, 5, 5, 3, 8, 8, 6, 8, 6, 6, 4, 6, 7, 7, 7, 10, 11, 2, 5, 5, 3, 3, 3, 3, 3, 3, 5, 5, 6, 11, 10, 7, 7, 7, 4, 4, 4, 2, 3, 3, 3, 3, 3, 2, 2, 7, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 11, 7, 6, 9, 6, 6, 8, 10, 8, 6, 8, 13, 4, 4, 4, 4, 4, 10, 8, 11, 8, 8, 8, 10, 10, 7, 10, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 10, 13, 7, 8, 7, 11, 8, 8, 6, 9, 8, 8, 6, 6, 6, 8, 8, 6, 6, 6, 6, 6, 9, 7, 6, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 9, 7, 8, 10, 8, 8, 2, 3, 3, 3, 3, 3, 2, 8, 9, 9, 2, 2, 2, 3, 3, 3, 2, 3, 3, 3, 9, 2, 2, 3, 3, 3, 3, 3, 3, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 12, 5, 5, 3, 5, 4, 2, 3, 2, 4, 3, 9, 2, 2, 2, 2, 2, 5, 5, 3, 8, 8, 13, 6, 10, 9, 4, 7, 9, 11, 2, 3, 7, 3, 3, 4, 1, 3, 4, 2, 9, 3, 3, 12, 5, 3, 7, 10, 10, 7, 4, 4, 6, 14, 7, 9, 7, 13, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 8, 15, 4, 4, 2, 3, 3, 3, 7, 4, 9, 9, 2, 3, 3, 3, 5, 3, 2, 2, 7, 2, 7, 6, 6, 7, 2, 4, 2, 2, 2, 2, 2, 2, 8, 8, 8, 9, 5, 2, 3, 3, 3, 3, 3, 3, 10, 7, 4, 4, 4, 4, 3, 4, 2, 3, 3, 3, 3, 3, 10, 7, 4, 4, 4, 4, 2, 3, 3, 3, 3, 10, 7, 4, 4, 4, 4, 3, 9, 6, 6, 6, 9, 13, 9, 2, 2, 2, 8, 7, 9, 5, 3, 3, 3, 5, 5, 13, 12, 9, 10, 7, 8, 7, 6, 8, 6, 11, 12, 7, 10, 4, 4, 7, 8, 11, 6, 7, 9, 8, 7, 10, 8, 9, 15, 7, 8, 5, 4, 7, 2, 3, 3, 3, 2, 14, 10, 2, 14, 10, 2, 14, 3, 9, 13, 13, 10, 14, 16, 17, 11, 2, 14, 2, 14, 3, 9, 13, 10, 14, 16, 17, 11, 14, 10, 14, 2, 7, 3, 10, 7, 14, 10, 2, 14, 10, 9, 9, 17, 6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 10, 10, 10, 12, 9, 4, 10, 10, 11, 8, 8, 8, 7, 9, 5, 3, 3, 3, 3, 3, 3, 3, 3, 5, 8, 4, 4, 4, 4, 4, 4, 6, 16, 3, 3, 14, 3, 14, 2, 14, 9, 13, 10, 10, 14, 16, 17, 11, 6, 9, 10, 10, 12, 14, 14, 14, 12, 12, 12, 12, 14, 14, 10, 10, 10, 10, 14, 9, 9, 9, 10, 14, 14, 14, 9, 9, 9, 9, 9, 9, 2, 14, 9, 13, 10, 10, 14, 16, 17, 11, 6, 14, 2, 14, 9, 17, 13, 10, 10, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 10, 14, 17, 16, 17, 11, 2, 14, 9, 13, 10, 14, 16, 17, 11, 2, 14, 9, 13, 10, 17, 16, 11, 17, 2, 14, 10, 19, 7, 2, 14, 9, 13, 10, 19, 10, 7, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 10, 19, 7, 14, 16, 17, 11, 2, 14, 9, 13, 10, 10, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 10, 10, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 17, 13, 10, 10, 14, 17, 16, 17, 11, 6, 3, 2, 14, 9, 13, 10, 10, 14, 16, 17, 11, 6, 9, 10, 12, 14, 14, 14, 12, 12, 12, 12, 12, 14, 14, 14, 10, 10, 10, 14, 9, 9, 9, 9, 14, 14, 14, 13, 13, 14, 9, 9, 9, 9, 9, 9, 4, 11, 2, 14, 9, 13, 17, 13, 10, 19, 10, 7, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 17, 13, 10, 19, 10, 7, 14, 17, 16, 17, 11, 6, 2, 14, 9, 13, 10, 19, 7, 14, 17, 16, 17, 11, 2, 9, 10, 10, 7, 17, 3, 3, 12, 12, 16, 15, 15, 12, 14, 14, 14, 20, 20, 13, 12, 12, 12, 12, 12, 12, 20, 25, 14, 14, 12, 12, 10, 10, 10, 10, 14, 9, 9, 9, 25, 4, 9, 17, 10, 7, 14, 16, 21, 13, 13, 14, 20, 14, 13, 17, 24, 9, 12, 13, 25, 13, 21, 20, 17, 9, 9, 9, 9, 9, 9, 12, 17, 4, 4, 9, 9, 9, 10, 10, 12, 14, 14, 14, 12, 12, 12, 12, 12, 14, 14, 10, 10, 10, 10, 14, 9, 9, 9, 9, 10, 14, 14, 14, 13, 13, 14, 9, 9, 9, 9, 9, 9, 9, 10, 14, 12, 12, 14, 14, 10, 9, 9, 9, 10, 14, 14, 14, 9, 9, 9, 9, 2, 1, 5, 8, 7, 11, 11, 1, 3, 3, 3, 5, 3, 3, 4, 8, 9, 10, 10, 12, 14, 14, 14, 12, 12, 12, 12, 14, 14, 10, 10, 10, 10, 14, 9, 9, 9, 10, 14, 14, 14, 13, 13, 14, 9, 9, 9, 9, 9, 9, 7, 4, 4, 4, 4, 4, 4, 4, 4, 4, 10, 2, 2, 6, 7, 6, 2, 3, 2, 3, 6, 2, 7, 6, 10, 7, 4, 9, 12, 6, 14, 4, 12, 7, 2, 2, 1, 2, 7, 6, 4, 4, 4, 6, 8, 8, 7, 2, 2, 13, 2, 2, 2, 2, 6, 2, 8, 12, 2, 7, 7, 6, 8, 10, 12, 2, 2, 2, 3, 3, 13, 2, 2, 3, 3, 6, 7, 6, 4, 5, 6, 3, 3, 3, 3, 4, 16, 8, 5, 4, 3, 3, 3, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 11, 12, 7, 7, 13, 9, 10, 17, 12, 8, 9, 7, 17, 17, 8, 5, 12, 10, 13, 14, 5, 5, 5, 13, 5, 5, 5, 3, 3, 3, 5, 16, 5, 5, 5, 5, 7, 12, 14, 8, 12, 8, 10, 12, 9, 11, 7, 9, 7, 10, 7, 13, 9, 7, 12, 8, 17, 7, 7, 16, 10, 13, 13, 8, 10, 10, 14, 17, 7, 16, 16, 15, 8, 10, 10, 12, 17, 17, 7, 17, 14, 7, 10, 17, 8, 7, 7, 7, 8, 15, 15, 7, 14, 10, 10, 10, 11, 11, 7, 7, 13, 8, 10, 7, 16, 7, 8, 7, 14, 17, 12, 10, 11, 21, 8, 9, 7, 13, 9, 8, 6, 13, 6, 12, 7, 6, 13, 10, 10, 10, 8, 18, 9, 17, 13, 10, 12, 6, 13, 6, 11, 8, 13, 10, 13, 18, 13, 11, 13, 8, 16, 7, 10, 8, 16, 12, 10, 8, 8, 14, 11, 8, 15, 8, 8, 7, 7, 12, 7, 8, 9, 14, 15, 8, 9, 10, 9, 15, 7, 8, 8, 12, 13, 9, 10, 15, 13, 7, 10, 10, 20, 7, 6, 9, 6, 6, 14, 11, 14, 11, 12, 9, 10, 16, 16, 12, 7, 11, 28, 8, 11, 10, 7, 21, 8, 7, 9, 4, 4, 4, 17, 7, 8, 6, 9, 6, 6, 13, 6, 6, 6, 6, 18, 20, 14, 8, 11, 12, 9, 10, 13, 15, 15, 19, 8, 9, 12, 7, 10, 16, 12, 9, 9, 9, 14, 12, 11, 10, 9, 12, 11, 18, 9, 9, 9, 10, 7, 7, 16, 8, 9, 7, 13, 12, 10, 14, 18, 7, 8, 11, 7, 7, 8, 8, 13, 7, 7, 7, 11, 15, 13, 11, 7, 8, 15, 11, 7, 8, 18, 14, 13, 18, 15, 10, 12, 12, 9, 7, 11, 11, 8, 7, 10, 8, 14, 12, 10, 18, 7, 10, 9, 7, 8, 13, 10, 14, 10, 8, 8, 23, 7, 7, 11, 12, 12, 17, 7, 7, 11, 11, 17, 16, 16, 7, 8, 11, 14, 14, 8, 10, 7, 7, 16, 16, 13, 9, 11, 9, 15, 15, 11, 11, 7, 7, 14, 7, 9, 7, 7, 16, 10, 13, 10, 11, 14, 7, 11, 10, 11, 7, 11, 10, 11, 15, 11, 15, 10, 12, 10, 14, 13, 11, 11, 12, 13, 10, 7, 13, 10, 16, 12, 21, 15, 9, 10, 10, 7, 11, 14, 17, 7, 7, 8, 11, 13, 12, 8, 15, 14, 14, 8, 17, 12, 10, 10, 7, 9, 11, 7, 10, 7, 11, 18, 7, 11, 7, 12, 11, 8, 8, 14, 12, 7, 8, 15, 3, 7, 7, 5, 2, 9, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 5, 3, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 5, 11, 6, 4, 7, 10, 7, 7, 11, 1, 10, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 5, 7, 3, 5, 6, 3, 3, 5, 2, 2, 5, 3, 4, 13, 11, 3, 3, 6, 3, 5, 14, 2, 2, 3, 8, 2, 2, 12, 5, 18, 5, 3, 3, 3, 16, 5, 5, 5, 10, 7, 13, 12, 13, 9, 12, 14, 19, 9, 9, 21, 9, 9, 10, 6, 9, 6, 15, 10, 6, 12, 8, 6, 10, 15, 4, 4, 6, 6, 9, 9, 12, 16, 14, 23, 7, 7, 7, 14, 9, 7, 7, 11, 14, 10, 7, 10, 10, 10, 12, 6, 11, 10, 13, 11, 15, 11, 7, 12, 10, 3, 7, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4, 3, 7, 1, 5, 2, 2, 2, 5, 5, 5, 5, 3, 3, 3, 3, 3, 5, 5, 10, 9, 11, 8, 7, 12, 8, 9, 7, 6, 13, 11, 6, 13, 7, 9, 9, 4, 4, 4, 4, 4, 6, 10, 7, 8, 13, 8, 8, 9, 14, 7, 8, 10, 7, 7, 7, 9, 6, 9, 7, 2, 12, 5, 3, 3, 13, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 8, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 2, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 1, 7, 6, 4, 12, 3, 3, 3, 3, 3, 8, 7, 3, 3, 3, 3, 3, 3, 4, 4, 11, 15, 14, 2, 8, 3, 5, 5, 8, 10, 8, 6, 4, 7, 17, 7, 4, 5, 2, 6, 3, 2, 2, 12, 5, 5, 3, 15, 13, 8, 11, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 5, 3, 3, 3, 3, 4, 18, 2, 12, 5, 3, 3, 3, 3, 3, 5, 16, 8, 8, 9, 6, 6, 4, 4, 4, 4, 31, 6, 6, 10, 11, 21, 10, 9, 7, 10, 7, 7, 2, 4, 4, 4, 4, 6, 5, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 6, 6, 2, 2, 2, 5, 3, 3, 3, 7, 7, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 8, 2, 3, 3, 3, 3, 3, 5, 9, 11, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 5, 10, 9, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 11, 10, 10, 10, 10, 10, 11, 10, 11, 10, 11, 10, 9, 9, 11, 3, 3, 3, 3, 3, 3, 5, 3, 7, 8, 8, 7, 6, 6, 11, 4, 4, 4, 7, 8, 9, 9, 2, 3, 7, 4, 4, 2, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 2, 2, 5, 5, 5, 5, 5, 3, 3, 5, 5, 5, 7, 7, 6, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 8, 8, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 6, 9, 12, 3, 7, 10, 7, 2, 2, 3, 3, 3, 3, 3, 4, 3, 3, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 8, 8, 6, 6, 8, 6, 7, 4, 4, 4, 4, 4, 4, 6, 7, 5, 5, 20, 19, 8, 10, 9, 7, 10, 6, 8, 11, 6, 6, 6, 6, 13, 12, 8, 6, 7, 14, 11, 9, 2, 5, 3, 6, 2, 3, 2, 2, 2, 2, 2, 2, 2, 5, 4, 3, 7, 6, 4, 7, 4, 3, 6, 4, 7, 2, 7, 7, 7, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 9, 10, 10, 11, 7, 8, 20, 7, 8, 9, 8, 12, 6, 6, 6, 8, 9, 8, 12, 6, 6, 8, 13, 10, 12, 6, 6, 7, 7, 9, 6, 4, 4, 4, 4, 4, 4, 10, 6, 6, 6, 7, 14, 11, 10, 7, 8, 10, 8, 11, 14, 11, 11, 9, 7, 9, 8, 11, 9, 17, 10, 9, 2, 2, 2, 9, 3, 3, 3, 3, 15, 14, 9, 5, 5, 2, 8, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 15, 12, 22, 19, 17, 18, 18, 19, 21, 7, 16, 16, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 9, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 7, 16, 11, 11, 7, 7, 7, 7, 17, 7, 8, 12, 15, 9, 19, 7, 19, 8, 21, 11, 12, 19, 14, 22, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 16, 16, 19, 24, 12, 7, 14, 7, 12, 7, 8, 10, 10, 13, 7, 12, 12, 7, 7, 10, 18, 15, 12, 16, 7, 14, 12, 17, 10, 16, 17, 12, 17, 25, 7, 7, 7, 13, 6, 9, 6, 9, 18, 6, 6, 11, 20, 10, 6, 6, 6, 6, 6, 6, 17, 6, 6, 6, 15, 6, 6, 6, 6, 6, 8, 14, 11, 12, 11, 15, 13, 19, 17, 21, 7, 18, 8, 13, 13, 8, 12, 8, 6, 6, 13, 6, 15, 15, 16, 6, 6, 16, 6, 6, 6, 14, 6, 18, 6, 6, 6, 17, 18, 9, 13, 15, 8, 19, 8, 15, 15, 18, 14, 16, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 11, 10, 11, 6, 21, 23, 12, 17, 12, 11, 14, 13, 22, 15, 15, 11, 12, 14, 12, 7, 12, 8, 12, 14, 12, 18, 10, 8, 16, 19, 17, 12, 14, 15, 8, 19, 17, 12, 13, 13, 15, 18, 13, 23, 24, 23, 21, 17, 24, 8, 21, 8, 14, 14, 16, 20, 14, 8, 8, 15, 20, 8, 19, 21, 9, 8, 13, 12, 13, 15, 11, 8, 11, 9, 9, 8, 11, 8, 21, 14, 21, 15, 15, 13, 7, 19, 7, 7, 7, 7, 7, 7, 16, 12, 17, 18, 7, 7, 11, 11, 7, 9, 9, 2, 2, 3, 3, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 10, 10, 7, 9, 7, 7, 7, 6, 8, 6, 6, 6, 6, 6, 6, 6, 7, 6, 8, 6, 6, 9, 7, 7, 7, 4, 4, 4, 4, 4, 4, 4, 4, 8, 9, 8, 7, 8, 7, 8, 10, 7, 5, 5, 5, 5, 5, 5, 3, 9, 7, 7, 8, 6, 6, 6, 6, 6, 6, 6, 6, 9, 6, 6, 9, 11, 13, 7, 8, 9, 9, 5, 5, 5, 7, 8, 6, 6, 6, 6, 6, 6, 6, 7, 8, 9, 7, 10, 9, 10, 7, 8, 5, 5, 5, 5, 5, 5, 7, 7, 9, 8, 7, 7, 6, 6, 6, 6, 6, 6, 10, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 10, 4, 4, 4, 4, 8, 7, 7, 10, 10, 9, 8, 8, 15, 9, 8, 8, 8, 8, 8, 9, 10, 9, 10, 7, 8, 13, 5, 5, 5, 5, 5, 3, 3, 7, 7, 8, 6, 6, 6, 4, 4, 11, 9, 7, 8, 9, 10, 7, 5, 5, 5, 5, 5, 3, 3, 7, 6, 6, 13, 7, 9, 8, 7, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 7, 8, 7, 8, 13, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 6, 6, 6, 6, 7, 6, 7, 6, 6, 9, 7, 4, 4, 4, 4, 4, 4, 4, 7, 8, 7, 8, 9, 8, 8, 8, 7, 10, 7, 8, 5, 5, 5, 5, 5, 5, 5, 5, 3, 7, 7, 7, 7, 9, 7, 10, 9, 6, 6, 6, 6, 6, 8, 8, 6, 6, 6, 7, 6, 6, 6, 9, 9, 4, 4, 13, 7, 10, 9, 9, 12, 7, 8, 8, 10, 8, 8, 8, 8, 8, 8, 5, 5, 5, 5, 3, 7, 7, 11, 7, 9, 8, 8, 6, 6, 10, 6, 8, 8, 8, 6, 7, 6, 6, 12, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 8, 8, 16, 8, 9, 8, 7, 5, 5, 5, 5, 5, 3, 3, 7, 7, 7, 10, 15, 8, 9, 8, 9, 9, 6, 6, 6, 6, 6, 6, 7, 4, 8, 7, 8, 8, 7, 8, 11, 8, 5, 5, 5, 5, 5, 3, 7, 7, 6, 11, 16, 7, 6, 4, 4, 4, 4, 9, 9, 8, 8, 8, 13, 12, 8, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 11, 7, 8, 8, 9, 13, 7, 7, 7, 9, 8, 8, 9, 12, 7, 12, 7, 12, 8, 7, 10, 12, 9, 9, 6, 6, 8, 8, 6, 6, 6, 6, 6, 6, 6, 9, 8, 9, 11, 8, 6, 6, 6, 6, 6, 12, 7, 6, 6, 6, 9, 7, 7, 6, 6, 6, 6, 6, 11, 9, 6, 6, 6, 6, 6, 7, 9, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 7, 7, 7, 7, 7, 11, 7, 7, 8, 8, 8, 8, 8, 8, 9, 8, 9, 9, 7, 7, 11, 11, 7, 12, 8, 8, 8, 8, 8, 7, 8, 8, 8, 8, 8, 13, 12, 8, 8, 8, 8, 7, 7, 7, 9, 5, 5, 5, 5, 5, 5, 5, 3, 3, 7, 7, 11, 7, 8, 8, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 10, 11, 6, 7, 9, 4, 4, 4, 4, 4, 4, 9, 9, 8, 9, 8, 8, 8, 7, 7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 11, 7, 7, 7, 9, 6, 6, 11, 8, 10, 6, 6, 6, 12, 8, 8, 7, 6, 6, 8, 7, 4, 4, 4, 4, 4, 4, 4, 4, 9, 10, 9, 9, 8, 10, 9, 11, 8, 5, 5, 5, 7, 6, 6, 8, 7, 4, 4, 4, 4, 8, 7, 7, 8, 7, 8, 8, 5, 5, 5, 5, 7, 7, 8, 8, 8, 6, 6, 6, 6, 6, 10, 8, 9, 13, 6, 7, 6, 6, 8, 7, 8, 4, 4, 4, 4, 11, 8, 8, 8, 10, 5, 5, 8, 7, 8, 13, 8, 7, 6, 8, 6, 9, 7, 8, 7, 5, 5, 5, 5, 5, 5, 3, 3, 7, 8, 9, 6, 4, 8, 10, 10, 8, 12, 9, 13, 2, 7, 5, 5, 5, 5, 5, 7, 7, 10, 6, 6, 6, 6, 6, 6, 6, 8, 4, 4, 9, 8, 8, 8, 14, 8, 8, 8, 9, 8, 5, 5, 5, 5, 5, 3, 3, 9, 6, 6, 6, 6, 10, 12, 6, 6, 6, 6, 6, 6, 6, 4, 4, 4, 4, 11, 8, 7, 8, 8, 8, 5, 5, 3, 3, 3, 3, 7, 7, 6, 8, 6, 8, 11, 7, 6, 6, 6, 7, 4, 8, 11, 9, 10, 5, 5, 5, 3, 3, 3, 7, 7, 8, 9, 8, 15, 9, 6, 6, 6, 6, 6, 6, 11, 11, 4, 4, 4, 4, 4, 7, 9, 9, 10, 8, 7, 5, 5, 5, 5, 5, 5, 3, 3, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 7, 4, 4, 4, 4, 4, 9, 9, 8, 8, 10, 13, 5, 5, 5, 3, 17, 7, 7, 7, 7, 7, 8, 6, 8, 13, 6, 6, 6, 6, 6, 6, 6, 6, 4, 4, 4, 9, 10, 8, 8, 8, 5, 5, 5, 5, 3, 7, 7, 7, 8, 8, 6, 6, 6, 8, 8, 8, 9, 10, 8, 4, 8, 10, 9, 8, 8, 8, 9, 13, 10, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 7, 8, 9, 9, 7, 7, 7, 10, 9, 9, 8, 9, 8, 8, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 12, 6, 6, 6, 6, 6, 6, 6, 6, 6, 12, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 11, 8, 8, 9, 9, 10, 8, 9, 7, 7, 5, 5, 5, 5, 5, 5, 3, 7, 8, 7, 6, 6, 8, 6, 6, 10, 4, 7, 8, 9, 12, 8, 7, 7, 5, 5, 5, 5, 5, 5, 3, 3, 7, 14, 7, 9, 8, 8, 6, 6, 8, 12, 12, 6, 6, 7, 7, 10, 4, 4, 4, 4, 4, 9, 9, 14, 9, 13, 8, 7, 5, 5, 5, 6, 6, 6, 7, 4, 8, 7, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 7, 7, 7, 8, 6, 6, 6, 6, 6, 6, 12, 6, 6, 6, 6, 4, 4, 9, 9, 8, 8, 11, 7, 7, 7, 5, 5, 5, 3, 9, 8, 6, 6, 7, 4, 4, 4, 4, 4, 4, 8, 8, 11, 5, 5, 5, 7, 7, 7, 9, 6, 6, 6, 6, 6, 6, 9, 8, 4, 4, 4, 4, 7, 12, 9, 8, 8, 8, 7, 10, 10, 5, 5, 5, 5, 5, 5, 5, 3, 11, 14, 8, 7, 8, 8, 6, 6, 6, 6, 6, 8, 7, 6, 6, 6, 7, 6, 8, 9, 4, 4, 4, 7, 8, 9, 7, 9, 7, 7, 9, 8, 5, 5, 5, 5, 5, 5, 5, 5, 5, 11, 3, 9, 7, 7, 12, 14, 8, 6, 6, 12, 11, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 15, 7, 4, 4, 4, 16, 9, 9, 9, 8, 9, 9, 9, 9, 9, 8, 8, 8, 13, 11, 8, 5, 5, 5, 5, 3, 7, 6, 6, 8, 8, 8, 6, 6, 7, 10, 7, 4, 4, 4, 4, 9, 7, 8, 7, 7, 7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 7, 7, 7, 9, 6, 6, 6, 6, 6, 8, 8, 7, 7, 9, 6, 6, 6, 7, 6, 6, 6, 6, 6, 15, 4, 4, 4, 4, 4, 8, 8, 7, 8, 12, 9, 8, 8, 8, 8, 8, 9, 8, 8, 10, 8, 8, 8, 8, 16, 9, 10, 2, 5, 5, 5, 5, 5, 5, 5, 9, 7, 6, 8, 9, 4, 4, 4, 4, 4, 7, 8, 8, 8, 9, 8, 11, 10, 5, 5, 5, 5, 3, 7, 8, 6, 6, 6, 6, 6, 8, 6, 6, 6, 6, 4, 12, 10, 12, 7, 7, 7, 7, 7, 7, 7, 5, 5, 5, 5, 3, 3, 7, 7, 10, 8, 9, 7, 6, 10, 7, 6, 6, 4, 4, 8, 9, 7, 9, 9, 9, 9, 8, 8, 8, 8, 10, 5, 5, 5, 5, 5, 5, 8, 7, 6, 6, 6, 10, 6, 7, 10, 7, 4, 4, 4, 4, 4, 4, 4, 12, 9, 10, 7, 7, 10, 8, 10, 5, 12, 9, 6, 6, 6, 6, 6, 7, 6, 4, 4, 4, 10, 9, 9, 8, 7, 7, 5, 5, 5, 5, 5, 5, 3, 3, 13, 7, 7, 9, 7, 7, 7, 8, 9, 9, 7, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 13, 9, 15, 15, 4, 4, 4, 4, 4, 10, 10, 9, 8, 9, 8, 8, 9, 7, 8, 7, 8, 5, 5, 7, 6, 6, 6, 4, 4, 4, 7, 8, 11, 8, 5, 5, 5, 5, 5, 5, 5, 7, 6, 6, 6, 6, 6, 6, 9, 11, 10, 7, 4, 4, 4, 9, 8, 8, 5, 5, 5, 5, 5, 9, 9, 6, 6, 6, 6, 6, 6, 6, 9, 9, 4, 4, 4, 4, 8, 8, 8, 9, 9, 8, 8, 8, 13, 2, 4, 2, 7, 5, 5, 5, 5, 5, 5, 9, 9, 6, 6, 6, 6, 10, 8, 8, 8, 6, 6, 6, 4, 4, 9, 8, 10, 8, 9, 8, 8, 8, 9, 8, 8, 5, 3, 3, 3, 11, 6, 6, 6, 7, 6, 6, 6, 4, 4, 9, 8, 5, 5, 5, 5, 5, 3, 11, 8, 6, 6, 6, 6, 6, 9, 7, 4, 4, 14, 10, 9, 8, 12, 8, 8, 8, 11, 15, 8, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 11, 11, 11, 10, 10, 7, 7, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 7, 11, 7, 7, 11, 11, 7, 8, 9, 10, 7, 7, 9, 9, 9, 9, 7, 7, 10, 8, 13, 8, 8, 8, 8, 11, 10, 6, 6, 8, 10, 11, 14, 14, 6, 6, 6, 6, 6, 6, 9, 11, 7, 7, 6, 8, 12, 11, 11, 6, 6, 10, 6, 6, 6, 6, 6, 10, 7, 7, 6, 6, 11, 6, 6, 6, 11, 8, 9, 7, 6, 10, 11, 9, 10, 11, 7, 11, 8, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 8, 6, 6, 8, 9, 10, 9, 6, 6, 6, 10, 6, 6, 6, 6, 11, 10, 11, 10, 9, 8, 7, 7, 7, 7, 11, 14, 8, 10, 9, 9, 8, 8, 7, 11, 8, 8, 8, 11, 11, 10, 10, 9, 10, 8, 11, 10, 8, 11, 9, 12, 8, 10, 8, 11, 8, 9, 9, 11, 11, 10, 11, 13, 8, 7, 8, 8, 9, 7, 8, 8, 8, 8, 7, 8, 2, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 8, 6, 4, 4, 4, 11, 7, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5, 5, 3, 3, 3, 3, 8, 7, 7, 8, 8, 4, 8, 7, 7, 7, 9, 7, 8, 9, 8, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 2, 3, 3, 3, 3, 3, 3, 4, 5, 5, 3, 3, 8, 8, 6, 9, 4, 4, 10, 7, 3, 3, 3, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 2, 2, 2, 3, 3, 3, 3, 3, 4, 10, 2, 3, 3, 3, 3, 3, 3, 3, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 3, 3, 3, 5, 2, 4, 2, 6, 2, 2, 9, 5, 5, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 9, 8, 7, 9, 6, 6, 11, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 7, 7, 11, 8, 8, 6, 5, 11, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 2, 3, 3, 3, 3, 3, 3, 6, 4, 4, 4, 4, 3, 3, 3, 3, 5, 7, 2, 3, 3, 3, 3, 3, 8, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 4, 4, 4, 4, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 2, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 6, 3, 3, 8, 10, 3, 4, 4, 1, 1, 1, 1, 1, 1, 1, 8, 9, 10, 7, 7, 1, 14, 18, 13, 18, 13, 10, 10, 16, 13, 18, 16, 13, 16, 18, 13, 22, 16, 16, 16, 14, 21, 16, 9, 14, 16, 9, 9, 14, 10, 10, 14, 12, 14, 19, 12, 11, 18, 13, 17, 15, 15, 15, 15, 16, 14, 13, 19, 18, 15, 19, 18, 12, 18, 12, 11, 20, 14, 15, 10, 17, 17, 16, 19, 20, 21, 15, 13, 16, 15, 15, 15, 1, 1, 3, 8, 7, 7, 8, 8, 8, 1, 6, 1, 1, 6, 3, 3, 4, 7, 3, 3, 5, 5, 4, 4, 4, 4, 4, 2, 7, 7, 8, 12, 3, 4, 5, 1, 3, 4, 4, 10, 4, 3, 3, 3, 8, 7, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 12, 9, 20, 7, 5, 5, 5, 9, 13, 5, 5, 5, 5, 5, 3, 3, 3, 16, 5, 5, 5, 13, 7, 8, 8, 11, 8, 7, 9, 7, 11, 12, 9, 9, 8, 8, 11, 10, 14, 7, 12, 10, 11, 13, 7, 9, 11, 17, 17, 14, 13, 7, 8, 7, 10, 10, 7, 16, 13, 7, 8, 17, 12, 9, 8, 6, 7, 10, 6, 6, 12, 6, 8, 10, 8, 8, 8, 6, 8, 6, 14, 6, 6, 6, 13, 6, 10, 6, 6, 7, 14, 8, 6, 6, 10, 11, 10, 9, 9, 7, 7, 6, 6, 6, 9, 9, 7, 9, 10, 9, 13, 12, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 6, 8, 9, 10, 9, 7, 10, 10, 8, 7, 8, 7, 10, 12, 9, 8, 15, 8, 7, 8, 8, 7, 7, 15, 13, 7, 10, 9, 14, 18, 16, 7, 24, 7, 8, 10, 11, 16, 8, 14, 7, 9, 9, 9, 13, 19, 14, 15, 14, 11, 7, 13, 9, 10, 7, 13, 9, 10, 11, 12, 8, 9, 2, 3, 5, 8, 7, 4, 4, 15, 10, 5, 3, 3, 3, 3, 3, 5, 4, 4, 4, 2, 2, 2, 2, 2, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 12, 5, 3, 8, 10, 15, 6, 7, 2, 3, 2, 5, 5, 12, 2, 5, 5, 5, 5, 2, 2, 5, 5, 12, 9, 5, 2, 2, 9, 5, 5, 12, 12, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 9, 12, 5, 8, 8, 9, 5, 5, 5, 8, 19, 7, 16, 15, 14, 9, 9, 9, 9, 7, 11, 11, 11, 7, 14, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5, 5, 15, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 9, 9, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 14, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 15, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 12, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 9, 9, 12, 9, 9, 12, 12, 12, 15, 7, 11, 7, 14, 11, 18, 13, 8, 18, 15, 18, 12, 14, 12, 8, 8, 8, 8, 9, 9, 9, 12, 7, 10, 10, 8, 8, 12, 12, 12, 7, 12, 12, 9, 7, 7, 7, 7, 7, 8, 15, 12, 9, 10, 10, 7, 10, 10, 13, 11, 10, 9, 22, 11, 9, 8, 8, 8, 8, 8, 13, 18, 13, 9, 15, 19, 9, 7, 7, 10, 7, 7, 7, 11, 8, 13, 17, 7, 7, 10, 10, 10, 7, 20, 16, 7, 7, 7, 7, 7, 7, 11, 21, 12, 12, 13, 11, 14, 16, 8, 8, 13, 11, 7, 7, 13, 7, 7, 14, 15, 15, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 13, 10, 18, 6, 6, 6, 6, 6, 6, 6, 6, 6, 11, 8, 8, 12, 12, 11, 11, 8, 12, 9, 9, 9, 13, 13, 9, 9, 9, 9, 9, 9, 6, 10, 12, 6, 6, 6, 6, 17, 11, 7, 7, 7, 7, 14, 14, 12, 6, 7, 7, 6, 6, 15, 10, 13, 10, 6, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 13, 9, 9, 15, 13, 6, 12, 12, 6, 19, 11, 10, 7, 7, 16, 8, 19, 17, 9, 9, 9, 9, 9, 6, 6, 6, 10, 8, 16, 8, 6, 6, 9, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 14, 6, 6, 6, 6, 20, 6, 9, 6, 14, 9, 9, 9, 6, 9, 8, 8, 12, 9, 8, 8, 8, 8, 7, 8, 12, 7, 8, 8, 8, 6, 8, 6, 6, 6, 6, 6, 6, 6, 9, 8, 8, 6, 6, 13, 9, 12, 13, 12, 14, 13, 12, 11, 11, 6, 8, 8, 8, 6, 13, 12, 11, 11, 12, 6, 11, 12, 11, 13, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 15, 6, 6, 6, 6, 6, 6, 6, 13, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 6, 18, 6, 12, 13, 13, 13, 9, 10, 15, 9, 12, 6, 6, 6, 6, 6, 6, 6, 6, 9, 15, 10, 9, 10, 13, 9, 19, 8, 18, 17, 10, 10, 8, 8, 6, 6, 6, 6, 6, 6, 10, 14, 8, 16, 16, 9, 8, 15, 8, 8, 10, 12, 14, 7, 7, 8, 8, 7, 7, 7, 7, 8, 13, 13, 11, 9, 9, 9, 12, 10, 17, 8, 11, 9, 7, 7, 14, 8, 14, 14, 7, 7, 7, 7, 7, 7, 14, 7, 7, 7, 7, 7, 10, 10, 8, 14, 7, 7, 7, 7, 8, 8, 8, 8, 8, 17, 9, 7, 15, 7, 8, 12, 7, 9, 14, 7, 7, 7, 9, 13, 8, 14, 7, 16, 18, 13, 15, 14, 12, 13, 10, 15, 9, 7, 7, 7, 10, 13, 15, 15, 9, 9, 9, 9, 19, 11, 7, 11, 11, 13, 8, 8, 8, 8, 7, 12, 19, 17, 9, 9, 13, 7, 7, 7, 9, 7, 7, 7, 12, 13, 15, 10, 8, 8, 14, 15, 12, 13, 13, 8, 12, 14, 7, 11, 7, 14, 15, 13, 12, 8, 8, 8, 8, 11, 13, 15, 15, 8, 13, 12, 8, 8, 8, 13, 10, 16, 14, 11, 8, 8, 12, 12, 9, 15, 15, 12, 12, 13, 8, 8, 9, 12, 13, 9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 11, 12, 11, 7, 14, 7, 13, 13, 13, 12, 18, 16, 7, 12, 11, 10, 10, 15, 9, 9, 9, 21, 7, 7, 7, 11, 16, 8, 8, 11, 11, 7, 7, 7, 7, 7, 19, 7, 7, 7, 7, 7, 7, 7, 7, 7, 12, 8, 9, 12, 14, 11, 9, 9, 9, 22, 12, 3, 3, 4, 8, 8, 15, 4, 2, 2, 5, 5, 3, 3, 3, 3, 3, 3, 6, 6, 4, 4, 4, 12, 7, 10, 2, 3, 3, 3, 3, 3, 3, 3, 6, 7, 3, 7, 5, 14, 4, 4, 7, 8, 10, 4, 1, 3, 3, 6, 2, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 2, 2, 5, 3, 4, 2, 2, 2, 2, 2, 2, 11, 5, 5, 5, 11, 5, 5, 3, 5, 5, 5, 5, 11, 14, 13, 9, 11, 9, 12, 8, 11, 11, 8, 11, 16, 9, 9, 7, 10, 9, 12, 8, 15, 6, 7, 6, 6, 13, 10, 8, 11, 8, 6, 6, 6, 12, 16, 6, 11, 7, 8, 9, 18, 6, 6, 9, 4, 4, 6, 13, 6, 6, 6, 6, 8, 8, 9, 16, 7, 7, 14, 7, 8, 8, 8, 7, 7, 7, 7, 7, 7, 15, 13, 7, 10, 7, 7, 10, 12, 16, 15, 7, 9, 9, 14, 11, 11, 10, 9, 10, 8, 12, 7, 8, 7, 7, 10, 12, 7, 12, 8, 7, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 3, 3, 5, 5, 5, 10, 4, 8, 7, 10, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 3, 7, 4, 5, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 8, 2, 2, 2, 8, 12, 7, 7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 8, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 7, 11, 9, 8, 8, 8, 7, 8, 9, 7, 7, 9, 7, 7, 7, 10, 7, 7, 10, 9, 10, 6, 6, 6, 6, 6, 6, 15, 7, 8, 9, 9, 8, 6, 6, 10, 9, 6, 8, 13, 9, 7, 6, 6, 6, 6, 6, 6, 12, 6, 6, 7, 6, 7, 6, 6, 6, 10, 10, 7, 6, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 14, 6, 6, 7, 7, 9, 6, 6, 6, 6, 9, 9, 8, 9, 10, 9, 8, 9, 12, 7, 7, 7, 8, 7, 10, 12, 11, 9, 10, 7, 7, 7, 9, 10, 10, 8, 12, 9, 7, 7, 9, 8, 8, 8, 10, 7, 7, 8, 9, 9, 7, 7, 7, 8, 2, 4, 6, 3, 4, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 5, 8, 6, 4, 7, 3, 3, 3, 3, 3, 3, 3, 12, 3, 3, 3, 3, 3, 3, 4, 4, 2, 3, 5, 3, 4, 7, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 6, 4, 3, 4, 2, 2, 2, 5, 3, 3, 3, 3, 3, 5, 4, 4, 4, 4, 7, 6, 8, 9, 2, 2, 2, 2, 3, 3, 3, 5, 7, 2, 3, 3, 8, 7, 7, 2, 2, 8, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 8, 8, 7, 7, 6, 10, 6, 9, 7, 11, 4, 6, 8, 8, 7, 8, 4, 5, 5, 5, 5, 3, 3, 11, 8, 9, 6, 6, 8, 7, 4, 4, 7, 8, 7, 2, 2, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 7, 2, 2, 5, 3, 3, 2, 3, 3, 3, 3, 3, 3, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 12, 5, 5, 3, 3, 3, 5, 10, 12, 6, 15, 4, 6, 6, 7, 14, 9, 3, 3, 3, 3, 3, 8, 2, 2, 3, 5, 5, 3, 3, 3, 3, 3, 3, 8, 8, 8, 7, 5, 8, 4, 6, 11, 2, 2, 7, 3, 3, 2, 9, 8, 5, 5, 3, 3, 3, 5, 5, 7, 7, 6, 6, 10, 6, 8, 6, 8, 9, 7, 4, 4, 4, 4, 7, 6, 6, 7, 7, 10, 9, 8, 11, 8, 3, 3, 3, 3, 3, 4, 4, 2, 3, 3, 3, 3, 3, 7, 6, 2, 5, 6, 7, 6, 4, 8, 9, 11, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 5, 3, 3, 3, 3, 3, 9, 9, 6, 4, 8, 7, 7, 5, 9, 8, 6, 2, 8, 7, 8, 5, 5, 5, 5, 5, 3, 3, 3, 16, 8, 7, 7, 7, 8, 7, 7, 7, 7, 9, 6, 9, 6, 10, 7, 7, 7, 6, 10, 8, 9, 11, 11, 8, 4, 4, 10, 8, 8, 6, 9, 6, 11, 8, 8, 8, 15, 7, 8, 9, 5, 3, 3, 3, 3, 3, 5, 2, 2, 3, 8, 9, 10, 3, 2, 2, 2, 2, 2, 2, 3, 6, 4, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 2, 3, 3, 3, 3, 3, 3, 3, 11, 5, 3, 3, 3, 3, 3, 3, 3, 3, 6, 7, 4, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 12, 7, 4, 12, 4, 6, 5, 4, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 11, 10, 6, 4, 6, 10, 8, 3, 3, 3, 3, 3, 3, 3, 3, 5, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2, 5, 3, 4, 4, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10, 5, 5, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 7, 8, 8, 7, 13, 12, 10, 10, 8, 8, 7, 7, 9, 12, 11, 6, 6, 8, 8, 9, 7, 7, 7, 10, 15, 10, 4, 4, 4, 4, 4, 11, 8, 8, 9, 7, 9, 14, 14, 12, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 12, 5, 5, 5, 11, 10, 7, 9, 3, 8, 7, 3, 15, 13, 11, 4, 4, 2, 2, 2, 19, 7, 5, 5, 3, 3, 3, 3, 3, 3, 3, 5, 22, 18, 6, 14, 17, 4, 4, 19, 16, 18, 2, 3, 3, 7, 2, 3, 2, 3, 3, 6, 4, 2, 3, 3, 2, 5, 3, 3, 3, 3, 3, 3, 3, 9, 9, 2, 3, 2, 2, 2, 3, 3, 3, 5, 7, 14, 7, 7, 12, 9, 13, 6, 11, 6, 10, 9, 7, 7, 8, 12, 12, 8, 8, 8, 10, 7, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 5, 8, 10, 7, 8, 11, 8, 12, 9, 4, 14, 7, 7, 9, 13, 2, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 1, 2, 2, 3, 3, 3, 3, 3, 3, 5, 2, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 8, 4, 4, 4, 3, 2, 3, 3, 3, 3, 5, 2, 2, 2, 2, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 12, 9, 8, 8, 9, 8, 6, 17, 6, 6, 6, 8, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 4, 4, 8, 8, 9, 9, 9, 7, 7, 7, 7, 7, 7, 7, 9, 9, 9, 7, 8, 8, 8, 10, 7, 13, 10, 8, 9, 3, 3, 5, 13, 3, 3, 3, 3, 3, 7, 7, 6, 6, 10, 13, 11, 11, 8, 8, 9, 8, 9, 9, 10, 10, 10, 11, 10, 10, 13, 13, 16, 15, 11, 12, 9, 9, 10, 9, 11, 10, 9, 9, 14, 7, 8, 3, 10, 7, 7, 3, 2, 2, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 7, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 11, 6, 7, 4, 6, 2, 2, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 6, 4, 4, 2, 2, 2, 3, 3, 3, 3, 4, 4, 6, 6, 6, 6, 5, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 9, 11, 6, 10, 9, 12, 7, 7, 11, 14, 9, 7, 12, 3, 3, 7, 12, 11, 12, 7, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 9, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 11, 5, 5, 5, 5, 5, 5, 5, 5, 11, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 10, 3, 3, 3, 11, 3, 5, 9, 11, 8, 12, 14, 9, 7, 8, 7, 7, 11, 11, 7, 7, 10, 9, 8, 10, 9, 7, 7, 7, 7, 7, 7, 8, 8, 7, 11, 8, 8, 8, 7, 7, 10, 8, 7, 13, 12, 7, 17, 10, 8, 8, 11, 7, 11, 11, 14, 7, 11, 7, 8, 6, 9, 20, 8, 7, 9, 16, 7, 10, 6, 11, 10, 8, 9, 7, 16, 11, 11, 9, 8, 9, 8, 8, 8, 11, 8, 15, 8, 8, 9, 7, 8, 8, 11, 10, 7, 5, 7, 10, 10, 15, 7, 7, 7, 8, 7, 8, 8, 10, 11, 10, 10, 10, 11, 11, 7, 8, 6, 8, 8, 8, 10, 6, 8, 6, 6, 7, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 16, 6, 15, 6, 7, 11, 11, 7, 9, 10, 11, 13, 10, 6, 16, 8, 10, 12, 11, 6, 6, 6, 6, 6, 6, 6, 10, 6, 10, 7, 7, 7, 11, 7, 11, 6, 6, 6, 6, 6, 6, 17, 7, 7, 6, 6, 12, 22, 6, 6, 6, 6, 6, 8, 6, 6, 6, 6, 7, 6, 6, 5, 6, 6, 8, 11, 6, 9, 14, 11, 9, 11, 7, 7, 8, 6, 6, 6, 8, 10, 9, 6, 6, 6, 6, 9, 7, 6, 6, 6, 6, 6, 15, 6, 4, 4, 4, 6, 4, 17, 8, 11, 6, 6, 9, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 6, 6, 6, 6, 10, 6, 10, 6, 6, 6, 6, 12, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 6, 6, 6, 6, 18, 6, 6, 6, 8, 9, 10, 7, 8, 9, 10, 11, 7, 13, 6, 8, 8, 6, 6, 14, 7, 7, 7, 7, 10, 7, 14, 9, 6, 6, 9, 15, 9, 7, 14, 6, 11, 14, 13, 7, 12, 8, 7, 7, 7, 7, 7, 12, 7, 10, 9, 16, 6, 8, 6, 5, 17, 6, 8, 10, 4, 6, 4, 10, 15, 17, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 8, 4, 4, 11, 7, 4, 4, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 19, 17, 6, 10, 11, 6, 6, 6, 6, 18, 6, 6, 11, 4, 4, 4, 5, 6, 6, 6, 9, 5, 6, 4, 6, 6, 4, 6, 6, 6, 6, 10, 6, 6, 4, 6, 6, 10, 6, 10, 6, 6, 6, 6, 11, 6, 6, 10, 6, 6, 8, 6, 6, 6, 8, 6, 11, 4, 11, 9, 10, 9, 11, 4, 8, 4, 11, 12, 7, 9, 8, 6, 7, 7, 8, 12, 12, 11, 13, 10, 11, 7, 7, 7, 9, 7, 11, 10, 7, 7, 7, 16, 11, 10, 11, 17, 9, 9, 8, 8, 7, 7, 7, 9, 7, 7, 7, 14, 7, 13, 9, 11, 10, 14, 10, 10, 12, 11, 10, 7, 10, 5, 14, 8, 8, 8, 9, 7, 8, 7, 7, 9, 8, 7, 8, 7, 7, 7, 7, 7, 7, 7, 11, 8, 10, 8, 7, 8, 14, 11, 8, 9, 9, 9, 8, 24, 10, 10, 12, 7, 7, 15, 11, 8, 8, 12, 11, 8, 9, 9, 7, 8, 9, 10, 11, 10, 11, 7, 12, 7, 7, 11, 9, 8, 14, 13, 12, 8, 11, 10, 8, 8, 7, 7, 14, 9, 10, 8, 9, 11, 7, 14, 8, 8, 13, 8, 8, 12, 7, 10, 14, 14, 11, 9, 10, 9, 9, 7, 7, 11, 11, 13, 9, 13, 5, 5, 5, 7, 9, 5, 11, 12, 14, 8, 7, 7, 11, 10, 9, 7, 8, 8, 7, 10, 11, 11, 5, 5, 7, 5, 5, 5, 7, 7, 15, 7, 7, 8, 7, 15, 12, 12, 10, 7, 8, 7, 11, 7, 7, 7, 23, 11, 8, 8, 11, 10, 7, 8, 11, 7, 19, 7, 7, 6, 9, 9, 9, 11, 3, 4, 7, 8, 6, 6, 4, 10, 8, 2, 2]);
  var edgeChild = /* @__PURE__ */ new Uint16Array([0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 12, 1, 1, 1, 1, 1, 17, 1, 1, 1, 12, 1, 12, 1, 12, 13, 1, 1, 1, 1, 12, 1, 12, 1, 1, 1, 1, 1, 14, 21, 1, 1, 1, 1, 1, 1, 1, 19, 12, 1, 1, 1, 1, 1, 1, 1, 1, 20, 1, 1, 1, 16, 18, 1, 1, 15, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 22, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 1, 24, 25, 26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 12, 12, 12, 12, 1, 32, 0, 0, 0, 1, 1, 1, 1, 35, 34, 1, 1, 1, 1, 1, 33, 1, 1, 1, 1, 37, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 39, 40, 0, 0, 0, 0, 12, 1, 1, 1, 12, 1, 1, 1, 43, 45, 45, 45, 43, 45, 43, 43, 44, 45, 43, 45, 43, 43, 43, 43, 43, 43, 45, 43, 43, 44, 43, 43, 43, 43, 45, 46, 46, 44, 45, 43, 43, 43, 43, 43, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 49, 51, 49, 49, 49, 51, 49, 50, 49, 52, 49, 50, 50, 49, 49, 49, 50, 52, 50, 52, 49, 50, 50, 12, 54, 54, 53, 55, 50, 52, 49, 49, 47, 48, 56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 59, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 66, 67, 12, 1, 1, 65, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 76, 79, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 77, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 12, 1, 1, 1, 1, 89, 1, 91, 1, 1, 1, 1, 1, 1, 1, 1, 94, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 97, 97, 1, 1, 12, 1, 100, 1, 1, 1, 1, 1, 1, 1, 98, 1, 99, 1, 101, 1, 1, 1, 1, 1, 102, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 110, 111, 1, 1, 1, 1, 1, 1, 113, 113, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 121, 122, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 122, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 122, 1, 1, 1, 1, 1, 1, 1, 1, 1, 126, 123, 125, 120, 1, 124, 1, 1, 114, 1, 1, 1, 1, 117, 1, 127, 1, 1, 1, 1, 1, 1, 119, 1, 108, 1, 109, 1, 12, 128, 106, 112, 1, 1, 1, 1, 1, 107, 115, 1, 12, 12, 12, 118, 116, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 12, 12, 1, 1, 1, 1, 1, 12, 134, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 136, 1, 1, 1, 1, 1, 1, 1, 1, 137, 138, 12, 12, 135, 133, 45, 45, 140, 49, 49, 139, 142, 141, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 145, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 143, 0, 0, 0, 0, 1, 0, 144, 132, 1, 0, 1, 1, 12, 12, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 148, 147, 20, 1, 1, 12, 12, 1, 20, 12, 12, 1, 1, 1, 1, 1, 134, 1, 1, 152, 1, 1, 1, 1, 153, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 1, 1, 136, 1, 1, 152, 1, 1, 1, 1, 153, 1, 1, 1, 134, 1, 1, 1, 152, 1, 157, 1, 1, 1, 153, 1, 1, 134, 1, 1, 1, 157, 1, 1, 1, 1, 1, 134, 1, 1, 1, 1, 1, 1, 1, 1, 134, 1, 1, 157, 1, 1, 157, 1, 1, 1, 1, 1, 1, 1, 163, 1, 1, 1, 152, 1, 1, 157, 1, 1, 1, 153, 1, 1, 163, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 136, 1, 1, 152, 1, 157, 1, 1, 1, 153, 1, 1, 134, 1, 1, 152, 1, 157, 1, 1, 1, 153, 1, 1, 134, 1, 1, 1, 1, 152, 1, 157, 1, 1, 1, 153, 1, 1, 1, 134, 1, 1, 152, 1, 1, 1, 1, 169, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 1, 172, 1, 1, 163, 1, 1, 1, 1, 1, 152, 1, 1, 157, 1, 1, 1, 153, 1, 1, 163, 1, 1, 1, 1, 1, 152, 1, 1, 157, 1, 1, 1, 153, 1, 1, 163, 1, 1, 1, 1, 1, 157, 1, 1, 1, 1, 167, 159, 159, 12, 1, 12, 171, 1, 1, 1, 1, 1, 160, 160, 160, 154, 1, 1, 1, 158, 160, 164, 170, 1, 1, 1, 1, 158, 158, 1, 1, 156, 154, 167, 158, 162, 175, 166, 175, 1, 1, 173, 1, 166, 155, 158, 1, 1, 1, 1, 158, 1, 161, 1, 1, 1, 12, 1, 176, 1, 165, 1, 1, 1, 165, 164, 168, 174, 156, 167, 1, 1, 1, 1, 1, 1, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 178, 179, 178, 178, 179, 178, 178, 178, 178, 180, 180, 178, 178, 179, 178, 179, 178, 178, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 182, 12, 1, 12, 12, 12, 12, 1, 12, 12, 12, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 195, 1, 197, 198, 196, 195, 195, 1, 1, 201, 1, 202, 200, 1, 12, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 213, 195, 195, 195, 195, 213, 1, 1, 1, 1, 216, 217, 215, 1, 1, 1, 1, 1, 1, 219, 219, 1, 1, 1, 219, 219, 221, 222, 220, 1, 224, 1, 1, 1, 1, 12, 230, 231, 232, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 199, 203, 1, 1, 1, 1, 151, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 227, 1, 1, 1, 194, 1, 1, 1, 1, 238, 1, 1, 235, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 185, 210, 1, 1, 1, 206, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 192, 1, 1, 1, 1, 1, 1, 1, 211, 1, 1, 1, 1, 226, 1, 1, 1, 1, 177, 1, 214, 1, 209, 1, 1, 1, 212, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 190, 1, 12, 1, 1, 12, 1, 1, 1, 1, 193, 1, 1, 1, 208, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 239, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 225, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 184, 12, 1, 1, 1, 187, 12, 1, 1, 1, 1, 1, 1, 1, 229, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 186, 1, 1, 1, 1, 1, 1, 1, 234, 1, 1, 1, 191, 1, 1, 1, 207, 1, 12, 1, 223, 204, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 211, 1, 1, 1, 1, 189, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 181, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 205, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 236, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 237, 1, 1, 12, 1, 1, 1, 1, 188, 1, 1, 1, 205, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 228, 1, 1, 1, 1, 183, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 218, 1, 1, 1, 12, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 233, 1, 1, 12, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 249, 0, 0, 0, 0, 0, 250, 0, 0, 0, 0, 0, 0, 1, 12, 1, 1, 1, 254, 1, 1, 1, 0, 255, 252, 253, 1, 1, 1, 1, 1, 1, 260, 1, 262, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 258, 1, 1, 1, 1, 1, 264, 1, 1, 12, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 263, 1, 1, 1, 12, 1, 1, 1, 1, 259, 1, 1, 1, 257, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 261, 1, 1, 1, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 1, 12, 1, 1, 1, 12, 1, 1, 270, 13, 1, 1, 1, 12, 12, 267, 268, 1, 1, 1, 1, 269, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 271, 1, 1, 12, 16, 1, 1, 1, 1, 1, 1, 272, 1, 1, 1, 12, 12, 1, 1, 1, 1, 1, 1, 272, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 281, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 285, 285, 1, 0, 0, 0, 0, 0, 1, 12, 0, 0, 0, 0, 0, 0, 0, 0, 178, 1, 290, 291, 1, 12, 1, 1, 1, 1, 12, 293, 1, 1, 292, 1, 1, 295, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 299, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 12, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 12, 0, 310, 0, 0, 311, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 59, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 335, 0, 0, 0, 0, 0, 0, 0, 0, 0, 337, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 353, 353, 354, 353, 0, 205, 1, 1, 13, 349, 1, 347, 0, 0, 0, 0, 0, 0, 0, 350, 1, 1, 355, 1, 235, 1, 1, 1, 1, 348, 1, 345, 1, 351, 1, 343, 1, 352, 1, 344, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 12, 346, 346, 1, 1, 1, 194, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 12, 1, 1, 1, 1, 342, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 358, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 295, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 398, 398, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 390, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 366, 377, 1, 1, 365, 400, 1, 371, 1, 1, 363, 395, 1, 1, 381, 362, 367, 1, 1, 1, 374, 405, 383, 1, 1, 1, 1, 1, 1, 384, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 393, 397, 0, 0, 79, 1, 1, 0, 391, 368, 404, 369, 372, 379, 1, 394, 0, 1, 0, 79, 388, 386, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 407, 1, 1, 378, 1, 79, 1, 0, 1, 1, 1, 410, 1, 0, 0, 79, 385, 0, 1, 364, 1, 1, 1, 0, 1, 1, 387, 1, 0, 1, 1, 1, 0, 1, 412, 375, 1, 1, 0, 1, 0, 0, 403, 0, 1, 1, 1, 79, 396, 1, 1, 392, 389, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 370, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 402, 0, 79, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 406, 1, 1, 1, 0, 0, 409, 0, 0, 0, 1, 382, 1, 0, 79, 408, 1, 0, 0, 0, 0, 411, 1, 1, 0, 0, 1, 0, 1, 0, 380, 0, 376, 0, 1, 1, 1, 0, 1, 1, 0, 399, 373, 401, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 12, 1, 1, 1, 12, 427, 427, 1, 1, 12, 12, 1, 427, 1, 1, 12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 439, 1, 1, 0, 1, 1, 1, 1, 235, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 457, 457, 1, 1, 0, 0, 343, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 470, 1, 469, 1, 1, 1, 1, 1, 1, 1, 1, 1, 474, 1, 12, 12, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 482, 1, 1, 1, 484, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 481, 1, 476, 1, 1, 1, 1, 463, 1, 1, 1, 1, 1, 1, 1, 1, 477, 12, 1, 1, 1, 1, 483, 1, 1, 1, 478, 472, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 343, 1, 460, 1, 1, 12, 480, 1, 1, 343, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 465, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 483, 1, 1, 1, 1, 343, 1, 479, 1, 1, 1, 473, 467, 1, 1, 1, 1, 1, 468, 1, 485, 471, 1, 1, 1, 1, 1, 466, 1, 1, 1, 1, 1, 1, 1, 1, 1, 461, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 475, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 464, 1, 1, 1, 1, 1, 462, 1, 249, 486, 1, 1, 1, 1, 1, 12, 1, 1, 1, 1, 12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 492, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 12, 1, 67, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 496, 0, 496, 496, 496, 496, 496, 496, 496, 0, 496, 496, 496, 496, 496, 1, 496, 496, 496, 0, 496, 496, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 501, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 505, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 498, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 499, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 507, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 497, 0, 0, 508, 503, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 502, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 497, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 506, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 518, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 229, 229, 1, 522, 1, 1, 1, 521, 1, 1, 1, 1, 517, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 519, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 523, 1, 1, 520, 1, 1, 1, 1, 1, 1, 1, 1, 398, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 524, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 535, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 12, 1, 537, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 59, 1, 1, 12, 12, 12, 12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 556, 1, 1, 1, 1, 1, 1, 1, 557, 1, 1, 1, 1, 1, 1, 1, 555, 1, 1, 12, 1, 1, 559, 268, 1, 1, 12, 12, 1, 1, 12, 1, 12, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 563, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 569, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 132, 1, 12, 574, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 107, 1, 1, 12, 1, 1, 1, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 579, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 144, 1, 1, 1, 257, 1, 1, 12, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 604, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 249, 1, 354, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 609, 1, 1, 1, 1, 0, 611, 0, 79, 0, 610, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 12, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 618, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 613, 613, 0, 617, 615, 613, 613, 613, 613, 613, 619, 613, 613, 623, 613, 613, 613, 613, 613, 613, 613, 613, 613, 613, 620, 617, 613, 613, 617, 613, 613, 613, 613, 613, 613, 613, 613, 613, 613, 613, 613, 613, 615, 613, 613, 613, 613, 613, 621, 613, 613, 613, 613, 613, 613, 0, 0, 0, 1, 622, 1, 1, 1, 1, 616, 1, 1, 1, 1, 1, 614, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 12, 627, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 12, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 12, 1, 1, 12, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 96, 64, 307, 333, 438, 565, 0, 4, 68, 265, 283, 309, 334, 360, 414, 440, 0, 529, 549, 566, 629, 9, 0, 60, 88, 424, 436, 456, 607, 0, 527, 548, 562, 644, 0, 30, 6, 0, 491, 530, 634, 592, 70, 0, 7, 312, 284, 415, 493, 443, 568, 79, 630, 0, 608, 336, 445, 495, 9, 105, 315, 536, 6, 30, 0, 338, 79, 417, 79, 513, 10, 6, 131, 277, 302, 0, 645, 539, 0, 595, 0, 63, 6, 6, 280, 95, 2, 459, 425, 437, 628, 0, 6, 0, 6, 313, 103, 6, 593, 531, 570, 0, 494, 416, 300, 314, 8, 71, 104, 631, 573, 418, 339, 327, 446, 146, 74, 317, 577, 540, 633, 596, 361, 356, 509, 6, 75, 149, 11, 0, 278, 552, 578, 597, 544, 582, 602, 643, 36, 6, 289, 322, 359, 331, 247, 30, 558, 585, 247, 41, 245, 294, 323, 332, 433, 450, 511, 301, 0, 73, 594, 0, 430, 444, 326, 79, 276, 79, 0, 612, 576, 534, 319, 448, 79, 419, 413, 0, 0, 0, 9, 587, 603, 246, 0, 451, 434, 561, 546, 605, 647, 85, 247, 42, 324, 422, 452, 601, 0, 541, 320, 303, 79, 244, 80, 28, 416, 30, 6, 420, 357, 330, 636, 624, 554, 581, 543, 0, 287, 81, 30, 432, 449, 0, 30, 453, 0, 248, 625, 547, 9, 435, 454, 247, 277, 86, 251, 626, 606, 589, 512, 455, 423, 279, 256, 87, 58, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 652, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 441, 0, 0, 0, 0, 0, 0, 0, 0, 82, 0, 129, 0, 0, 84, 580, 0, 0, 0, 0, 0, 0, 0, 27, 0, 583, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 441, 0, 0, 0, 0, 533, 0, 286, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 321, 0, 0, 0, 0, 0, 0, 0, 649, 0, 0, 0, 0, 0, 648, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 421, 0, 0, 0, 514, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 525, 0, 0, 0, 0, 0, 0, 431, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 545, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 526, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 298, 308, 0, 0, 0, 0, 0, 560, 304, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 542, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 487, 0, 0, 0, 341, 0, 0, 0, 0, 0, 0, 282, 0, 0, 0, 0, 0, 0, 23, 0, 0, 0, 0, 600, 0, 0, 0, 0, 632, 551, 0, 0, 0, 0, 273, 0, 0, 0, 0, 0, 0, 489, 0, 0, 510, 0, 0, 0, 0, 0, 61, 0, 0, 0, 296, 57, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 275, 0, 0, 0, 0, 0, 306, 642, 0, 72, 0, 0, 0, 0, 0, 0, 0, 0, 0, 651, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150, 0, 305, 0, 0, 0, 0, 0, 0, 599, 0, 0, 0, 0, 0, 0, 553, 0, 0, 0, 0, 0, 0, 0, 0, 0, 598, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 242, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 0, 532, 0, 0, 0, 0, 0, 586, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 516, 0, 515, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 288, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 488, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 316, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 567, 0, 0, 0, 0, 0, 0, 0, 0, 325, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 69, 266, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 0, 638, 0, 0, 584, 0, 0, 0, 0, 0, 0, 0, 0, 0, 274, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 641, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 550, 0, 0, 0, 84, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 528, 0, 646, 0, 0, 458, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 429, 0, 0, 0, 575, 0, 93, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 31, 0, 0, 0, 0, 0, 0, 29, 92, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 318, 0, 0, 0, 243, 0, 0, 0, 0, 0, 0, 590, 0, 0, 0, 0, 130, 0, 0, 0, 0, 0, 591, 0, 0, 0, 0, 0, 0, 0, 441, 447, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 426, 0, 340, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 328, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 564, 0, 0, 0, 442, 0, 0, 428, 0, 0, 0, 0, 0, 0, 635, 0, 0, 0, 571, 0, 0, 90, 0, 572, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 538, 490, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 297, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 441, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 640, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 639, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 650, 0, 0, 0, 0, 0, 588, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 329, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 637, 0, 0, 241, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 655, 655, 655, 655, 655, 655, 655, 654, 656]);
  var labelText = "orgmilcomschnetedugovdrrformsfeedbackofficialaccoorgmilschnetgovmagazinemediaunioncargopilotgroupcaarespressworksaerodromeworkinggroupair-traffic-controlaircraftaccident-preventioneducatormarketplaceambulanceinsurancecateringairportrepbodyenginesoftwaremodellingair-surveillanceconsultingchartertrainermaintenanceservicesdesignflightskydivingfreightassociationstudentgroundhandlingdgcafuelclubtaxicrewshowballooningexpresstraderbrokerauthoragentsairtrafficjournalistsafetyconsultantmicrolightaccident-investigationparachutingequipmentproductionfederationrecreationscientistnavigationengineertradingglidingleasingresearchpassenger-associationentertainmentparaglidinghangglidingaerobaticrotorcraftemergencycertificationgovernmentaeroclubexchangelogisticschampionshiphomebuiltcouncilconferencecontrolairlinecivilaviationjournalorgcomnetedugovcoorgcomnomnetobjofforgcomnetuwukiloappsframerorgmilcomnetedugovcoradioorgcomnetcommuneedogpbcoitgvorgedugov*spreviewfrontendrelayononstagingupid*mtls*privatelinktypedreamdeveloperbravemochawindsurfaivenmirenupsunwnextbegetngrokclerkwale2bwebcsbrunputerflutterflowspawnbaseshiptodaymagicpatternsnetlifyondigitaloceanrailwayhostedclaudehasurabotdashretoolvercelgithubluyanigadgetreplitcloudflaretelebitedgecomputeevervaultexponyatnoopencrpplxzeaburwasmerframerzeropsrocketpreviewconvexmedusajsspritesonherculeseasypanelstreamlitglideossnowflakemesserliloginlinehackclubcodepennorthflankbase44corespeedleapcellngrok-freeclerkstagelovableon-fleek*us-west-3ap-south-2us-central-2us-central-1eu-central-1ap-south-1us-west-2us-east-2eu-north-1ap-north-1us-west-1us-east-1*rcloudintsegorgmilcomgobbetnetintedugovturmusicasenasamutualcoopip6uriurnin-addre164homeirisgovdixdaemoncloudnssthwien*inexexkunden4accogvormymyspreadshop4lima2ixortsinfofuturecmsfuturehosting12hpprivfuturemailinglima-cityfunkfeuer123webseitednshomemelmyspreadshopcloudletswasantqldvicactnswtascatholicwasaqldvictasidwasantozqldorgcomvicasnactnetedugovnswtasconfcomairflowlambda-urltransfer-webapptransfer-webappairflowtransfer-webapptransfer-webapp-fipstransfer-webappeu-west-3ap-south-2eu-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1mx-central-1me-central-1ca-central-1il-central-1ap-northeast-1ap-southeast-1me-south-1af-south-1eu-south-1ap-south-1ap-southeast-7us-west-2eu-west-2ap-east-2us-east-2eu-north-1ap-southeast-2ap-northeast-2ap-southeast-5us-gov-west-1us-gov-east-1ap-southeast-6ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1privatenotebookstudiolabelingnotebookstudionotebooknotebook-fipslabelingnotebookstudionotebook-fipsnotebookstudio-fipsnotebook-fipsnotebookstudionotebook-fipsnotebookstudioeu-west-3ap-south-2eu-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1me-central-1ca-central-1il-central-1ap-northeast-1ap-southeast-1me-south-1af-south-1eu-south-1ap-south-1us-west-2eu-west-2us-east-2eu-north-1ap-southeast-2ap-northeast-2experimentsus-gov-west-1us-gov-east-1ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1onrepostsagemakercopporgmilcompronetintedugovbiznameinfoshoprsorgmilcomnetedugovbrendlyresolvenzauscotvstoreorgcomnetedugovbizinfoidacaicoittvorgmilcomschnetedugovinfocloudezproxysiteacmymyspreadshopkuleuvenwebhostingtransurl123websitecloudnsinterhostsolutionsddns5476103298edgfacbmlonihkjutwvqpsryxzbarsycoororgcomedumyftpno-iporxcloud-ipfor-somemmafanfor-morewebhopselfipjozidyndnscloudnsdscloudfor-thefor-betteractivetrailcoeconorestooteorgcomeconeteduassurmoneyafricaarchitectesrestaurantloisirstourismavocatsinfoagrounivcoorgcomnetedugoviatvdeportesaludtksatorgmilcomwebgobnetinteducienciaboliviarevistacooperativaempresanombreindustriamusicapatriamedicinademocraciapoliticapuebloindigenaplurinacionalarteblogwikiinfoagrotransportenoticiasprofesionalacademiaeconomiaecologiamovimientotecnologianaturalsimplesitecepesebamapadfmgalampbacscpirngorotomtrjspaprrprrsesmscepesebamapadfmgalampbacscpirngorotomtrjspaprrprrsesms*biaamfmtcmptvfeirasampajampanatalbelemananiradiog12medindfndbmdtrdthepoaggfjdfdefinfenflegsegongengcngorgzlgslglogppgmillelqslcimcomnomadmjabimbbibbsbabcrectecsjcetcpscpvhudieticriapipsiecnbiorioecogeoteoodoproatoartfstmatvetdetbetnetcntnotfotgrueduajuespappreptmpemparqsrvadvdevgovntrturagrjorfarjusmusdesvixxyzcozfozslzbhzmaringasantamariacampinagrandegoianiasorocabafloripasaobernardocuritibaboavistarecifeaparecidasaogoncasalvadorcuiabamorenamacapalondrinacontagemsocialfortalmaceioleilaoosascoriobranconiteroi9guacutcheblogflogvlogwikitaxicoopmanauspalmascaxiasjoinvillebaruericampinassantoandreribeiraoriopretoweorgcomnetedugovv0windsurfshiptodaycloudsitecoaccoorgnetgovofmilcomgovmediatechzacoorgcomnetedugsjgovmydnspenfnlabnbmbgcbcqconcontnuyksknsmyspreadshopno-ipawdevboxbarsyonidatemfuinabusavinstanceseceuguukussryzespawncsxcloud-ipmyphotosfantasyleaguetwmailcleverappsscrappingccwucloudnsftpaccessgame-serverccgovobjectsrmalpgcust*svcalp1aeappenginermalpgmyspreadshop4lima2ixsquare7cloudscale123websitefirenet12hpflowgotdnslinkyard-cloudcloudnslima-citydnskingobjectstorageedaccogoorusorgcomnetintedua\xE9roportxn--aroport-byaassogouvcomilgobgovcloudnses-1eu-west-1us-east-1euvipit1eurarubait1s3lbwebsites3websiteru-spbru-mskelasticcsrunstnukukcaukusnl-ams-1fr-par-1fr-par-2functionsnodess3ddlwhmrdbfnck8sifrs3-websitecockpitscblmgdbdtwhkafkpubprivs3ddlwhmrdbk8sifrs3-websitecockpitscblmgdbdtwhkafks3ddlrdbk8sifrs3-websitecockpitscblmgdbdtwhkafkk8sscalebookpl-wawfr-parnl-amsbaremetalsmartlabelinginstancesdechk2kuleuvenlaravelvoorloperurownoxazapscwhstgrvaporonline-serverobservablehqelementorantagonistreclaimjoteluluencowaydiademjelasticmatlabmagentositetrendhostingaxarnetjenv-arubajelejoteravendbemergenttrafficplexconvexkeliwebserveboltbegetcdnstaticson-rancherprimetelonstackitunison-servicesdnshomelinkyardbarsyjelecloudnscocomnetgovmycn-northwest-1cn-north-1s3s3-accesspoints3-websites3s3-accesspointrdsdualstacks3-deprecatedemrappui-prods3-websiteemrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apis3s3-accesspoints3s3-accesspointrdsdualstackemrappui-prods3-websiteemrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apicn-northwest-1cn-north-1cn-northwest-1ebcomputeelbcn-north-1airflowcn-northwest-1cn-north-1oncn-northwest-1cn-north-1amazonawssagemakeramazonwebservicesdirectasgdsdhehahljlnmhbacscahqhshhihnlnynsnmofjbjzjxjtjhkcqtwgsjssxnxjxgxxzgz\u7DB2\u7D61\u7F51\u7EDC\u516C\u53F8orgmilcomnetedugovxn--55qx5dcanva-appsxn--io0a7iquickconnectcanvasitekhsjxn--od0algcanva-codemyqnapcloudsrvrlessclustersrealtimestorageleadpagescarrdcrdorgmilcomnomnetedugovhidnssupabaserdpareplmypiumsoxmitotaplpagesfirewalledreplitowodevwebview-assetsvfswebview-assetss3s3-accesspointdualstackemrappui-prods3-websiteaws-cloud9emrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apicloud9eu-west-3ap-south-2eu-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1me-central-1ca-central-1il-central-1ap-northeast-1ap-southeast-1me-south-1af-south-1eu-south-1ap-south-1ap-southeast-7us-west-2eu-west-2us-east-2eu-north-1ap-southeast-2ap-northeast-2ap-southeast-5ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1s3s3-accesspointdualstackemrappui-prods3-websiteaws-cloud9emrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apicloud9consent-portals3s3-accesspointdualstackanalytics-gatewayemrappui-prods3-websiteaws-cloud9emrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstackemrappui-prods3-websiteemrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apis3s3-accesspointdualstackemrappui-prods3-websiteemrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apis3s3-accesspointdualstacks3-deprecateds3-websitebedrock-agentcores3-object-lambdaexecute-apibedrock-agentcores3s3-accesspoints3-websites3-accesspoint-fipss3-fipss3s3-accesspointdualstackemrappui-prods3-websites3-accesspoint-fipsaws-cloud9s3-fipsemrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstackemrappui-prods3-websites3-accesspoint-fipss3-fipsemrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apis3s3-accesspointdualstackemrappui-prods3-websiteaws-cloud9emrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstackemrappui-prods3-websiteaws-cloud9emrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstacks3-deprecatedanalytics-gatewayemrappui-prods3-websiteaws-cloud9emrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9vfss3s3-accesspointdualstackemrappui-prods3-websiteaws-cloud9emrstudio-prods3-object-lambdaemrnotebooks-prodexecute-apicloud9eu-west-3ap-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1mx-central-1me-central-1ca-central-1il-central-1ap-northeast-1us-northeast-1ap-southeast-1me-south-1af-south-1ap-south-1ap-southeast-7us-west-2eu-west-2ap-east-2us-east-2ap-southeast-2ap-northeast-2ap-southeast-5us-gov-west-1us-gov-east-1ap-southeast-6ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1mrapaccesspoints3s3-accesspointdualstacks3-deprecatedanalytics-gatewayemrappui-prods3-websites3-accesspoint-fipsaws-cloud9s3-fipsemrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstacks3-deprecatedanalytics-gatewayemrappui-prods3-websites3-accesspoint-fipsaws-cloud9s3-fipsemrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apicloud9s3s3-accesspointdualstackemrappui-prods3-websites3-accesspoint-fipss3-fipsemrstudio-prodbedrock-agentcores3-object-lambdaemrnotebooks-prodexecute-apis3eu-west-3ap-south-2eu-south-2computes3-ap-northeast-2elbrdss3-ap-east-1s3-sa-east-1s3-us-gov-west-1s3-eu-central-1s3-ca-central-1eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3s3-website-us-west-2s3-website-eu-west-1s3-external-1eu-central-1me-central-1ca-central-1il-central-1s3-us-west-1s3-eu-west-1s3-website-sa-east-1s3-website-ap-southeast-2ap-northeast-1ap-southeast-1s3-us-west-2s3-eu-west-2me-south-1af-south-1eu-south-1ap-south-1ap-southeast-7us-west-2eu-west-2us-east-2s3-website-ap-southeast-1s3-1s3-globals3-ap-northeast-3eu-north-1airflowap-southeast-2s3-us-gov-east-1s3-fips-us-gov-east-1s3-me-south-1s3-ap-south-1ap-northeast-2s3-website-us-west-1ap-southeast-5s3-eu-north-1s3-ap-southeast-1s3-website-us-gov-west-1compute-1s3-eu-west-3us-gov-west-1s3-website-ap-northeast-1us-gov-east-1s3-fips-us-gov-west-1s3-website-us-east-1s3-ap-southeast-2ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1s3-us-east-2s3-ap-northeast-1authauthauth-fipsauth-fipseu-west-3ap-south-2eu-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1mx-central-1me-central-1ca-central-1il-central-1ap-northeast-1ap-southeast-1me-south-1af-south-1eu-south-1ap-south-1ap-southeast-7us-west-2eu-west-2ap-east-2us-east-2eu-north-1ap-southeast-2ap-northeast-2ap-southeast-5us-gov-west-1us-gov-east-1ap-southeast-6ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1eu-west-3eu-south-2ap-southeast-3eu-central-1ca-central-1ap-northeast-1ap-southeast-1ap-south-1us-west-2eu-west-2us-east-2eu-north-1ap-southeast-2ap-northeast-2ap-southeast-5eu-west-1us-east-1ap-east-1sa-east-1csrframeservicesbuilderstg-builderdev-builder*ociocpocsazuregcpawsdemoinstanceeu-west-3ap-south-2eu-south-2eu-central-2ap-southeast-3ap-southeast-4ap-northeast-3eu-central-1me-central-1ca-central-1il-central-1ap-northeast-1ap-southeast-1me-south-1af-south-1eu-south-1ap-south-1ap-southeast-7us-west-2eu-west-2us-east-2eu-north-1ap-southeast-2ap-northeast-2ap-southeast-5us-gov-west-1us-gov-east-1ap-southeast-6ca-west-1us-west-1eu-west-1us-east-1ap-east-1sa-east-1previeweu-4us-4us-1eu-1us-2eu-2us-3eu-3appss3-websitekrkrobjectprivateobjectkrkrskrkrsobjectkrprivateobjectkr-privatecomputepaasrag-cloudrag-cloud-chjcloudjcloud-ver-jpcdemonodebalancermembersipeuxvsoncillaocelotonzayalilynxsphinxfentigercustomercaracalsgkrobjectstoragedesgkrusobjectkrkr-naverkr-naver-devkrprivatewebsiteobjectkr-naverkr-privatekr-naver-devjpjpkrjp4jp5s3-website-jpjpkrjp4jp5objectprivateobjecto365cloudstaticxendevapp001testcode-builder-stgplatformmediasiteprojedrydpagesjsx0desazacncoitrueu4uhkukgrbrushatenadiarymyspreadshopfrom-flfrom-wvwebspace-hosttheworkpchatenablogcursorusercontentservesarcasmapplinzisakuratanwixsitefin-ncloudstoragegov-ncloudstorageappchizigiizeis-into-carsdnsiskinkyadobeaemcloudis-a-therapistpgfogmyvncdojinis-an-actress1kappfldrvkozowqa2jpnmexprgmrfirewall-gatewaydynnscafjsfbsbxooguyfrom-gawoltlab-demois-a-anarchistwiardwebteaches-yogadattowebtb-hostinglive-websiteservegamegotpantheonfrom-nhsubsc-payfrom-ohvipsinaappfrom-cadyndns-officehomelinuxfrom-mahercules-appservebbsstreakusercontentfrom-okfrom-wyfastly-terrariumis-a-llamaqualyhqportalserveexchangeon-vaporvivenushopciscofreakgrayjayleaguesmetaaiusercontentfrom-iais-a-libertariansaves-the-whalestaveusercontentyolasiteoperaunitepoint2thisis-a-catererclaudeusercontentlinodeusercontentfrom-vagithubusercontentsells-for-lesshosteurcanva-appsplaystation-cloudddnsfreefrom-pafrom-prfrom-waddnskingoutsystemscloudhotelwithflightmydattois-a-nascarfanmydbserverminiserverdamnserverservehumouris-a-playerfrom-nvfrom-nmemergentagentgentappsamplifyappfrom-kyis-an-accountantnfshostserveircfrom-akpythonanywherestackhero-networkpostman-echolikescandydyndns-mailobservableusercontentserveftpfreeboxosfrom-utcdn77-storageamazonawsneat-urlnclouddyndns-serverlinodeis-a-teacherfrom-vtgleezemythic-beastsus1-pleniteu1-plenitla1-plenitpaywhirlservecounterstrikejdevcloudhealth-carereformis-into-animegoogleapisis-a-painterafricaisa-hockeynutatmetais-an-actora2hostedis-a-democratdatadetectest-le-patrondigitaloceanspacesis-a-designeris-a-hunterlinodeobjectstemp-dnsissmarterthanyoufrom-arsimplesiteevennodetownnews-stagingis-a-liberalgooglecodejelasticservemp3qualyhqpartnerdyndns-free1cooldnsest-a-la-masiondrayddnsdynuddnsfrom-orfrom-miis-a-bloggerfrom-himydobisscanvacodeis-an-engineerest-a-la-maisonupsunappdevinappswafflecellmyasustorwpenginepoweredfrom-ctservep2psame-appmyshopblocksthingdustdatalikes-piediscordsezis-with-thebandlpusercontentis-leetshopitsite3utilitiesis-a-personaltrainersinaappladeskis-a-cheflogoipselfipbase44-sandboxnospamproxyalibabacloudcsmesswithdnsauthgearappsiamallamawithgooglelutrausercontentmochausercontentframercanvasmytabitdyndns-homew-credentialless-staticblitzcpserverdiscordsaysis-a-nurseappspotatlassian-isolated-3premotewdfrom-mtwixstudiocode0emm180rmyactivedirectoryawsappsmytuleapdnsabrpolyspaceqbuserrenderbuiltwithdarkboutirgotdnsabrdnsdopaascanva-hosted-embedawsglobalacceleratorhomesecuritypcmyiphostditchyouripclever-clouddyndns-ipon-aptibleis-a-musicianhosted-by-filessecuritytacticsappspaceusercontenthomeunixstrapiappsame-previewcf-ipfsmycloudnaselasticbeanstalkis-certifieddontexistkasserverik-serverdrive-platformatlassian-3pfirebaseappncpstorageherokuappawsapprunnerbarsycenteris-a-cubicle-slaveservehttpmyshopifyis-a-guruquicksytessiiitesorsitesmagicpatternsappis-a-cpameteorappfrom-wiis-a-rockstarbumbleshrimpdattolocaldatabricksappsreadthedocs-hostedfrom-rifamilydsdyndns-picsplesknsbplaceddnsaliasdynaliasdyndns-remotedoomdnsip-ddnsblogdnsis-a-doctorroutingthecloudamazoncognitobarsyonlinedsmynasddnsgurucloudflare-ipfsdeus-canvasfrom-idsmushcdnpagespeedmobilizerdyndns-at-homeunusualpersonhosted-by-previderis-a-republicandyn-o-saurstreamlitappworkisboringonthewificprapidqualifioappis-uberleetis-slickgetmyipwpdevcloudtypeformdyndns-at-workgentlentapismynascloudw-corp-staticblitzfrom-ingeekgalaxyservebeerfrom-mdonrenderspace-to-rentaivencloudappspacehostedwafaicloudcodespotblogspotatlassian-3p-us-gov-modfrom-ndfrom-msis-a-techieis-a-studentcustomer-ociis-a-photographerdurumisfrom-ksmassivegriddyndns-wikiis-an-entertaineris-a-hard-workermysecuritycamerafrom-mnrackmazedyndns-blogis-a-bulls-fanwritesthisblogfreemyipsimple-urlfrom-sdreservdauthgear-stagingest-mon-blogueuris-into-gamesrice-labsxtooldevicesakurawebis-an-anarchistoraclecloudappsdyndns-worksells-for-urhcloudfrom-dcfastvps-serverwpmucdnis-a-geekscrysecfrom-txis-into-cartoonsmodelscapetrycloudflarelocaltonetstreak-linkbalena-devicesfrom-njforgeblocksfreebox-oswebadorsitefrom-ncdoesntexisthobby-sitestreaklinkshomesecuritymacownprovidertuleap-partnersdattorelaywphostedmailservequakeis-a-socialistservehalflifepivohostingdynuhostingquipelementsw-staticblitzdyndns-webfrom-deproject-studyaliases121is-not-certifiedhercules-devis-a-financialadvisoramazonlightsailservepicsis-a-greenloseyouripfrom-ilwithyoutubemwcloudnonprodwiredbladehostingdnsdojofrom-tnpixolinomyqnapcloudncloudstorageis-an-artisthostedpiis-a-landscaperauiusercontentoaiusercontenton-forgeis-a-conservativedreamhostersnet-freaksapps-1and1is-goneencoreapifastly-edgefrom-nesalesforcefrom-scdeployagentoraclegovcloudappsfrom-alis-a-lawyercechirevultrobjectsstufftoreadisa-geekddnsgeeklovableprojecttry-snowplowfrom-moblogsyteis-a-bookkeepernogmyforumravendbmyboxdeelementoredsaacficogoorinforgcomgobnatneteduidstoreorgcomnetintedudevnomepublorgcomneteduathgovtestscalculatorspaynowinfoquizzesresearchedcloudnsfunnelsassessmentsjscaleforcetmacltdorgmilcompronetgovbizpresseklogesrsccloudcustomfltusrcloude4corealmgovmunicontentproxy9metacentrumdyndyndyndnsdynpagespages-researchitionoccustomercomymyspreadshopipv64diskussionsbereich4limacomrub2ixfirewall-gatewayddnssspdnsbarsykeymachinesquare7myhome-serverspeedpartnercommunity-proschuldockxenonconnectg\xFCnstigliefernbwcloud-os-instancedyndnssecmy-routerxn--gnstigliefern-wobin-butterl-o-g-i-nisteingeekin-dslin-berlinin-brbfuettertdasnetzleitungsenin-vpnlcube-serverdyn-ip24logoipdyn-berlinruhr-uni-bochum12hpgoipsrvdnsfruskygit-repossvn-reposinternet-dnsg\xFCnstigbestellenhome-webserverxn--gnstigbestellen-zvbbplacedheimdnscosidnswebspaceconfiglima-citydyndns1istmeinvirtualuserschulplattformmy-gatewayddnsseclebtimnetztest-iservmein-iservvirtual-userhome64iservschuletaifun-dnstraeumtgeradeschulserverdynamisches-dns123webseitednshomehs-heilbronndnsupdaterbssgraphicdwadpdwdaepeweaawapaafpfwfabwbpbacwcpcciwebuserapiobjects*teamst3r2lpbravepanelngrokiservstglclcrmerpflypagesbarsyvivenushoplocalcertlocalplayerbearbloggatewaydeno-stagingis-not-ais-a-goodbotdashvercelmocha-sandboxplatter-appreplitgithubpreviewworkersinbrowserevervaultis-ahrsndenoxmitmodxmyaddrstorageapipayloadgrebedocruncontainersstgstagelclstageloginlineis-a-fullstackcodepenleapcellngrok-freeis-coolstoragewebharemediatechlibp2pdiscourseimaginecomyspreadshopstoreregbiz123hjemmesidefirmcoorgcomnetedugovsldorgmilcomwebgobartnetedugovtmorgpolcomsocartnetedugovassoagrondiscoodontk12medcuegyecpaabgengorgmilgalsaltulcomadmesmgobpubdocmonfindgnriouioproartlatvetnetfotedulojgovntrturibrbarxxxofficialbasechefprofmktgpsictechinfoarqtcontdentrrpppsiqgit-pagesritmedfieorgcomlibprieduaipgovriikmeactvsportorgmilcomscieunnetedugovnameinfopintouchtawktotawkmyspreadshoporgcomnomgobedu123miwebcomputeorgcomnetedugovbiznameinfocognito-idptransfer-webappeusc-de-east-1onjelasticnxaspdnsbarsydirectwpdeuxfleurstransurldogadoprvwcloudnsamazonwebservicesdnshomeuserpartycokoobinmkmfidymyspreadshopalandkapsiikixn--hkkinen-5wacloudplatformh\xE4kkinen123kotisivuidacorgmilcompronetedugovbiznameinforadioorgcomneteduuserexperts-comptablestmmyspreadshopgretaprdcomnomynhccifbxoshuissier-justicenotairesaeroportfreeboxoson-webavocatassoportgouvkdnschirurgiens-dentistes-en-franceavouesfbx-os123sitewebveterinairechirurgiens-dentistespharmacienchambagrimedecinfreebox-osdediboxgoupilemszicpyicpvicppleysheezypagesedugovcnpyorgcomcybllcpvtnetedugovtnxonlineschooldaemond6atcopanelorgnetplybotdashstackitkaasorgmilcomnetedugovbizmodltdorgcomedugovcoorgcomneteduappwriteacorgcomnetedugovcloudtranslateusercontentorgcomnetedumobiassoorgcomnetedugovbarsysimplesitediscourseindorgmilcomgobneteduorgcomwebnetedugovguaminfonxhra\u6559\u80B2\u654E\u80B2\u7DB2\u7D61\u7F51\u7D61\u7EC4\u7E54\u7D44\u7E54\u7F51\u7EDC\u7DB2\u7EDC\u7EC4\u7EC7\u7D44\u7EC7\u516C\u53F8\u653F\u5E9C\u500B\u4EBA\u4E2A\u4EBA\u7B87\u4EBAltdorgcomincneteduidvgovxn--uc0ay4axn--55qx5dxn--mk0axixn--io0a7ixn--uc0atvxn--zf0avxxn--lcvr32dxn--od0algxn--wcvs22dxn--gmqw5axn--od0aq3bxn--mxtq1mxn--ciqpnxn--tn0agxn--gmq050iorgmilcomgobneteduiservwp2tempurlmircloudfreesitewpmudevmyfastgadgetcloudaccessjelehalfboltfastvpsemergenteasypanelopencraftizcombrendlynamefromrtpersoadultmedorgpolrelcomproartnetedufirminfoassoshopcoopgouvtmcomediahotelforumvideosportorgsexagrargameslakaseroticaerotikatozsdereklamcasino2000filmsuliinfoboltshopprivnewsszexcityutazasjogaszkonyveloingatlaneacaicogoormy\u1B29\u1B2E\u1B36milwebschnetkopbizzonedesaponpesxn--9tfkymyspreadshopgovmytabittabitorderravpageaccok12idforgnetgovmuniltdplcaccotttvorgcomnetmeca6g5gpgamubacaicniocoukuptverdruscsdelhiindorgmilcomwebnicfingenpronetintedugovresbizbiharbarsyinternetbusinessschooltravelsupabasealumnigujaratfirminfoaeropostbankcoopindevscloudnsno-ipbarsybarrell-of-knowledgebarrel-of-knowledgensupdategroks-thisdnsupdatefor-ourknowsitalldvrcammittwalddynamic-dnsv-infowebhopselfipdyndnshere-for-moreilovecollegemayfirstforumzcloudnsmittwaldservertypo3servergroks-theeusekd1cdndyndnsidrawsainaueuapjpusstagemocksysdevicesclientcustreservdcustdevdisrecprodtestingcobeebyteutwenteboxfusebravepstmndedynngrokorgmilcomnomnetedugovqcxqzzbarsythingdustmo-siemensrb-hostingfh-muenstergitbookbluebitecloudbeesusercontentnodeartkiloappsforgerockdarklangresinstagingapigeebubbleb-datascryptedhypernodedappnodepantheonsitegitlabgithubkeeneticvirtualservercleverappshostyhostingon-rioedugitticketstelebitwixstudioon-k3sicp0icp12038jeleqotolairbubbleappsmyaddrstolosmyrdbxwebflowdrive-platformbeagleboardhasura-applolipopdefinimavaporcloudmusicianwebflowtestazurecontainerresindevicereadthedocsloginlineeditorxmoonscalesandcatsbasicserverwebthingsbrowsersafetymarkbeebyteappbitbucketidaccovistablogorgschnetgovxn--mgba3a4f16axn--mgba3a4fraarvanedge\u0627\u064A\u0631\u0627\u0646\u0627\u06CC\u0631\u0627\u0646jclaspeziapdudcefegelemeperetevebacanatavaparasabgagfgogrgpgalclblimfmrmcbmbvbfclcmcvcrcpcchlimifibicivipirisimncnbnanenrnpntnnolomobocoaogorosopotoptvtatctbtmtltotpusulunutpspapaqsvpvvvtvavvrtrsrprgrfrcrbrarorkrvstsssbscsmsispzczbzbozen-suedtirolmyspreadshopxn--bulsan-sdtirol-nsbxn--valledaoste-ebbtrentinoaltoadigetrentin-sued-tirolxn--forlcesena-c8axn--forl-cesena-fcbxn--bozen-sdtirol-2obtriestetrentinsuedtiroltrentino-s-tirollecceudineaostesienaparmaluccapaviagenoapaduaaostamonzaabruzzoternirietiturinmilanbozenlaziofermoleccocuneonuoropratola-speziavdataaligfvgpugmolcalcamlomumbsicpmnvenvaoedugovabrsarmaremrbastoslazibxosfirenzetrentinos\xFCdtirolval-d-aostavalle-aostamessinacremonaravennatoscanatrentin-suedtirolbolognacalabriaurbinopesarofriuli-v-giuliaogliastraxn--valle-aoste-ebblaquilaandriatranibarlettasyncloudxn--valle-d-aoste-ehbaostavalleyvalled-aostatrentino-alto-adigevallee-d-aostexn--balsan-sdtirol-nsbpistoiasicilialucaniacataniaiserniaperugiabresciaveneziagorizialiguriaimperiabulsan-suedtirolbalsan-suedtirolbarlettatraniandriaxn--trentino-sdtirol-szbforl\xEC-cesenatuscanyvall\xE9e-d-aostemantovavall\xE9e-aostecasertapiemontevalleaostaval-daostafriulivgiuliatrevisoforli-cesenavall\xE9edaosteferrarapescaravald-aostatrentino-altoadigefriuli-vegiuliavallee-aostecarboniaiglesiastarantomediocampidanovalleedaostetrentinosud-tirolcampobassotrentins\xFCd-tiroltrentinos\xFCd-tirolmonzabrianzatrentino-s\xFCdtirolxn--trentino-sd-tirol-c3bpotenzacosenzavicenzaemiliaromagnavenicefrosinonemarchepordenonetrentinosued-tirolvaresemolisevall\xE9eaostefriuli-veneziagiuliabasilicatalatinaanconasavonaveronamodenabiellabolzano-altoadigepugliafoggiaumbriatrentino-stirolgenovapadovamateranovararagusapiacenzatrentinostirolvalleeaostetempio-olbiasudsardegnatrentinsudtirolmassa-carrarafriuliveneziagiuliatrentinosuedtirolandria-barletta-tranitrapanixn--cesenaforl-i8amaceratacaltanissettaascoli-picenobrindisicarraramassacagliaririmininapolivibo-valentiachietibulsan-sudtirolbalsan-sudtiroltrentino-a-adigebulsanbalsaniglesiascarboniamilanotorinoteramodell-ogliastraarezzotrentinoalto-adigerovigotrentovenetoiglesias-carboniatrentino-sud-tirolaltoadigereggio-emiliareggio-calabriasardegnatranibarlettaandriapiedmontxn--sdtirol-n2amedio-campidanotrentino-s\xFCd-tirolfriuli-vgiuliafriuli-ve-giuliaromeennaromapisa32-b16-b64-blodiastibarineencomonaplesforlicesenailiadboxosalessandriasicilytrani-barletta-andriaxn--trentin-sdtirol-7vbpesarourbinotrentinsued-tirolcesena-forliforl\xECcesenaemilia-romagnamonzaebrianzaxn--trentinsdtirol-nsbtrentinos-tiroltrentins\xFCdtirolvalledaostaolbia-tempiocampidanomediovibovalentiasassarivalle-daostalombardysud-sardegnafriulivegiuliareggioemiliamonzaedellabrianzaalto-adigevercellitrentin-sudtiroltraniandriabarlettatrentino-sudtirolascolipicenobozen-s\xFCdtirolfriulive-giuliaflorencexn--cesena-forl-mcbcarbonia-iglesiasaosta-valleycarrara-massadellogliastratrentinoa-adigexn--valleaoste-e7apesaro-urbinoxn--trentinosdtirol-7vbxn--trentin-sd-tirol-rzbxn--trentinsd-tirol-6vbtrani-andria-barlettatrentin-s\xFCd-tirolxn--trentinosd-tirol-rzbgrossetomonza-e-della-brianzas\xFCdtirolreggiocalabriatrentinoaadigetrentin-s\xFCdtirolverbano-cusio-ossolafriuliv-giuliaverbaniacampaniatrentino-aadigefriulivenezia-giuliasardiniaandriabarlettatranibarletta-trani-andriacatanzarooristanourbino-pesarocesena-forl\xECvalle-d-aostacampidano-medio123homepagesiracusatempioolbiasuedtirollombardiaavellinocesenaforl\xECtrentinofriuli-venezia-giuliabozen-sudtirolandria-trani-barlettabulsan-s\xFCdtirolbalsan-s\xFCdtirolmonza-brianzabolzanotrentino-sued-tirolbellunosalernolivornocrotonesondriodnshometrentinsud-tirolmassacarraratrentin-sud-tiroltrentino-suedtirolviterbobergamocesenaforliolbiatempiopalermobeneventoagrigentoofcoorgnetfmaitvphdengorgmilcomschnetedugovperagrikanieasukehandachitatokaiaisaikonanoharuamaobuhigashiuraowariasahiinuyamatobishimaiwakurashitarainazawatoyonegamagorimihamatoyotataharakariyayatomioguchikomakimiyoshinishiotokonamekiyosuchiryutoyohashiokazakiisshikikasugaikotakiratoeianjotogofusosetohazutsushimashinshirotakahamanisshinshikatsuhekinantoyokawaichinomiyatoyoakeodateogataakitaikawakyowahonjoogayurihonjonoshirokamiokakatagamimitanegojomeyokotekosakadaisenkazunonikahohonjyomoriyoshimisatohappoukamikoanihachirogatahigashinarusesembokufujisatokitaakitaitayanagiowanitakkomutsutsurutahirosakigonoheoirasetowadamisawanohejiaomorishingohiranairokunohehashikamitsugarushichinohehachinohenakadomarisannohekuroishisakaeisumiasahiotakiinzaiabikomatsudoyachiyomutsuzawakujukuriomigawakashiwatoganemihamanaritasakuranagaramobarahanamigawachoshishiroichoseikozakishisuikatorimidorichonankyonanfuttsuonjukufunabashinagareyamanodasosatakochuotohnoshourayasukimitsuyokaichibayotsukaidosodegauratateyamakamagayayokoshibahikariyachimatakatsuuratomisatokisarazukamogawaichikawanarashinoichinomiyashimofusaminamibososhirakoichiharaoamishirasatoikatahonaiainansaijoseiyoiyoozuuwajimaniihamanamikatamasakiuchikokihokutobetoonshikokuchuomatsuyamaimabarikamijimakumakogenyawatahamamatsunosabaeikedaobamasakaifukuiohionotsurugamihamawakasaminamiechizeneiheijikatsuyamatakahamaechizensoedaukihaomutaokawanishiogoribuzenonojosueumiokiotochikugosasagurisaigawamizumakishinyoshitomikurumekurateyamadakasuganakamamiyamanogatatakatahakataiizukakawaratagawakasuyaashiyainatsukimunakataminamitsuikishonaikurogifukuchikeisenhigashimiyakoshinguyukuhashiokagakiyamekogaongausuikahotohochuotoyotsumiyawakadazaifuhisayamatachiaraiyanagawanakagawahirokawachikujochikushinochikuhochikuzennamieotamaokumashowateneiiwakikoorinangoononishigoshimogoomotegomishimafukushimaasakawakagamiishishirakawaiitatefutabahiratayugawahanawakitakatakawamatakunimiyabukibandaihigashihironoyamatomiharuyamatsuriaizubangedatesomaaizuwakamatsuyanaizuaizumisatonishiaizuizumizakikitashiobarataishinkaneyamakoriyamainawashirotanagurafurudonosamegawasukagawaishikawatamakawaikedaogakitaruiginanenahashimahichisonakatsugawaibigawashirakawamizunamiminokamomitakekawauesekigaharatomikasakahogikitagatayamagatatajimianpachimotosuyaotsukakamigaharahidakanisekitokigujominogodoyorogifukasamatsutakayamawanouchihigashishirakawakasaharashimonitatsumagoichiyodakannakanrashowameiwakiryuotaoratomiokafujiokaitakuranaganoharahigashiagatsumatakasakishibukawaminakamikatashinatsukiyonokawabanumataannakaoizumimidorishintoisesakiuenoyoshiokakusatsutakayamanakanojonanmokutamamuratatebayashimaebashiotakekaitadaiwahongofuchukuietajimashobaramiharahatsukaichihigashihiroshimamiyoshikumanokurenakasakaseraseranishiasaminamifukuyamashinichionomichiosakikamijimajinsekikogentakeharaotobenanaeikedatohmaozoraobiraabirakyowaeniwataikibibaisharirebunerimohiroooketootarupippunishiokoppechitosefurubirahakodateshiranukakitahiroshimakushiroobihironanporoiwamizawaniikappukunneppufukushimanakasatsunaitoyourakuromatsunaiakabirakamisunagawashibechaurakawakamifuranonakatombetsuasahikawashimokawakayabeokoppebiratoriabashirisaromaatsumanumatahidakabifukamukawamikasahorokanaitoyotomisarufutsuhigashikawaishikarikitamiyoichiesashiiwanaitomariminamifuranoakkeshifuranotoyakoyakumootoineppushikaoishiraoinemuronayorohaboroashorobihororishirifujiutashinaihokutotakasuebetsuurausuassabukikonaishimamakinaiedatetoyabieinikiesanuryuoumuteshikagarikubetsuashibetsukimobetsuaibetsutobetsusobetsuembetsushimizuchippubetsurishirihokuryuhoronobeshintokutsubetsushibetsuhonbetsumombetsutsukigatakuriyamakoshimizushiriuchikutchanmurorannoboribetsukamishihorowassamushinshinotsukembuchiwakkanaikamoenaikiyosatotakinoueshikabesunagawafukagawanakagawatakikawakamikawahigashikagurahamatonbetsumatsumaemoseushirankoshishakotanimakanemashikeotofuketomakomaisandatambaitamiawajikasaiasagoshisoonoakoyashirotoyookaminamiawajiinagawafukusakitakasagokamigorikasugaharimayokawaashiyahimejiakashitaishiaogakisannantakinosumototakarazukanishinomiyashingugoshikinishiwakiyokatakaaioimikisayoyabukawanishiamagasakisasayamashinonsenkakogawaichikawakamikawatatsunotsukubaiwamaogawaasahisakaitokaioaraiitakobandodaigosuifuinaamikasumigaurakashimaomitamayachiyoshimodatetomobetoridehitachinakainashikisakuragawakasamayawaramoriyahitachiomiyanamegatayamagatahitachikamisuushikutakahagiibarakitonekoganakasowayukimihojosomitoryugasakishimotsumafujishirotsuchiurachikuseihitachiotashirosatotamatsukuriuchiharashikahakuinanaotsubatawajimakahokukawakitatsurugikaganominotosuzuuchinadakomatsuanamizunakanotohakusannonoichikanazawaiwateshiwafudaikawaimoriokaofunatohanamakikuzumakikitakamininohekunoheyamadayahabasumitaichinosekitanohatahiraizumirikuzentakatajobojiotsuchihironomiyakoiwaizumikarumaiichinohenodakujitonooshushizukuishifujisawamizusawakamaishikanegasakimannoutazukotohiraayagawazentsujihigashikagawauchinomikanonjisanukimarugamemitoyotakamatsutadotsunaoshimatonoshoakuneamamiizumihiokiyusuikinkoisasookouyamanakatanekagoshimakanoyaisenkawanabeminamitanemakurazakitarumizunishinoomotematsumotosatsumasendaioimatsudaayaseebinamiurazushinakaiodawaraiseharasagamiharahakoneaikawakaiseiatsugitsukuihadanoyamatoyamakitazamaoisochigasakininomiyayokosukakamakuraminamiashigarafujisawasamukawakiyokawahiratsukayugawaraokawaumajikochitsunootoyoakiinonishitosayasudahidakamiharasakawaniyodogawahigashitsunokagamigeiseisusakiotsukinaharisukumomurototosakamiochitoyotosashimizumotoyamanankokunakamurakitagawayusuharaogunichoyoukiasoutoozugyokutoamakusamifunetakamoriyamagaminamataminamiogunikikuchisumotoyamatonagasumashikiaraokumamotokamiamakusanishiharayatsushiroayabeseikasakyoideineujinakagyokameokakyotangokyotanabekyotambaminamiyamashiroyamashinatanabeyawatawazukaminaminantanmiyazuhigashiyamafukuchiyamakitamukokamojoyokizumaizuruujitawaraoyamazakinagaokakyokumiyamakawagoeinabeshimameiwaasahitaikiudonoisetsukisosakikuwanamihamamiyamasuzukatamakimisuginabarikumanokomonominamiisewataraitobakiwatakikihotadomatsusakayokkaichikameyamaureshinoishinomakishichikashukuohirataiwaosakizaohigashimatsushimashikamaiwanumashibataogawaraonagawakawasakiseminemarumoriminamisanrikukakudamuratawakuyatomiyanatoriwataritagajomisatotomekamirifushiroishimatsushimayamamotoshiogamafurukawahyugaebinotsunosaitoayakushimanobeokakitauramiyazakitakazakigokaseshiibamimatashintomikunitomikitakatakobayashikawaminamitakaharukijotakanabemiyakonojonishimeranichinankitagawakadogawamorotsukakisofukushimaminamimakisakaeobuseikedaogawamiasaokayaasahiotakiotarichinoinaomichikumakomaganechikuhokukaruizawayasuokaooshikaikusakaminamiaikitogakushimatsukawakawakamitateshinatakamorikitaaikishiojirimiyadahakubaiizunaiijimaiiyamamiyotasuzakayasakatoguraookuwanagawaminowahirayayamagataminamiminowafujimiomachisakakitakaginaganonakanosakuhokomoronagisoshinanomachiwadauedaiidaharasuwatomiachiaokianankisosakunozawaonsenagematsutakayamashimosuwamatsumotoyamanouchinakagawamochizukiazuminotatsunoobamaomuraseihiunzenosetofutsuikichijiwanagasakiisahayahasamisaikaikawatanasasebohiradokuchinotsugototogitsutsushimashimabarashinkamigotomatsuurayamazoekashibaikomakawaitenrioyodosangokoryoudaojiikarugayamatokoriyamatenkawakatsuragikurotakikawakamimiyakemitsuetakatorikamikitayamayamatotakadahegurishinjokanmakisakuraitawaramotogoseoudanarasoniandokawanishishimoichihigashiyoshinokashiharashimokitayamanosegawayoshinomintsivorytopazsakuragehirnsumomoaseinetopalmail-boxmokurenyoitamuikaojiyagosensanjoaganomyokoseiroagaomishibataniigatanagaokamurakamiuonumayuzawakariwatagamitainaitsunanminamiuonumatochioyahikojoetsuseiroukamosadoizumozakitokamachiitoigawasekikawakashiwazakitsubamemitsukekokonoesaikiusukibeppuusahimeshimakunisakihasamataketatsukumihitaoitahijikusuyufukujukamitsuebungoonobungotakadaibaraniimibizentsuyamaokayamakasaokahayashimayakagemaniwaakaiwamisakishinjotamanotakahashikibichuowakesojanagishookumenannishiawakurakurashikiasakuchisetouchikagaminosatoshotomigusukunakagusukuyaeseizenaurumaiheyaaguniogiminanjokinminamidaitokitanakagusukuyonaguniokinawaishigakikunigamiurasoekadenataramahiraraginozataketomishimojizamamitonakiitomanhigashimotobuyonabarugushikamionnanahanagohaebarukumejimakitadaitonakijinnishiharayomitanginowantokashikiishikawaikedasuitaminohizuminishisakaikananabenodaitoosakasayamayaokishiwadatadaokakaizukatondabayashichihayaakasakakumatorikadomasayamahigashiosakashijonawatehirakatataishimisakitajirihannansennankatanotoyonominatosettsuhigashiyodogawaibarakinosekitachuohigashisumiyoshifujiiderakashiwaraizumiotsutoyonakamatsubaramoriguchiizumisanoshimamototakatsukineyagawahabikinotakaishikawachinaganoyoshinogarikamiminearitaouchiimarihizenogikashimaariakekiyamafukudomikitagatakitahataomachigenkaikanzakinishiaritakyuragisagataratosutakushiroishikaratsuhamatamakouhokukawagoeyoshidasatteogoseirumaasakaurawaogawaniizaomiyayoriiotakishikihonjooganohannohanyuinasaitamaokegawaarakawayoshikawayokozehasudasayamahidakafukayachichibuiwatsukiryokamiyoshimikamiizumifujimiwarabiranzanmiyoshiminanoyashiosakadosugitomisatohigashichichibutodasokakukiyonokazoshiraokakasukabekounosukawajimatsurugashimamiyashirokitamotohatoyamamoroyamahatogayakumagayakawaguchinagatorokamisatomatsubushinamegawatokigawakamikawafujiminohigashimatsuyamakoshigayatokorozawas3isk01isk02ryuohkoseikonanaishorittotakashimamaibarahikonetorahimenishiazaikokagamokotoyasuotsukusatsunagahamamoriyamatoyosatotakatsukinotogawaomihachimanhigashiomiakagiunnanizumogotsuamayatsukakakinokimatsuehamadamasudahikawahikimiokuizumoyasugiyakumomisatotamayuohdahigashiizumookinoshimanishinoshimatsuwanoshimaneshimadafujiedayoshidashimodagotembaiwataatamikosaiyaizuitoizumishimahaibaramakinoharaomaezakikawanehonkannamisusonohigashiizufukuroinumazukawazufujiaraishizuokahamamatsushimizuizunokunimatsuzakimorimachiminamiizunishiizukikugawakakegawafujikawafujinomiyaujiietsugaoyamayaitaohiranikkoashikagakuroisokanumasakurashioyakarasuyamamotegiichikaikaminokawatochigihagamokanogisanobatonasumibunasushiobaranishikatautsunomiyaiwafunemashikoshimotsukeohtawaratakanezawaitanokomatsushimatokushimaichibaminamiaizumiwajikikainanmiyoshinarutomimamugiananmatsushigesanagochishishikuinakagawamachidachiyodakomaefussainagitaitochofufuchuomeotahigashiyamatotoshimaokutamaaogashimakodairaedogawaarakawahachiojishinagawatachikawashibuyasuginamihinodekiyosesumidaoshimanerimamitakahamuraadachinakanomizuhobunkyomegurominatokoganeihigashikurumekokubunjihigashimurayamamusashimurayamatamakitahinochuokotokatsushikakouzushimaogasawaraakishimakunitachishinjukusetagayamusashinohachijoitabashiakirunohinoharachizunanbukotouramisasawakasayonagokogehinoyazutottorinichinansakaiminatokawaharaoyabetairainamiasahinantoimizufuchutakaokakurobeyamadajohanatoyamatonaminyuzenfunahashinakaniikawanamerikawaunazukitogahimiuozufukumitsutateyamakamiichiiwadearidayuasainamitaijikatsuragiaridagawatanabemihamahidakakainankiminomisatoshingushirahamakamitondayurakozakoyagobokitayamawakayamakudoyamahashimotokushimotokozagawahirogawakinokawanachikatsuurarsuseroeoishidasagaeoguniasahinagaitendonanyoobanazawanishikawasakataohkuratozawamikawamamurogawayamagatafunagatatakahatashonaishinjokahokuiideyuzakawanishitsuruokakaminoyamayamanobeshiratakamurayamanakayamakaneyamahigashineyonezawasakegawamitouubeyuuabushimonosekitabuseoshimatoyotaiwakunihikarishunannagatohagihofukudamatsutokuyamashowadoshitsurunanbukoshukaiminami-alpsnirasakikosugeotsukioshinohokutominobuyamanashifuefukichuokofuichikawamisatoyamanakakonakamichitabayamanishikatsuranarusawafujikawahayakawafujiyoshidafujikawaguchikouenohara\u9577\u91CE\u4EAC\u90FD\u5C90\u961C\u5927\u962A\u4E09\u91CD\u7FA4\u99AC\u5343\u8449\u6ECB\u8CC0\u4F50\u8CC0\u5948\u826Fadednelgaccogogror\u79CB\u7530\u611B\u77E5\u9AD8\u77E5\u57FC\u7389\u6C96\u7E04\u6803\u6728\u718A\u672C\u5CA9\u624B\u9752\u68EE\u5C71\u68A8\u65B0\u6F5F\u5CF6\u6839\u9CE5\u53D6\u9577\u5D0E\u9999\u5DDD\u5BAE\u57CE\u77F3\u5DDD\u5927\u5206\u5BAE\u5D0E\u8328\u57CE\u5C71\u53E3\u5175\u5EAB\u5C71\u5F62\u5FB3\u5CF6\u5E83\u5CF6\u798F\u5CF6\u798F\u5CA1\u5CA1\u5C71\u5BCC\u5C71\u9759\u5CA1\u611B\u5A9B\u798F\u4E95\u6771\u4EACxn--4it168dhatenadiaryxn--vgu402ckawaiishophatenablogcocottenamaste\u5317\u6D77\u9053penneehimeiwateversestabachibashigagonnagunmapermahaccaakitaosakauh-ohblushkochiaichifukuikuroncapooitigohyogotokyokyotopunyuthickcheap0t00g00j0mie2-ddaapyawjg0amfemsubxiiboomoobutchueekpgwrgrherskrboyrdyupperunderflierchipsmydnsheavyangryhippygirlyrulez\u795E\u5948\u5DDD\u9E7F\u5150\u5CF6\u548C\u6B4C\u5C71bambinaxn--nit225kokayamasaitamaxn--k7yn95exn--1lqs03nsapporoparasitelolipopmcxn--efvn9sniigatafukuokatokushimafukushimahiroshimakagoshimafakefurokinawaxn--8pvr4ucoolblogxn--0trq7p7nnkawasakinagasakimiyazakichilloutxn--8ltr62kxn--klty5xpeeweezombiecutegirlxn--rny31hxn--uuwu58axn--ntso0iqx3axn--djrs72d6uytoyamanikitanyantakagawamimozanagoyaboyfriendxn--2m4a15egreaterchowderegoismyamagatafashionstorexn--elqq16hxn--pssu33lsendaimiyagixn--rht27zpecoriaomorisaloonwatsonvivianxn--djty4knobushipigboatnaganopinokoxn--f6qx53asadistvelvetsecretxn--5js045dchicappayamanashiibarakidigickgirlfriendxn--1lqs71dmongolianxn--c3s14mxn--qqqt11mtochigixn--5rtq34kparallelo0o0mondkobesagabonadecaoitanarafoolkilldecimainhiholomosblokilociaoundopupugifutankcrapflopnooroopsmodsholyjeezstripperpepperbittershizuokaxn--rht3dkitakyushureadymadeicurusversusmatrixxn--rht61ehungryfloppygloomycrankyhandcraftedlittlestarxn--klt787dxn--kltx9awhitesnowsunnydaytottorilovepoptheshopbuyshopxn--5rtp49cxn--d5qv7z876cwebaccelxn--kbrq7oxn--4pvxsxn--1ctwolovesickkumamotocatfoodxn--tor131oyokohamawakayamatonkotsuxn--ehqz56nxn--uist22hxn--6btw5axn--kltp7dyamaguchifrenchkisspussycatxn--4it797kxn--uisz3gbabybluexn--zbx025dnetgamersxn--7t0a264ckanagawaxn--6orx2rishikawaxn--ntsq17ghalfmoonschoolbusjellybeanxn--mkru45iusercontentlolitapunkxn--32vp30hsakurastoragehokkaidoshimanecandypopbabymilksupersaleweblikeraindropbackdropwebsozaikikirarahateblodaynightmeneacsccogoormobiinfoaeusxxorgmilcomnetedugovorgcomnetedugovbizinfotmprdorgmilcomnomedugovassnotairespresseassocoopgouvveterinairemedecinpharmaciensorgnetedugovtraorgcomedurepgovmeneperekgacscaiiocogoitoresmshsseoulbusanulsandaeguc01milvkimmvchungnamjeonnamjeonbukeliv-dnsgyeonggijejueliv-cdnincheondaejeongangwongyeongbukgwangjuchungbukgyeongnameliv-apicoeduindorgcomembnetedugovorgmilcomnetedugovjcloudorgcomnetintedugovperbnrinfocooyorgcomnetedugovethipfscanvamypepethw3sstorachakeeneticjoinmcinbrowserdwebcyonnftstoragemyfritzaemewphlxachotelltdorgcomwebsocschngonetintedugrpgovassnomgacsccoorgnetedugovbizinfo123websiteidorgmilcomasnnetedugovconfidmedorgcomplcschnetedugovaccoorgnetgovpresstmassoirseproxaccosoundcasthoptocraftvp4c66orgnetedugovitsmcdirmyboxbarsyedgestacksynologylogintoopencloudnohostwebhopdiskstationi234tcp4hoocgroknoipprivmydsddnsdnsforlohmustransipdscloudfilegear-sgbrasiliafilegearframerbarsybarsyonlinecoprdorgmilcomnomedugovinforgcomnetedugovnameacprorgcomartnetedugovpresseinfoassoinstgouvorgnycedugovbarsydscloudjuorgcomnetedugovminisiteaccoororgcomnetgovorgmilcompronetintedugovbizmuseumnameinfoaerocoopaccoorgcomnetintedugovbizcooporgcomgobneteduorgmilcomnetedugovbiznameaccoorgmilneteduadvgovcoorgcomnetaltgovforgotherhiskeeneticispmanagernomassoprod5476132eastasiacentraluswesteuropewestus2eastus2pnortheurope-01newzealandnorth-01southindia-01southcentralus2-01norwaywest-01eastus2-01westus2-01australiaeast-01italynorth-01israelnorthwest-01swedencentral-01westeurope-01centraluseuap-01taiwannorthwest-01uaecentral-01northcentralusstage-01israelcentral-01mexicocentral-01canadacentral-01austriaeast-01germanywestcentral-01francecentral-01ukwest-01denmarkeast-01polandcentral-01eastus-01westus-01swedensouth-01eastus3-01westus3-01brazilsouth-01centralus-01francesouth-01australiacentral-01westindia-01uaenorth-01jioindiacentral-01canadaeast-01belgiumcentral-01spaincentral-01koreacentral-01chilecentral-01qatarcentral-01westcentralus-01eastus2euap-01norwayeast-01southafricanorth-01brazilsoutheast-01germanynorth-01switzerlandnorth-01switzerlandwest-01japanwest-01southafricawest-01japaneast-01eastasia-01indiasouthcentral-01taiwannorth-01centralindia-01uksouth-01southcentralus-01northcentralus-01eastasiastage-01indonesiacentral-01australiacentral2-01australiasoutheast-01malaysiawest-01koreasouth-01southeastasia-01southeastus5-01northeastus5-01jioindiawest-01rucdnwest1-usfra1-desandboxjls-sto1jls-sto3jls-sto2aglobalabglobalsslmapprodfreetlsmapvpslon-1lon-2ny-1fr-1sg-1ny-2paassnwebpaashostingjelasticnordeste-idcsocuserpagescwebfileblobservicebuscoreatlricnjsjelasticwebsitestoragesezagbinruhuukjptsmyspreadshopmynetnameakamaiorigin-stagingfrom-coipv64dynv6cdn77serveblogadobeaemcloudhicamsprytdnsupno-ipownipde5ovhicpfirewall-gatewaysytesmypsxbarsyusgovcloudapimyamazemyradwebakamaihdsaveincloudfastlylbfrom-lasubsc-paysquare7in-the-bandblackbaudcdnhomelinuxoninfernoctfcloudservebbsdns-dynamiccloudfrontakamai-stagingipifonyham-radio-opsenseeringclickrisingcommunity-profrom-nylocalcertgrafana-devedgesuite-stagingcloudflareanycasteating-organicatlassian-devmydattofeste-iplocaltotorprojectknx-serveredgekeycloudflareglobalcloudyclustercasacamserveftpakamaized-stagingakamaiorigindns-cloudmyeffectboomlabotdashbuyshousestwmailhetemlazure-mobilein-dslthruhereredirectmedynuddnsbouncemesupabaseluyanicloudappakamaicloudfunctionsdebiannhlfanpgafanstatic-accessin-vpnmysynologymafeloappudohomeftptrafficmanagersiteleafseidatmemsetcloudflarecloudaccesskeyword-onazure-apiis-a-chefdoes-itgets-itwebhopselfiphomeipkicks-assedgesuitewindowsserver-ontunnelmolemydissentscrapper-sitecloudflarecnuni5srcfggffiobbzabchrsndenodynuopikddnsvpndnsakadnselastxkinghostvps-hostfastlyhomeunixazureedgeshopselectdontexistmyfritzcloudjiffyalwaysdatasells-itsquaresbroke-itazurefddattolocalat-band-campmeinforumfamilydsazurestaticappsdefinimabplaceddnsaliasdynaliasnow-dnsblogdnsroutingthecloudendofinternetdsmynasakamaiedgemymediapcadobeio-staticakamaiedge-stagingakamaihd-stagingddns-ipprivatizehealthinsurancelive-onkrellianschokokeksmassivegridmysecuritycamerarackmazeserveminecraftfrom-azis-a-geekakamaizedmoonscaleoffice-on-theusgovtrafficmanageradobeioruntimeedgekey-stagingreserve-onlinechannelsdvrdnsdojousgovcloudappcdn77-sslapps-1and1podzoneazurewebsitesdynathomescaleforceyandexcloudvusercontentisa-geekcdn-edgescoaemalcesappwriteazimuthtlonarvobuiltwithrocketnoticeablestorecomwebrecnetperotherfirminfoartslgdloncogoiltdorgmilcolcomplcschgenngonetedugovbiznamefirmmobiacincoorgmilcomnomwebgobnetintedubizinfocomyspreadshopdemongovtransurl123websitehosting-clusterkhplaycistrongsnesosvalerv\xE5lerxn--vler-qoaossandeheroysandeher\xF8yb\xF8boheroyher\xF8yxn--hery-iraxn--b-5gavalerb\xF8boxn--b-5gasandesandexn--hery-iraxn--vler-qoav\xE5lerh\xE5re\xE5laahavaofsfvfhlolnlalrlhmfmtmahcostntbu\xE5strmreigersundmyspreadshopg\xE1ls\xE1eidsvolltingvollgildeskalflor\xF8vads\xF8vard\xF8vanylvenxn--bhccavuotna-k7astrandaxn--kvnangen-k0axn--sknland-fxaxn--mosjen-eyarakkestadhyllestadnannestadvevelstadvaapstenordre-landsondre-lands\xF8ndre-landtjieltexn--vrggt-xqads\xF8r-aurdalsor-aurdalheradstordmoldefordef\xF8rdeseljefedjeryggehemnexn--krehamn-dxasognegranes\xF8gnebrynetjomevallebykletokkegiskedovretj\xF8mehob\xF8lvoldasaudatolgas\xF8mnaviknad\xF8nnasomnadonnatranafrananesnaraumasmolatr\xE6nafr\xE6nalesjasm\xF8la\xF8rstaorstahitrafloraaukraloppafr\xF8yarissasnasahalsagalsaromsaraisar\xE1isafroyasn\xE5sagronghobolfjelltydal\xE5rdalardalaskimharamkraanghkekr\xE5anghkesorumbarumhurumb\xE6rums\xF8rummodums\xE1l\xE1tb\xE1l\xE1tfrognbjugnv\xE5ganvagangulenskienl\xF8tenlotenstrynvefsnxn--merker-kuaskaunsveiob\xF8mlobomloskj\xE5kvardoflorovadsosalatbalats\xE1latkl\xE6buklabuselbubarduulvikskjakkleppris\xF8rxn--nttery-byaefl\xE5eidflahofmilgolholsellomskifetvikdepvgsfhsaskerrisorhamarasnes\xE5snesr\xF8rosrorosxn--slat-5namasoynaroyvaroyluroydyroyaskoyradoyandoyrodoymeloyrad\xF8yand\xF8yr\xF8d\xF8ymel\xF8yask\xF8ylur\xF8ydyr\xF8ym\xE5s\xF8yv\xE6r\xF8yn\xE6r\xF8yhoylandeth\xF8ylandetdivtasvuodnal\xF8renskoglorenskognesoddtangenxn--tjme-hraxn--smla-hraxn--stjrdal-s1aunjargalillehammerunj\xE1rgaxn--hamary-fyadavvenjargaxn--bearalvhki-y4a123hjemmesidegjerdrumxn--brnnysund-m8acxn--tnsberg-q1axn--mlatvuopmi-s4axn--snsa-roaxn--skierv-utaxn--brum-voatysfjordkvafjordeidfjordkv\xE6fjordsongdalenmjondalenmj\xF8ndalenxn--gls-elackragerog\xE1\u014Bgaviikagangaviikas\xF8rreisasorreisas\xF8r-varangersor-varangerxn--risr-iraskiervaxn--frna-woaxn--trna-woakvinesdalleksvikleirvikr\xF8yrvikroyrviksvelvikvenneslaevje-og-hornnessandnessj\xF8enmarnardalvindafjordsandefjordenebakksnillfjordullensvangxn--trany-yuabr\xF8nn\xF8ysundnamsskoganaustevollxn--stjrdalshalsen-sqbnord-aurdalnord-frontr\xF8gstadtrogstadgrimstadflakstadgjerstadxn--sandy-yuaxn--leagaviika-52bnore-og-uvdalvegarsheixn--rlingen-mxaxn--ggaviika-8ya47hveg\xE5rsheikarlsoykvitsoymasfjordenhamaroyinderoyosteroydavvenj\xE1rgasauheradguovdageaidnuxn--vre-eiker-k8abronnoysiellakkr\xF8dsheradkrodsheradkvinnheradbr\xF8nn\xF8yxn--mtta-vrjjat-k7afxn--lrenskog-54akvits\xF8yv\xE1rgg\xE1tkarls\xF8yoster\xF8yinder\xF8yhamar\xF8ybronnoysundxn--aurskog-hland-jnbbahccavuotnab\xE1hccavuotnagiehtavuoatnastor-elvdalmidtre-gauldalxn--gildeskl-g0akarasjokevenassixn--bievt-0qaxn--yer-znalebesbynessebyxn--hbmer-xqamalselvm\xE5lselvxn--unjrga-rtam\xF8re-og-romsdalmore-og-romsdalhareidmeland\xF8rlandorlandstrand\xE5lg\xE5rdsolundalgardafjord\xE5fjorddielddanuorrikautokeinoxn--stre-toten-zcbskodjeaejriestangeliernebamblestokkefauskesn\xE5asesnaasekongsvingerlangevagberlevagxn--flor-jrahattfjelldalostre-toten\xF8stre-totenvestfoldxn--mely-ira\xE1laheadjualaheadjunordreisaxn--troms-zuaxn--lgrd-poacporsangerflatangerstavangerleikangerbremangersamnangergieldakarasjohkaxn--rdy-0nabfrostautsirasnoasatromsaxn--sr-aurdal-l8aflekkefjordj\xF8lsterjolsteraremarkhedmarkn\xE5\xE5mesjevuemienaamesjevuemiexn--vard-jrarollagmer\xE5kermerakerorskog\xF8rskogxn--bdddj-mrabd\xE1k\u014Boluoktaxn--osyro-wuaaknoluoktatrysilskjerv\xF8ymandaljondalbindalrindalmeldalsuldalorkdalsigdalalvdall\xE6rdalhurdalsirdalverdallerdallardaloppdal\xE5seralaseralhadselkrager\xF8divttasvuotnaoverhallasteinkjerxn--hnefoss-q1askedsmokorsettroms\xF8xn--dyry-iravestre-totenmuseumxn--sandnessjen-ogbrahkkeravjufylkesbiblb\xE1jddarbajddarxn--laheadju-7yarennes\xF8yxn--koluokta-7ya57hxn--hgebostad-g3aleirfjordstorfjordbalsfjordb\xE5tsfjordbatsfjordmuos\xE1tbiev\xE1tloab\xE1tk\xE1r\xE1\u0161johkan\xF8tter\xF8yxn--mjndalen-64anordkappl\xE1hppilahppialstahaugsiljanverranr\xF8ykenroykenhaldenlyngenbergenhortenh\xF8nefosshonefosstroandinbeiarnvarggatosoyroos\xF8yrotromsoidrettmuosatbievatruovatloabatvoagattynsetnessetxn--indery-fyask\xE1nitskanitraholtr\xE5holtxn--ystre-slidre-ujbandebusarpsborgbearduxn--karlsy-fyahordalandjorpelandj\xF8rpelanddeatnuringsakers\xF8r-odalsor-odalxn--slt-elabringerikeaudnedalnittedalnissedalhemsedalslattumsurnadalxn--blt-elabelverumstj\xF8rdalnaustdalhjartdalgj\xF8vikfyresdalhasviknarviklarvikgjovikmalvikgamviklenvikporsgrunnstjordalengerdaldrobakdr\xF8bakxn--msy-ula0hvestvagoyxn--vgan-qoaxn--ryken-vuaxn--lten-graxn--stfold-9xaxn--hpmir-xqaxn--lury-iram\xE1latvuopmimalatvuopmitysv\xE6rkirkenesbirkenesmoskenesb\xE1id\xE1rxn--fjord-lraxn--rdal-poabahcavuotnab\xE1hcavuotnaxn--frde-gralind\xE5sbearalvahkixn--hobl-irar\xE1hkker\xE1vjuxn--loabt-0qav\xE5g\xE5\xE1lt\xE1bod\xF8sundlundrader\xE5deetnetimeholeauregrueoddavagavegaranatanaarnasolasulaaltalekafusavangbergkvam\xE5mliamlibokntinnroangranosenoslobodor\xF8stroststat\xE5motamotivgupriv\xF8yeroyerliermossvossxn--nvuotna-hwalusterlunnermarkerh\xE1bmerhabmerhvalerfjalerxn--rholt-mratysvarbaidarfitjargaularh\xE1pmirhapmirmelhusfosnes\xF8ksnesoksnestysneshemnesevenesflesbergeidsbergtonsbergt\xF8nsberglindasxn--sndre-land-0cbnamsosxn--srum-gra\xF8ystre-slidreoystre-slidrevestre-slidretrondheimbalestrandxn--langevg-jxaaustrheimxn--skjk-soavagsoyaveroysandoykarmoyfinnoytranoyvestbytranbysykkylvenxn--hyanger-q1aspjelkavikandasuoloxn--fl-ziaxn--drbak-wuastathellexn--sr-varanger-ggbtelemarkxn--bhcavuotna-s4axn--porsgu-sta26f\u010D\xE1hcesuolocahcesuoloakrehamn\xE5krehamnsand\xF8ykarm\xF8yfinn\xF8ytran\xF8yv\xE5gs\xF8yaver\xF8ynamdalseidxn--lesund-huabadaddjaxn--vegrshei-c0axn--btsfjord-9zagildesk\xE5lporsanguxn--trgstad-r1an\xE1vuotnanavuotnahammerfestxn--sgne-graxn--brnny-wuacibestadharstadnarviikaeven\xE1\u0161\u0161ivestnesgjemnessandnesagdenesrennesoyxn--avery-yuaxn--tysvr-vrabearalv\xE1hkikongsbergspydebergrandabergxn--andy-iradavvesiidaxn--krdsherad-m8apors\xE1\u014Bgufredrikstadbjerkreimringeburennebuaurskog-holandnotteroyxn--vgsy-qoa0jxn--rmskog-byaskierv\xE1ivelandbyglandfrolandaurlandforsandxn--bjddar-ptamidsund\xE5lesundalesundfetsundfarsundovre-eiker\xF8vre-eikerakershusxn--moreke-juas\xF8rfold\xF8stfoldostfoldsorfoldh\xF8yangerhoyangerlevangerorkangertanangerxn--vestvgy-ixa6olillesandulsteinxn--rennesy-v1agranvinskjervoyxn--klbu-woalavagisxn--h-2faxn--ryrvik-byakafjordk\xE5fjordseljordfolkebiblxn--gjvik-wuajevnakerxn--kfjord-iuabudejjuxn--kranghke-b0axn--davvenjrga-y4axn--rland-uuaxn--ldingen-q1axn--mlselv-iuaxn--rady-iraxn--linds-prabrumunddalxn--ygarden-p1amo-i-ranaeidskogr\xF8mskogromskoghjelmelandxn--finny-yuaxn--sr-odal-q1axn--skjervy-v1aballangenkvanangenkv\xE6nangengratangenxn--hmmrfeasta-s4acvossevangensuohkanxn--rde-ulaxn--mli-tlaxn--ksnes-uuanordlandskanlandsk\xE5nlandsortlandfuoiskuxn--rros-graxn--hcesuolo-7ya35bxn--eveni-0qa01gagaivuotnag\xE1ivuotnaxn--seral-lradrammenmodalenmosjoenjan-mayentorskensteigengloppenxn--snes-poamatta-varjjatxn--sr-fron-q1aomasvuotnajessheimb\xE5d\xE5ddj\xE5xn--krager-gyaxn--kvfjord-nxaxn--asky-iraxn--snase-nraxn--bidr-5nacholt\xE5lenxn--vads-jraxn--jlster-byamosj\xF8enxn--rst-0nastavernxn--ostery-fyaxn--oppegrd-ixaxn--sknit-yqaxn--risa-5naoppeg\xE5rdskiptvetrendalenholtalenxn--mot-tlaxn--lhppi-xqaxn--holtlen-hxaxn--srreisa-q1akopervikxn--muost-0qaxn--bmlo-grahokksundkvalsundegersundxn--karmy-yuaullensakerxn--hylandet-54axn--kvitsy-fyaxn--bod-2nalangev\xE5gberlev\xE5gkristiansandxn--rsta-frahornindalstj\xF8rdalshalsenstjordalshalsensandnessjoenh\xE1mm\xE1rfeastaxn--lrdal-sras\xF8r-fronsor-fronnord-odalkristiansundm\xE1tta-v\xE1rjjatvestv\xE5g\xF8ynesoddennotoddenbuskerud\xF8ygardenoygardensalangenlavangenralingenr\xE6lingenlodingenl\xF8dingenlea\u014Bgaviikalaakesvuemieleangaviikauenorgexn--srfold-byaaskvollxn--rskog-uuaxn--nry-yla5gxn--vry-yla5ghammarfeastaxn--rhkkervju-01afxn--givuotna-8yakommunekrokstadelvanedre-eikerhagebostadh\xE6gebostadxn--berlevg-jxakviteseidxn--s-1faxn--l-1faxn--nmesjevuemie-tcbafuosskomo\xE5rekemoarekexn--lt-liacxn--jrpeland-54asvalbardoppegardholmestrandtvedestrandsogndalsokndalarendalsunndalfolldalxn--krjohka-hwab49jlyngdaletnedalnorddalsaltdalgausdalskedsmovaksdalgjesdalstordalxn--frya-hraaarbortedrangedalxn--smna-graaurskog-h\xF8landxn--vg-yiabtjeldsundhaugesundlindesnesxn--mre-og-romsdal-qqbxn--dnna-gradyntmpheremerseineshacknetenterprisecloudmineaccomaorim\u0101oriorgmilcriiwigennetschoolhealthkiwigovtgeekxn--mori-qsacloudnsparliamentcomedorgcompronetedugovmuseumwebsitekinservicebarsywebsitebuildereerobookheimdnsleapcelleero-stagetechcrscsslorigingohomecdbedeeeiemesecabgngilnlalplchfisiincnnoroptatitmtltruauhulumkdkukskjplvtrgrfrkrhrusesismycynzcznetinteduassoososcloudstgbetaaezaeuhkusjshatenadiarycdn77hoptozaptois-a-knightmyftpno-ipjpnddnssdpdnsspdnsbarsysweetpepperis-a-bruinsfanis-very-sweetservegameis-a-soxfanhomelinuxcdn77-secureservebbsmisconfusedwebredirectblogsitefreedesktopcouchpotatofriestoolforgeaccesscamis-lostreadmyblogsmall-webfedorapeopleserveftpis-a-celticsfanmywirepotagertwmailin-dslsellsyourhomeread-booksfreeddnscable-modemis-savednflfanufcfanmlbfanstuff-4-saleendoftheinternetin-vpnmy-firewallhomeftpis-localis-a-chefboldlygoingnowherewebhopselfipkicks-assroxatunkcamdvrfedoraprojectgotdnsdvrdnsdyndnspubtlspimientahomeunixdontexistfedorainfracloudwmflabsfspagesbmoattachmentsteckidsfamilydsdnsaliasdynaliasnow-dnscloudnsdoomdnsduckdnsblogdnshomednsroutingthecloudendofinternetdsmynasip-dynamicpoivronhttpbinmyfirewallis-very-evilmysecuritycamerais-a-linux-userwmcloudis-a-geektuxfamilyis-a-candidatedoesntexistis-very-badhobby-sitegame-hostaltervistais-foundis-a-patsfandnsdojohepforgepodzonedynservcollegefanis-very-goodfrom-meis-very-niceisa-geeknerdpolacmedsldingorgcomnomgobabonetedupleskaemhlxmyboxrockyprvcydeuxfleurspdnscodebergheyflowstatichostorgmilcomnomgobneteduorgcomeduiorgmilcomngonetedugovcloudns1337ngrokacorggogfamcomwebgobnetedugokgopgkpgovgosbizpasaugumicsopozpapuwmwsrprusiskwpspkppspkmpspokeoiawsawifoumsdnskokwpmuppuppsppiwwiwoowuzswkzoschrzpisdnwzmiuwwitdpssewsseumigugimoirmpinbwinbwiihupporzgwgriwupowwskrwioswuozstarostwokonsulattmpccopruszkowmyspreadshopostrodakartuzyopolegminamediaustkazgorajgoraolawailawalomzawloclradombytomjaworznotargilubinkoninzagantorunkutnokepnonakloczestsopotsanokturekplockslasksklepzarowlukowmedaidgdaorgmilrelcomnomatmgsmartneteduelkgovwawsossexbiztgorysejnytychypomorzeboleslawiechomesklepsdscloudunicloudzakopanelegnicarawa-mazbydgoszczswidnikkrasnikwloclawekbielawamragowograjeworealestatebeskidykaszubymalopolskaprzeworskswiebodzinlecznadfirmaszkolawarmiagdyniamiastakazimierz-dolnymalborkswidnicadlugolekaostrolekapodlasieelblagtravelsimplesitezachpomormielecszczecinnieruchomosciwalbrzychlezajsklublinbedzinpoznanwielunmielnooleckostarachowicedkontopowiatwroclawrybniksuwalkileborkslupskgdanskostrowwlkptarnobrzegtourismwegrowkrakowglogowyou2pilanysamailwrocinfoagroautobeepshoppriviqhslapypiszlodzcfolksecommerce-shopmazurypulawyskoczowrzeszowpomorskiezgierzkaliszolkuszlowiczostrowiecsosnowiecmazowszewodzislawbialowiezazgorzeleckatowicepabianicejelenia-gorawolominkarpaczsieradznowarudaczeladzkonskowolaskierniewiceswinoujscieturystykabieszczadycieszynketrzynolsztynbialystokbabia-goraprochowicewarszawastalowa-wolapolkowicegorlicegliwiceponiatowalimanowalubartowaugustowkobierzyceopocznognieznoszczytnokolobrzegshoparenapodhalebielskoklodzkostargardatwithplayitownnamecoorgnetedugovacorgcomproestnetedugovbiznameislaprofinforechtngrokmedaaaacacpaenglawjurbarbarsykeeneticavocatacctcloudnsorgcomsecplonetedugov123paginaweborgcomnetintedugovnomepublidkinbarsygovx443cloudnsorgmilcomnetedugovcooporgmilcomschnetedugovnamecomcannetlibassoaemclantmcontstoreorgcomnomrecwwwbarsyfirminfoshopartsstackitmyddnswebspacelima-cityacincooxorgedugovbarsybrendlyhbvpsvpsspectrumlandinghostingacppmordoviamcprecbgorgmilcomspbnetintedumsknovgovbirrasmcdirmytismircloudvladimirnalchikadygeyamarinepyatigorskmyjinobashkiriaeurodirvladikavkazna4ugroznykustanaikalmykiacldmaildagestaniranbuildcloudcanvaliaravalwixdevelopmentappwritemigrationneedleverceldatabasestackitcodereplravendbonporterlovableaccoorgmilnetgovcoopmedorgcompubschnetedugovservicemecomygovorggovtvmedorgcomnetedugovinfoedgfacbmlonihkutwpsryxzbdtmacfhppmyspreadshopbrandpartiorgcomfhvpress123minsidaitcouldbeworlanbibkommunalforbundfhskiopsyskomvuxkomforbnaturbruksgymnloginlineorgcomnetedugovenscaledeuusentsurgebotdaorgmilcomnetgovnowteleporthashbangplatformlovablebarsyshopwarebasehoplixbarsyonlinemsf5gitpagewawamscofigma-govcaffeinefigmacanvasoltstscwputerbarsysupportchatgptsquareomniweopensocialcpanelplaycodenotionnovecorewpsquaredpreviewjelecyonbyensrhtfastvpspieboxconvexjouwwebheyflowplatformshloginlinemadethissourcecraftclouderaorgorgcomartedugouvunivmeorgcomnetedugovsurveysstatichfheiyuxs4allprojectmyfastubervibehostapp-ionosdeployagentmecoorgcomschnetedugovbizcncostoreorgmilcomneteduembaixadaconsuladokiraranohoprincipesaotomeheliohobarsystorebaseshopwaresellfyaiabkhaziavologdamordoviapenzalenugsochinavoiexnetspbmsknovnorth-kazakhstanashgabadkareliaarmeniageorgiavladimirnalchikivanovobukharaadygeyakhakassiakalugakrasnodarjambylaktyubinsktroitskbryanskobninskkurganazerbaijanpokrovskbashkiriatselinogradvladikavkazmurmansktulatuvamangyshlaktashkentchimkentgroznykaragandatermezarkhangelskkustanaikalmykiabalashoveast-kazakhstankaracoldagestantogliattibarsyredorgcomgobedumirenaccoorgjelasticdiscoursecleverappsschacmiincogoornetonlineshopcogoorgmilcomwebnicnetintedugovbiznametestcoorgmilcomnomnetedugovorangecloudpersoindorgcomfinnatnetgovensmincomtourismintlinfox0611oyaorgmilcomnetedugovquickconnectvpnplusnettprequalifymeaddrmyaddrntdllwadlnctvavdrk12orgmilpolbeltelcomwebgennetedutskkepgovbbsbiznameinfocoorgmilcompronetedugovbiznameinfobetter-thanworse-thansakurafromdyndnson-the-webmymailerorgmilurlcomneteduidvgovmydnsgameclubebizmeneacsccogotvorhotelmilmobiinfovodteiflgplkmsmsbcckhincndnvncoztltmkckppzpdprvcvkvlvcrkrkscxuzchernovtsyrivneyaltaodesavolynrovnolutskltdinforgcomnetedugovbizvinnicazhitomirternopilpoltavakropyvnytskyizaporizhzhiasevastopolsebastopoluzhgoroduzhhorodkharkovkharkivvinnytsiakhmelnytskyizaporizhzhecrimeaodessazhytomyrnikolaevcherkassydonetskluganskluhanskkirovogradivano-frankivskchernivtsikrymkievkyivlvivsumyzakarpattiamykolaivcherkasychernigovkhersonchernihivdnipropetrovskdnepropetrovskkhmelnitskiyneacsccogoorusorgmilcomedugovmyspreadshopadimono-ipbarsybarsyonlinelayershiftnh-servretrosnubapicampaignservicelugaffinitylotteryweeklylotteryraffleentrygluglugsmeaccoindependent-inquestnimsitecopropymntltdorgplcschnetgovnhsbarsyindependent-commissionindependent-reviewpolicepublic-inquiryindependent-panelconnhospindependent-inquiryroyal-commissionoraclegovcloudappscck12libaws-govccphxcclibpvtparochchtrcck12libcceatonk12coglibtecgendstmusann-arborwashtenawcck12glghcck12sealibforksolympiabainbridge-islkeyporthoquiamyarrow-pointcentraliaport-townsendsequimport-ludlowrentonsilverdalebremertonredmondsheltonbellevueport-orchardport-angeleskingstonchehalisaberdeengig-harborseattlepoulsboidmdndsddemenegacalamaiavawapailalflnmdcncscohnhmihiviwiriinmntnmocoutvtctmtgunjokakwvnvprarorasmskstxwynykyazisadninsnngosrvis-bymircloudservernamepointtoenscaledland-4-salefreeddnsstuff-4-saleazure-apinoipdatabricksappscloudnsgolffanheliohostazurewebsitesgvorgmilcomgubneteducoorgcomnetd0egvorgmilcomnetedugovmydnsiacostoree12orgmilcomnomwebgobbibrectecnetintedugovraremprendefirminfoartseducok12orgcomnethidnsidacaiiosonlahanamhanoicamauhueorgcompronetintedugovbizbacninhtayninhhoabinhnamdinhtravinhhaiphongvinhlonghaiduongquangnamquangtrithuathienhuequangninhbacgianghaugiangquangbinhsoctrangbentrethanhphohochiminhdanangkontumhatinhkhanhhoathanhhoahealthgialailaocaiyenbaibackanngheanlonganphuyenphuthocanthodaklakdongnainameinfovinhphucdongthapkiengiangtiengiangquangngailaichaulangsonlamdongdaknonghagiangangiangcaobangbinhduongninhthuanbinhthuanbaclieuthaibinhninhbinhbinhdinhtuyenquanghungyenbaria-vungtauthainguyendienbienbinhphuocschbizputerimagine-proxyorgcomnetedugovcloud66advisormypetsdyndnsxn--8dbq2axn--4dbgdty6cxn--5dbhl8dxn--hebda8bxn--80auxn--d1atxn--c1avgxn--o1acxn--o1achxn--90azhxn--55qx5dxn--uc0atvxn--od0algxn--wcvs22dxn--gmqw5axn--mxtq1mxn--12c1fe0brxn--h3cuzk1dixn--12co0c3b4evaxn--12cfi8ixb8lxn--o3cyx2axn--m3ch0j3axn--j1adpxn--90amcxn--90a1afxn--h1ahnxn--j1ael8bxn--h1alizxn--c1avgxn--j1aefxn--80aaa0cvacxn--41acaffeineexeopentunnelbotdashtelebitorgtmaccoagricorgmilnomwebnicngonetaltedugovlawnisschoolgrondaraccoorgmilcomschnetedugovbizinfoprg1-zeropstritonstackitlimazeropsaccoorgmilgov\u044F\u0441\u043F\u0431\u043E\u0440\u0433\u043A\u043E\u043C\u043C\u0441\u043A\u0431\u0438\u0437\u043C\u0438\u0440\u0441\u0430\u043C\u0430\u0440\u0430\u043A\u0440\u044B\u043C\u0441\u043E\u0447\u0438\u0430\u043A\u043E\u0434\u043F\u0440\u043E\u0440\u0433\u043E\u0431\u0440\u0443\u043F\u0440\u05E6\u05D4\u05DC\u05DE\u05DE\u05E9\u05DC\u05D9\u05E9\u05D5\u05D1\u05D0\u05E7\u05D3\u05DE\u05D9\u05D4\u0E2D\u0E07\u0E04\u0E4C\u0E01\u0E23\u0E18\u0E38\u0E23\u0E01\u0E34\u0E08\u0E23\u0E31\u0E10\u0E1A\u0E32\u0E25\u0E28\u0E36\u0E01\u0E29\u0E32\u0E17\u0E2B\u0E32\u0E23\u0E40\u0E19\u0E47\u0E15\u6559\u80B2\u7DB2\u7D61\u7D44\u7E54\u516C\u53F8\u653F\u5E9C\u500B\u4EBA\uB2F7\uB137\uD55C\uAD6D\u6FB3\u95E8\u65B0\u95FB\u6FB3\u9580\u8054\u901A\u5BB6\u96FB\u5609\u91CC\u62DB\u8058\u901A\u8CA9\uB2F7\uCEF4\uC0BC\uC131\u30B3\u30E0\u10D2\u10D4\u0431\u0433\u0440\u0444\u0435\u044Eadcdbdgdidmdsdtdaebedeeegeiejekemenepereseveyegabacalamanauavapaqasazacfbfafgfnfpfwftfbgcgagggegkgngmgsgpgvgtgugilmlnlalclglplsltlhmimjmkmmmomambmcmdmfmgmzmpmsmtmgbbblbsbecccacnclcmcvctcscmhkhghchbhthphshlinikifigiaibicivisikninhnmncnbngnsnpnvntnjoionomobocoaofodorosotoptstttytatbtetgtithtmtltrusuvuaucueuguhulumunufjdjbjtjsjlkmkhkfkdkcktkukskpkgpmpnpkpjpgqaqmqiqsvtvcvbvmvlvrwpwtwzwbwcwawgwkwmwtrsrprgrfrercrbrarnrmrlrkrirhrwsusrssspsgsesbsaslsmsissxmxaxcxuypysylymykygybycyuztzsznzmzkzdzczbzaz\u03B5\u03BB\u03B5\u03C5\u4E16\u754C\u53F0\u7063\u8D2D\u7269\u516C\u76CA\u70B9\u770B\u81FA\u7063\u7F51\u7EDC\u66F8\u7C4D\u5728\u7EBF\u7F51\u7AD9\u624B\u673A\u673A\u6784\u5927\u62FF\u6E38\u620F\u4FE1\u606F\u53F0\u6E7E\u8C37\u6B4C\u6148\u5584\u5546\u6807\u9999\u6E2F\u4E2D\u56FD\u9910\u5385\u7F51\u5740\u4E2D\u570B\u5546\u57CE\u98DF\u54C1\u5FAE\u535A\u653F\u52A1\u79FB\u52A8\u96C6\u56E2\u516C\u53F8\u516B\u5366\u5546\u5E97\u5065\u5EB7\u7F51\u5E97\u653F\u5E9C\u65F6\u5C1A\u4F5B\u5C71\u4E2D\u4FE1\u5A31\u4E50\u5E7F\u4E1C\u4F01\u4E1Ahomedepotengineering\u0627\u0645\u0627\u0631\u0627\u062Arepublicankuokgroupversicherungchannelcitadelxn--pgbs0dhxn--b4w605ferdstatebankwebsitexn--mgb9awbf\u4E9A\u9A6C\u900A\u6DE1\u9A6C\u9521alibabaxn--ngbc5azdxn--mgbbh1axn--45br5cyltoshibabuildworldcloudtradeguideplacespacedancemoviephoneprimesmilebiblestyleappleazurestoreskypegripexn--l1accdrivelottehorsehouseleasechasereisestadahondaomegaaetnaamicaninjanokiamediadeltavodkaedekaosakapizzaslingemailgmailtirolshelltmallfinallegaltotalhotelamfamforumrehabmusicciticricohcoachwatchboschearthfaithirishmiamiarchidubaiguccipraxi\u307F\u3093\u306A\u30B9\u30C8\u30A2\u30BB\u30FC\u30EBcanonsalononionnikonepsonkoelngreensevencrownikanoradioaudioweiboglobopromogalloyahoociscorodeovideomangobingotokyovolvolottokyotophotosmartsportquesttrusthyattjetztadultcymrubaidutushuxn--kprw13dubankclickblackmerckgroupsharpcheapnowtvxn--h2brj9c\u05E7\u05D5\u05DD\u0570\u0561\u0575\u043E\u0440\u0433\u0441\u0440\u0431\u043C\u043E\u043D\u043A\u043E\u043C\u0431\u0435\u043B\u043C\u043A\u0434\u049B\u0430\u0437\u0440\u0443\u0441\u0443\u043A\u0440\u0645\u0635\u0631\u0642\u0637\u0631\u0639\u0631\u0628\u0643\u0648\u0645dadcfdmedwedredphdthdbidpidkrdmsdltdiceonewmeglemoerwecfageacbanbambaaaammakianraspacpaaxawtfbcgaegongingaigvigorgdogdhlmilrilonlaolloluoljllcalgalnflafltelsrlfrllplkimibmcamcombommomifmabbjcbscbwebcabnabtabmlbpubabcbbcnecincpncllcstcwtcpwcnyckfhbzhovhmoiskiobisbitcifyituipinvinwinxincbnbcnmanfangdnmenrenkpnmtnyunrunfununobiojioriohbogmofooboooooacoecoceongoproartistottnttbbtcateatlatvetpetbetnethktmitfitintjothotgotdotbotprueduicujnjyouinknhktdkappsapgapmapdnptopgopllpjmpzipvipripesqtrvdtvitvdevmovgovhivnrwlawsewnewbmwwownowhowdvrftrmtrsfrbarcartvscrseusawsupsubssbsadsddsldssasbmsmlsxxxboxfoxgmxtjxsextaxbuyflydiysoyjoyskypaydaygayxyzanzbizwebersenerpokerlameractortatarsolar\u0EA5\u0EB2\u0EA7\u0E04\u0E2D\u0E21\u0E44\u0E17\u0E22tourslocusnexuslexusgiftsbeatsboatspartspressglassswiss\u0915\u0949\u092E\u0928\u0947\u091Ftiresgivescodeshomesgamestunesshoescardswalesloansvegastoolsdealsautosparis\u30D5\u30A1\u30C3\u30B7\u30E7\u30F3workssucksrocksxeroxforexfedexpartylillymoneystudyrugbytoraytoday\u4E2D\u6587\u7F51xn--unup4y\u5929\u4E3B\u6559\u98DE\u5229\u6D66\u65B0\u52A0\u5761enterprises\u6211\u7231\u4F60\u5609\u91CC\u5927\u9152\u5E97christmasxn--fct429kholdingsxn--8y0a063axn--mgbx4cd0ablifestyleabogadoallstatenetbank\u0643\u0627\u062B\u0648\u0644\u064A\u0643xn--s9brj9cxn--gk3at1ebestbuycharityxn--55qx5dmicrosoftpropertybasketballhomegoodscorsicajewelrygallerygrocerysurgerycountrybrusselsverisignferreroxn--czr694bhdfcbankcommbanksoftbank\u067E\u0627\u0643\u0633\u062A\u0627\u0646\u067E\u0627\u06A9\u0633\u062A\u0627\u0646nextdirect\u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0647\u0627\u0644\u0639\u0644\u064A\u0627\u0646xn--h2brj9c8cxn--80adxhksshikshaxn--mgbai9azgqp6jcuisinellabarclayscatholicxn--kpry57dcompanyxn--xhq521bblackfridayxn--mgba3a3ejtsandvikxn--d1acj3bacademydownload\u0645\u0644\u064A\u0633\u064A\u0627xn--j1amhxn--w4r85el8fhu5dnraipirangaathletaxn--fhbeixn--mgbqly7cvafrzuerichxn--c2br7g\u0B87\u0BB2\u0B99\u0BCD\u0B95\u0BC8contractorsxn--io0a7igraphicsinsurancetemasekxn--xkc2al3hye2amotorcyclesphotographydirectoryplumbingxn--vhquvclothingtrainingcleaningwilliamhilllightingxn--mgba3a4f16ashoppingcateringeducationokinawapicturesventuresproductionsxn--9et52uwalmart\u0D2D\u0D3E\u0D30\u0D24\u0D02supportrealestatecapitalonexn--nqv7fs00emaauspostfloristdentistxn--qxamgodaddybradescobargainsmitsubishikerryhotelsxn--9dbq2axn--3pxu8kimmobilienxn--fjq720axn--mgbtx2bholidaymckinseymadridbusinessbuildershelsinkixn--4gbrim\u043C\u043E\u0441\u043A\u0432\u0430\u0627\u0644\u0633\u0639\u0648\u062F\u06CC\u0629coffeedegreelacaixapartnersalsaceofficeabbvievoyageorangegeorgeonlinechromemobilekindlegoogleoraclecircleschulesecureinsurexn--mgba7c0bbn0aestatexn--mgbc0a9azcgcruisehangoutxn--vuq861bxn--42c2d9arexrothfirestoneuniversityxn--nnx388alifeinsuranceextraspace\u043E\u043D\u043B\u0430\u0439\u043Dverm\xF6gensberatersoftwarexn--fiqs8sxn--mgbab2bdxn--w4rs40ltienda\u092D\u093E\u0930\u0924\u092E\u094Dafricatoyotaotsukasakuracameracreditcardnagoyaconsultingnetworktheatermonsterprogressivepioneerxn--55qw42gracingdatingvotingvikinglivinggivingxn--bck1b9a5dre4cbrotherweatherjoburg\u0641\u0644\u0633\u0637\u064A\u0646lplfinancialxn--clchc0ea0b2g2a9gcdfutbolschoolsocialglobaldentalwoodsidechanelairtelmatteltravelrealtorwebcamstream\u0C2D\u0C3E\u0C30\u0C24\u0C4Dunicomalstomxn--nodexn--6frz82gmuseumfurniturexn--rvc1e0am3exn--mix891faccenturexn--11b4c3dismailineustardiscountquebeccomsecclinicservicesxn--y9a3aqxn--c1avgswatchchurchsearch\u0627\u0644\u0627\u0631\u062F\u0646marketingcontacthealthmonashshoujisanofitaipeiamericanexpresssuzuki\u30A2\u30DE\u30BE\u30F3\u30AF\u30E9\u30A6\u30C9\u30DD\u30A4\u30F3\u30C8bharti\u30B0\u30FC\u30B0\u30EBxn--mgberp4a5d4armemorialxn--1qqw23alondonmormoninstitutevisionbostonnortoncouponmaisonamazonvirginberlindesigndurbanolayannissananquanxihuanhitachikaufengardenreisenbayerntechnologydatsunxn--90a3aclatinocasinostudiophysioxn--ngbe9e0apharmacytattootaobaoaramcoexpertreportabbottdirectselectimamatfairwindspictettargetmarketintuittravelersinsurancecreditdupontryukyusuppliesxn--tckwebnpparibasschmidtmerckmsdyodobashirestaurantbridgestonecricketxn--fpcrj9c3dbostikbroadwayattorneylefrakemerckxn--fiq228c5hscareersfarmerswinnersflowersxn--wgbh1cguitarsxn--54b7fta0ccxn--p1acfmakeupgalluplandroverxn--kcrx77d1x4agoldpointbauhausxn--mgbayh7gpahiphopplaystationxn--mgba3a4fraxn--eckvdtc9dhyundaixn--gckr3f0fistanbulticketsmarketsflightschintaireviewsxn--3e0b707ewindowsxn--fiqz9sfinancialxn--fzys8d69uvgm\u0627\u0628\u0648\u0638\u0628\u064Adiscoverreview\u09AC\u09BE\u0982\u09B2\u09BExn--5su34j936bgsgmoscowobserverapartments\u0434\u0435\u0442\u0438\u0627\u0631\u0627\u0645\u0643\u0648\u0441\u0430\u0439\u0442eurovisionxn--i1b6b1a6a2exn--xkc2dl3a5ee0h\u062A\u0648\u0646\u0633\u0645\u0648\u0642\u0639\u0628\u0627\u0631\u062A\u0680\u0627\u0631\u062A\u0634\u0628\u0643\u0629\u0639\u0645\u0627\u0646\u0628\u064A\u062A\u0643\u0639\u0631\u0627\u0642readkredbondlandbandfundfoodprodgoldfordtubecafesafelifeggeeieeefreefagepagegugezonewinememenamegamesaleablebikenikelikecarecbreherefiresaveloveliveblueartedatesitevotecaseluxebofamodaltdaasdatiaayogasinavanashiaasiajavabbvatevavivadatazaraarpacasavisasncfprofmaifsurfgolfdvagsongbingpingwangkpmggoogblogpohlfailcooldellcalldeallidlsarlfilmteamroomfarmimdbarabclubhdfcicbchsbcgmbhrichtechfishdishcashminiernikddiaudiwikimobitaxicitikiwidesiqponskinloanakdnwienopenporncerntownimmolimoolloinfonicofidolegosaxozeroaerovivoautovotomotofastbestresthostpostnextlgbtchatseatgiftmeetdietreitmintrentgentspotscotguruitausohumenucyoubanklinkpinkdclktalksilkbookseekworkrsvpaarpjeepshopcoophelpcamppccwshowbeerstarruhrflirweirhaircarsparsjprshausplusnewstipstoysjobskidsfanspicsdocsxboxamexsexynavycitysonyarmyallybabyplaydeliverybuzzgbizlamborghiniphilips\u0DBD\u0D82\u0D9A\u0DCF\u0CAD\u0CBE\u0CB0\u0CA4fitnessexpresslanxesspfizercenterwalterlawyersoccercareerkosherbrokerlockerdealerdoctorauthorxn--mgbqly7c0a67fbcverm\xF6gensberatungjaguarxn--pssy2uxn--hxt814eflickrrepairrogersairbusxn--mgbai9a5eva00beventsyachtsxn--t60b56a\u09AD\u09BE\u09F0\u09A4\u09AD\u09BE\u09B0\u09A4\u092D\u093E\u0930\u0924\u092D\u093E\u0930\u094B\u0924viajeshermeshughesxn--j1aef\u0938\u0902\u0917\u0920\u0928villas\u0B2D\u0B3E\u0B30\u0B24claimshotels\u0AAD\u0ABE\u0AB0\u0AA4zapposphotosjuegoscondostatamotorsgratistennis\u0A2D\u0A3E\u0A30\u0A24tkmaxxtjmaxxschaeffleryandexxn--80aswgrealtysafetybeautyluxuryxn--3ds443gsupplyfamilyxn--o3cw4hhockeysydneyxn--90aenissayalipayenergycomputeragencyxn--rovu88b\u96FB\u8A0A\u76C8\u79D1xn--gecrj9cstatefarmaccountantaquarelleolayangroup\u9999\u683C\u91CC\u62C9xn--p1ai\u7EC4\u7EC7\u673A\u6784xn--1ck2e1bxn--mgbt3dhdschwarz\u0645\u0648\u0631\u064A\u062A\u0627\u0646\u064A\u0627abudhabinowruzkomatsufujitsuhospitalxn--80asehdbxn--mgbtf8flxn--j6w193gxn--yfro4i67oprudentialxn--flw351ecruisescoursesrecipesxn--e1a4cferrarixn--ses554gxn--wgbl6awatchesstaplessinglesxn--mgbcpq6gpa1axn--otu796dpropertiescreditunionxn--mgbah1a3hjkrdstockholmhisamitsu\u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629stcgroupdomainsoriginscouponsbloombergclubmedfroganslimitedxn--80aqecdr1aexposedinternationalequipmentbarclaycardxn--q7ce6axn--mgbi4ecexpprotectionassociatesconstructionxn--cck2b3bxn--45q11candroidfoundation\u05D9\u05E9\u05E8\u05D0\u05DCxn--mgbca7dzdocliniqueboutiqueengineerxn--qxa6asystemsfirmdalefashionauctionxn--nqv7finfinitirentalsreliancetradingweddingfishinghostinggentingbookingcookingxn--3hcrj9cgraingerxn--czrs0tdemocratsamsungyokohamaxn--h2breg3evexn--nyqy26alundbeckmelbournevacationssolutionsfrontierxn--vermgensberatung-pwbmanagementxn--cg4bkixn--mgb2ddeslincolnhamburgsandvikcoromantblockbusterairforcebarefootxn--4dbrk0ceinvestmentsfeedbackcommunityxn--ngbrx\u0627\u0644\u0628\u062D\u0631\u064A\u0646diamondsamsterdamhealthcareredumbrellaxn--mxtq1mxn--2scrj9cagakhanxn--mgbpl2fh\u043A\u0430\u0442\u043E\u043B\u0438\u043Acaravan\u0B9A\u0BBF\u0B99\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0BC2\u0BB0\u0BCDrichardlimortgageamericanfamilyxn--fzc2c9e2cscholarshipssaarlandxn--imr513nvlaanderensamsclubgoodyearkitchen\u0B87\u0BA8\u0BCD\u0BA4\u0BBF\u0BAF\u0BBEweatherchannelallfinanzxn--kput3i\u0627\u0644\u0633\u0639\u0648\u062F\u06CC\u06C3xn--90aisxn--efvy88h\u0627\u0644\u062C\u0632\u0627\u0626\u0631xn--mgbaam7a8hexchangejpmorganxn--tiq49xqyjfidelitysecurityxn--mk1bu44cwanggouxn--fiq64bxn--6qq986b3xlxn--mgbbh1a71exn--80ao21amarshallsxn--5tzm5gtravelerspanasoniclatrobeyoutubeaccountantsxn--rhqv96gxn--cckwcxetdanalyticsxn--ygbi2ammx\u0628\u0627\u0632\u0627\u0631\u0628\u06BE\u0627\u0631\u062A\u0633\u0648\u0631\u064A\u0629organicfresenius\u0633\u0648\u0631\u064A\u0627xn--9krt00axn--qcka1pmcxn--jlq480n2rgdeloittesciencefinancexn--jvr189mxn--30rr7yhomesensehotmailbaseballfootballleclercboehringerxn--q9jyb4cxn--mix082f\u0627\u0644\u064A\u0645\u0646\u0647\u0645\u0631\u0627\u0647politie\u0633\u0648\u062F\u0627\u0646\u0627\u064A\u0631\u0627\u0646\u0627\u06CC\u0631\u0627\u0646netflixyamaxunxn--lgbbat1ad8jcollegestoragecapetowncolognekerrypropertiesxn--mgbgu82axn--ogbpf8flxn--czru2dwhoswhociprianilasallexn--g2xx48cforsalebanamexaudiblexn--vermgensberater-ctbxn--zfr164bericssonvanguardxn--45brj9cindustriestheatremarriottxn--3bst00mcomparexn--mgberp4a5d4a87gcapitaldigital\u0627\u0644\u0645\u063A\u0631\u0628barcelonashangrilaxn--d1alfcalvinkleinwwwcitysapporokawasakinagoyasendaikobekitakyushuyokohamackjp";
  var rulesRoot = 653;
  var exceptionsRoot = 657;

  // node_modules/tldts/dist/es6/src/suffix-trie.js
  var numberOfNodes = nodeFlags.length;
  var numberOfEdges = edgeLength.length;
  var edgeOffset = new Uint32Array(numberOfEdges);
  var edgeHash = new Uint32Array(numberOfEdges);
  var wildcardEdge = new Int32Array(numberOfNodes).fill(-1);
  for (let node = 0, offset = 0; node < numberOfNodes; node += 1) {
    for (let edge = edgeStart[node]; edge < edgeStart[node + 1]; edge += 1) {
      edgeOffset[edge] = offset;
      const end = offset + edgeLength[edge];
      let hash = 5381;
      for (let i = end - 1; i >= offset; i -= 1) {
        hash = hash * 33 ^ labelText.charCodeAt(i);
      }
      edgeHash[edge] = hash >>> 0;
      if (edgeLength[edge] === 1 && labelText.charCodeAt(offset) === 42) {
        wildcardEdge[node] = edge;
      }
      offset = end;
    }
  }
  var matchNode = -1;
  var matchStart = 0;
  var matchEnd = 0;
  function labelEquals(edge, hostname, start, length) {
    if (edgeLength[edge] !== length) {
      return false;
    }
    const offset = edgeOffset[edge];
    for (let i = 0; i < length; i += 1) {
      if (labelText.charCodeAt(offset + i) !== hostname.charCodeAt(start + i)) {
        return false;
      }
    }
    return true;
  }
  function findEdge(node, hash, hostname, start, length) {
    let lo = edgeStart[node];
    let hi = edgeStart[node + 1];
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      const value = edgeHash[mid];
      if (value < hash) {
        lo = mid + 1;
      } else if (value > hash) {
        hi = mid;
      } else {
        for (let e = mid; e >= lo && edgeHash[e] === hash; e -= 1) {
          if (labelEquals(e, hostname, start, length))
            return e;
        }
        for (let e = mid + 1; e < hi && edgeHash[e] === hash; e += 1) {
          if (labelEquals(e, hostname, start, length))
            return e;
        }
        return -1;
      }
    }
    return -1;
  }
  function walk(hostname, root, allowedMask) {
    let node = root;
    let end = hostname.length;
    let hash = 5381;
    matchNode = -1;
    for (let i = hostname.length - 1; i >= 0; i -= 1) {
      const code = hostname.charCodeAt(i);
      if (code === 46) {
        const start = i + 1;
        let edge2 = findEdge(node, hash >>> 0, hostname, start, end - start);
        if (edge2 === -1) {
          edge2 = wildcardEdge[node];
        }
        if (edge2 === -1) {
          return matchNode !== -1;
        }
        node = edgeChild[edge2];
        if ((nodeFlags[node] & allowedMask) !== 0) {
          matchNode = node;
          matchStart = start;
          matchEnd = end;
        }
        end = i;
        hash = 5381;
      } else {
        hash = hash * 33 ^ code;
      }
    }
    let edge = findEdge(node, hash >>> 0, hostname, 0, end);
    if (edge === -1) {
      edge = wildcardEdge[node];
    }
    if (edge !== -1) {
      node = edgeChild[edge];
      if ((nodeFlags[node] & allowedMask) !== 0) {
        matchNode = node;
        matchStart = 0;
        matchEnd = end;
      }
    }
    return matchNode !== -1;
  }
  function suffixLookup(hostname, options, out) {
    if (fast_path_default(hostname, options, out)) {
      return;
    }
    const allowedMask = (options.allowPrivateDomains ? 2 : 0) | (options.allowIcannDomains ? 1 : 0);
    if (walk(hostname, exceptionsRoot, allowedMask)) {
      out.isIcann = (nodeFlags[matchNode] & 1) !== 0;
      out.isPrivate = (nodeFlags[matchNode] & 2) !== 0;
      out.publicSuffix = hostname.slice(matchEnd + 1);
      return;
    }
    if (walk(hostname, rulesRoot, allowedMask)) {
      out.isIcann = (nodeFlags[matchNode] & 1) !== 0;
      out.isPrivate = (nodeFlags[matchNode] & 2) !== 0;
      out.publicSuffix = hostname.slice(matchStart);
      return;
    }
    out.isIcann = false;
    out.isPrivate = false;
    const lastDot = hostname.lastIndexOf(".");
    out.publicSuffix = lastDot === -1 ? hostname : hostname.slice(lastDot + 1);
  }

  // node_modules/tldts/dist/es6/index.js
  var RESULT = getEmptyResult();
  function getDomain2(url, options) {
    resetResult(RESULT);
    return parseImpl(url, 3, suffixLookup, options, RESULT).domain;
  }

  // src/core/catalog.js
  var CATALOG = [
    { id: "google", name: "Google", domains: ["google.com", "youtube.com", "youtu.be", "googleapis.com", "gstatic.com", "googleusercontent.com", "ggpht.com", "ytimg.com", "googlevideo.com", "google.co.uk", "google.de", "google.fr", "google.co.jp", "google.ca", "google.com.au", "google.es", "google.it", "google.com.br", "google.co.in", "blogger.com", "blogspot.com", "withgoogle.com", "gvt1.com", "gvt2.com", "googleadservices.com", "googlesyndication.com", "doubleclick.net", "recaptcha.net", "firebaseapp.com", "appspot.com", "goo.gl", "g.co", "gmail.com", "googlemail.com"] },
    { id: "microsoft", name: "Microsoft", domains: ["microsoft.com", "live.com", "office.com", "office365.com", "outlook.com", "microsoftonline.com", "msn.com", "bing.com", "azure.com", "azureedge.net", "windows.net", "sharepoint.com", "onedrive.com", "skype.com", "xbox.com", "msecnd.net", "msauth.net", "msftauth.net", "microsoftonline-p.com", "officeapps.live.com", "powerbi.com", "visualstudio.com"] },
    { id: "meta", name: "Meta", domains: ["facebook.com", "fb.com", "fbcdn.net", "instagram.com", "cdninstagram.com", "messenger.com", "whatsapp.com", "whatsapp.net", "threads.net", "meta.com", "oculus.com", "fbsbx.com", "facebook.net"] },
    { id: "amazon", name: "Amazon", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.ca", "amazon.co.jp", "amazon.in", "amazon.com.au", "amazon.com.br", "amazon.nl", "amazonaws.com", "media-amazon.com", "ssl-images-amazon.com", "primevideo.com", "twitch.tv", "twitchcdn.net", "ttvnw.net", "jtvnw.net", "audible.com", "goodreads.com", "imdb.com", "amazonpay.com", "a2z.com", "awsstatic.com"] },
    { id: "x", name: "X (Twitter)", domains: ["x.com", "twitter.com", "t.co", "twimg.com", "twitterstat.us", "pscp.tv", "periscope.tv"] },
    { id: "github", name: "GitHub", domains: ["github.com", "githubusercontent.com", "githubassets.com", "github.io", "githubapp.com", "ghcr.io", "github.dev", "githubcopilot.com", "npmjs.com", "npmjs.org"] },
    { id: "reddit", name: "Reddit", domains: ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com", "reddituploads.com", "redditinc.com"] },
    { id: "apple", name: "Apple", domains: ["apple.com", "icloud.com", "icloud-content.com", "mzstatic.com", "cdn-apple.com", "apple-cloudkit.com", "itunes.com"] },
    { id: "linkedin", name: "LinkedIn", domains: ["linkedin.com", "licdn.com", "lnkd.in"] },
    { id: "netflix", name: "Netflix", domains: ["netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net"] },
    { id: "spotify", name: "Spotify", domains: ["spotify.com", "scdn.co", "spotifycdn.com", "spoti.fi"] },
    { id: "dropbox", name: "Dropbox", domains: ["dropbox.com", "dropboxstatic.com", "dropboxusercontent.com", "db.tt"] },
    { id: "slack", name: "Slack", domains: ["slack.com", "slack-edge.com", "slack-files.com", "slack-imgs.com"] },
    { id: "discord", name: "Discord", domains: ["discord.com", "discordapp.com", "discord.gg", "discordapp.net", "discord.media"] },
    { id: "paypal", name: "PayPal", domains: ["paypal.com", "paypalobjects.com", "paypal.me", "venmo.com"] },
    { id: "ebay", name: "eBay", domains: ["ebay.com", "ebay.co.uk", "ebay.de", "ebayimg.com", "ebaystatic.com", "ebay.fr", "ebay.it", "ebay.es", "ebay.com.au", "ebay.ca"] },
    { id: "yahoo", name: "Yahoo", domains: ["yahoo.com", "yahoo.co.jp", "yimg.com", "flickr.com", "aol.com", "yahooapis.com", "tumblr.com", "ymail.com"] },
    { id: "atlassian", name: "Atlassian", domains: ["atlassian.com", "atlassian.net", "bitbucket.org", "trello.com", "atl-paas.net", "jira.com", "statuspage.io"] },
    { id: "adobe", name: "Adobe", domains: ["adobe.com", "adobelogin.com", "adobe.io", "typekit.net", "behance.net", "adobess.com", "creativecloud.com"] },
    { id: "zoom", name: "Zoom", domains: ["zoom.us", "zoom.com", "zoomgov.com"] },
    { id: "notion", name: "Notion", domains: ["notion.so", "notion.site", "notion-static.com"] },
    { id: "openai", name: "OpenAI", domains: ["openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com"] },
    { id: "anthropic", name: "Anthropic", domains: ["anthropic.com", "claude.ai", "claude.com"] },
    { id: "gitlab", name: "GitLab", domains: ["gitlab.com", "gitlab.io", "gitlab-static.net"] },
    { id: "stackexchange", name: "Stack Exchange", domains: ["stackoverflow.com", "stackexchange.com", "serverfault.com", "superuser.com", "askubuntu.com", "sstatic.net", "mathoverflow.net"] },
    { id: "wikimedia", name: "Wikimedia", domains: ["wikipedia.org", "wikimedia.org", "wiktionary.org", "wikidata.org", "wikibooks.org", "wikiquote.org", "mediawiki.org"] },
    { id: "pinterest", name: "Pinterest", domains: ["pinterest.com", "pinimg.com", "pin.it"] },
    { id: "tiktok", name: "TikTok", domains: ["tiktok.com", "tiktokv.com", "tiktokcdn.com", "byteoversea.com", "ibytedtos.com"] },
    { id: "cloudflare", name: "Cloudflare", domains: ["cloudflare.com", "workers.dev", "pages.dev", "cloudflareinsights.com"] },
    { id: "shopify", name: "Shopify", domains: ["shopify.com", "myshopify.com", "shopifycdn.com", "shopifysvc.com"] },
    { id: "salesforce", name: "Salesforce", domains: ["salesforce.com", "force.com", "salesforce-setup.com", "herokuapp.com", "heroku.com"] },
    { id: "twilio", name: "Twilio", domains: ["twilio.com", "sendgrid.com", "segment.com"] },
    { id: "vercel", name: "Vercel", domains: ["vercel.com", "vercel.app", "now.sh"] },
    { id: "medium", name: "Medium", domains: ["medium.com"] },
    { id: "telegram", name: "Telegram", domains: ["telegram.org", "t.me", "telegram.me", "telesco.pe"] },
    { id: "figma", name: "Figma", domains: ["figma.com", "figstatic.com"] },
    { id: "canva", name: "Canva", domains: ["canva.com", "canva.cn"] }
  ];
  var TEST_CATALOG = [
    { id: "fx-alpha", name: "Alpha", domains: ["alpha.localhost", "alpha-static.localhost"] },
    { id: "fx-beta", name: "Beta", domains: ["beta.localhost"] }
  ];

  // src/core/services.js
  var isIp2 = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":");
  function registrable(host) {
    host = (host || "").toLowerCase().replace(/\.$/, "");
    if (!host) return "";
    if (isIp2(host)) return host;
    return getDomain2(host, { allowPrivateDomains: true }) || host;
  }
  function hostOf(url) {
    try {
      const u = new URL(url);
      return /^https?:$|^wss?:$/.test(u.protocol) ? u.hostname : null;
    } catch {
      return null;
    }
  }
  var isWebUrl = (url) => {
    try {
      return /^https?:$/.test(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  function suffixes(host) {
    const parts = host.split(".");
    const out = [];
    for (let i = 0; i < parts.length; i++) out.push(parts.slice(i).join("."));
    return out;
  }
  var Resolver = class {
    /** @param {{catalog?: any[], user?: {services:Object, domainMap:Object, names:Object}}} o */
    constructor({ catalog: catalog2 = CATALOG, user } = {}) {
      this.catalog = catalog2;
      this.user = user || { services: {}, domainMap: {}, names: {} };
      this.catIndex = /* @__PURE__ */ new Map();
      this.catById = /* @__PURE__ */ new Map();
      for (const s of catalog2) {
        this.catById.set(s.id, s);
        for (const d of s.domains) this.catIndex.set(d, s.id);
      }
    }
    /** Service id for a hostname. */
    idOf(host) {
      host = (host || "").toLowerCase().replace(/\.$/, "");
      if (!host) return null;
      const sfx = suffixes(host);
      for (const s of sfx) {
        const id = this.user.domainMap[s];
        if (id) return id;
      }
      for (const s of sfx) {
        const id = this.catIndex.get(s);
        if (id) return id;
      }
      return "auto:" + registrable(host);
    }
    idOfUrl(url) {
      const h = hostOf(url);
      return h ? this.idOf(h) : null;
    }
    /** Base (pre-user-edit) name of a service. */
    name(id) {
      if (this.user.names[id]) return this.user.names[id];
      if (this.user.services[id]) return this.user.services[id].name;
      if (this.catById.has(id)) return this.catById.get(id).name;
      if (id.startsWith("auto:")) return prettyAuto(id.slice(5));
      return id;
    }
    /** Domains currently belonging to a service (after user edits). */
    domains(id) {
      const set = /* @__PURE__ */ new Set();
      const cat = this.catById.get(id);
      if (cat) {
        for (const d of cat.domains) if (!this.user.domainMap[d] || this.user.domainMap[d] === id) set.add(d);
      }
      for (const [d, sid] of Object.entries(this.user.domainMap)) if (sid === id) set.add(d);
      if (id.startsWith("auto:")) {
        const d = id.slice(5);
        if (!this.user.domainMap[d]) set.add(d);
      }
      return [...set].sort();
    }
    kind(id) {
      if (this.user.services[id]) return "user";
      if (this.catById.has(id)) return "catalog";
      return "auto";
    }
    describe(id) {
      return { id, name: this.name(id), domains: this.domains(id), kind: this.kind(id) };
    }
    /** All services we can enumerate without browsing history: catalog + user-created + extra auto ids. */
    list(extraIds = []) {
      const ids = /* @__PURE__ */ new Set([...this.catById.keys(), ...Object.keys(this.user.services), ...extraIds]);
      return [...ids].map((id) => this.describe(id)).sort((a, b) => a.name.localeCompare(b.name));
    }
  };
  function prettyAuto(domain) {
    const label = domain.split(".")[0] || domain;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  var clone = (o) => JSON.parse(JSON.stringify(o));
  function opCreateService(user, id, name, domains = []) {
    const u = clone(user);
    u.services[id] = { name };
    for (const d of domains) u.domainMap[normDomain(d)] = id;
    return u;
  }
  function opRenameService(user, id, name) {
    const u = clone(user);
    if (u.services[id]) u.services[id].name = name;
    else u.names[id] = name;
    return u;
  }
  function opSetDomains(user, id, domains) {
    const u = clone(user);
    for (const d of domains) u.domainMap[normDomain(d)] = id;
    return u;
  }
  function opUnsetDomain(user, domain) {
    const u = clone(user);
    delete u.domainMap[normDomain(domain)];
    return u;
  }
  function opDeleteService(user, id) {
    const u = clone(user);
    delete u.services[id];
    delete u.names[id];
    for (const [d, sid] of Object.entries(u.domainMap)) if (sid === id) delete u.domainMap[d];
    return u;
  }
  function normDomain(d) {
    return String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:?#].*$/, "").replace(/^\*?\./, "").replace(/\.$/, "");
  }

  // src/core/nav.js
  var AUTH_RE = /(^|[?&])(redirect_uri|client_id|response_type|SAMLRequest|SAMLResponse|oauth_token|code_challenge|openid\.mode|wreply|wtrealm)=|\/(oauth2?|openid|authorize|saml2?|sso|signin\/oauth|o\/oauth2|login\/oauth)(\/|\?|$)/i;
  var looksLikeAuthFlow = (url) => AUTH_RE.test(url);
  function decide(i) {
    const { url, targetService: T, tab, userInitiated, settings, accounts, lastAccount } = i;
    if (!isWebUrl(url) || !T) return { type: "stay" };
    const authish = looksLikeAuthFlow(url);
    if (tab.accountId) {
      if (T === tab.home) return { type: "stay", flow: null };
      if (T === tab.flow) return { type: "stay" };
      if (!userInitiated || authish) return { type: "stay", flow: T };
      return enter(T, "leave");
    }
    if (T === tab.home) return { type: "stay" };
    if (!userInitiated || authish) return { type: "stay", home: T };
    return enter(T, "enter");
    function enter(service, why) {
      const mode = settings.modes?.[service] || settings.defaultMode || "default";
      const svcAccounts = Object.values(accounts).filter((a) => a.serviceId === service);
      if (mode === "remember") {
        const last = lastAccount?.[service];
        if (last && accounts[last] && accounts[last].serviceId === service) return { type: "move", accountId: last, home: service, why: why + ":remember" };
        return { type: "move", accountId: null, home: service, why: why + ":remember-default" };
      }
      if (mode === "ask" && svcAccounts.length) return { type: "ask", serviceId: service };
      return { type: "move", accountId: null, home: service, why: why + ":default" };
    }
  }

  // src/core/controller.js
  var catalog = true ? [...CATALOG, ...TEST_CATALOG] : CATALOG;
  var Controller = class {
    /** @param {object} platform  see DESIGN.md §8 for the contract */
    constructor(platform2) {
      this.platform = platform2;
      this.store = new Store();
      this.resolver = new Resolver({ catalog });
      this.tabs = /* @__PURE__ */ new Map();
      this.pickerFor = /* @__PURE__ */ new Map();
      this.store.onChange((s) => {
        this.resolver = new Resolver({ catalog, user: s.user });
      });
      platform2.controller = this;
    }
    async init() {
      const s = await this.store.load();
      this.resolver = new Resolver({ catalog, user: s.user });
      await this.restoreTabs();
      await this.platform.init?.(this);
      return this;
    }
    get state() {
      return this.store.get();
    }
    get accounts() {
      return this.state.accounts;
    }
    // ---- tab registry ------------------------------------------------------------
    getTab(tabId) {
      return this.tabs.get(tabId) || { accountId: null, home: null, flow: null };
    }
    setTab(tabId, patch) {
      const cur = this.tabs.get(tabId) || { accountId: null, home: null, flow: null };
      const next = { ...cur, ...patch };
      this.tabs.set(tabId, next);
      this.persistTabs();
      this.platform.tabChanged?.(tabId, next, cur);
      return next;
    }
    dropTab(tabId) {
      this.tabs.delete(tabId);
      this.pickerFor.delete(tabId);
      this.persistTabs();
      this.platform.tabDropped?.(tabId);
    }
    persistTabs() {
      if (TARGET !== "chrome-mv3") return;
      clearTimeout(this._pt);
      this._pt = setTimeout(() => {
        try {
          ext.storage.session.set({ tabs: [...this.tabs.entries()] });
        } catch {
        }
      }, 50);
    }
    async restoreTabs() {
      if (TARGET !== "chrome-mv3") return;
      try {
        const got = await ext.storage.session.get("tabs");
        for (const [id, v] of got.tabs || []) this.tabs.set(id, v);
      } catch {
      }
    }
    serviceOfUrl(url) {
      return this.resolver.idOfUrl(url);
    }
    serviceInfo(id) {
      return id ? this.resolver.describe(id) : null;
    }
    accountsOf(serviceId) {
      return Object.values(this.accounts).filter((a) => a.serviceId === serviceId).sort((a, b) => a.createdAt - b.createdAt);
    }
    modeFor(serviceId) {
      return this.state.settings.modes?.[serviceId] || this.state.settings.defaultMode;
    }
    // ---- navigation ---------------------------------------------------------------
    /**
     * Called by a platform for every top-level navigation, before it is allowed to proceed.
     * Updates tab bookkeeping and returns the decision for the platform to execute.
     */
    decideNavigation({ tabId, url, userInitiated }) {
      const tab = this.getTab(tabId);
      const T = this.serviceOfUrl(url);
      if (!T || !isWebUrl(url)) return { type: "stay" };
      if (tab.accountId && !tab.home) {
        this.setTab(tabId, { home: T, flow: null });
        return { type: "stay" };
      }
      const d = decide({
        url,
        targetService: T,
        tab,
        userInitiated,
        settings: this.state.settings,
        accounts: this.accounts,
        lastAccount: this.state.lastAccount
      });
      if (d.type === "stay") {
        const patch = {};
        if (d.flow !== void 0) patch.flow = d.flow;
        if (d.home !== void 0) patch.home = d.home;
        if (!tab.home && tab.accountId === null && d.home === void 0) patch.home = T;
        if (Object.keys(patch).length) this.setTab(tabId, patch);
      } else if (d.type === "move" && d.accountId === tab.accountId) {
        this.setTab(tabId, { home: d.home, flow: null });
        return { type: "stay" };
      } else if (d.type === "move") {
      }
      return d;
    }
    // ---- identity info for content scripts / UI -----------------------------------
    identityFor(tabId) {
      const tab = this.getTab(tabId);
      const acc = tab.accountId ? this.accounts[tab.accountId] : null;
      const st = this.state.settings;
      return {
        account: acc ? { id: acc.id, name: acc.name, color: acc.color, icon: acc.icon, proxy: !!acc.proxy } : null,
        settings: { border: st.border, badge: st.badge },
        status: this.platform.status ? this.platform.status(tabId, tab) : { level: "ok", messages: [] },
        target: TARGET,
        restorable: !!this.platform.restoredTabs?.has(tabId)
      };
    }
    async tabInfo(tabId) {
      let tab;
      try {
        tab = await ext.tabs.get(tabId);
      } catch {
        tab = null;
      }
      const url = tab?.url || "";
      const ts = this.getTab(tabId);
      const sid = isWebUrl(url) ? this.serviceOfUrl(url) : null;
      const service = sid ? this.serviceInfo(sid) : null;
      return {
        tabId,
        url,
        favIconUrl: tab?.favIconUrl || "",
        title: tab?.title || "",
        host: hostOf(url),
        serviceId: sid,
        service,
        home: ts.home,
        flow: ts.flow,
        accountId: ts.accountId,
        accounts: sid ? this.accountsOf(sid).map((a) => this.publicAccount(a)) : [],
        mode: sid ? this.modeFor(sid) : "default",
        modeOverride: sid ? this.state.settings.modes?.[sid] || null : null,
        defaultMode: this.state.settings.defaultMode,
        status: this.platform.status ? this.platform.status(tabId, ts) : { level: "ok", messages: [] },
        target: TARGET,
        canSwitch: !!sid
      };
    }
    publicAccount(a) {
      return { id: a.id, serviceId: a.serviceId, name: a.name, color: a.color, icon: a.icon, proxy: a.proxy ? { ...a.proxy, password: a.proxy.password ? "\u2022\u2022\u2022\u2022" : "" } : null, createdAt: a.createdAt };
    }
    // ---- account operations -------------------------------------------------------
    async createAccount({ serviceId, name, color, icon, proxy }) {
      if (!serviceId) throw new Error("serviceId required");
      const existing = this.accountsOf(serviceId).length;
      const acc = {
        id: "acc_" + uid(10),
        serviceId,
        name: (name || "").trim() || `Account ${existing + 1}`,
        color: color || COLORS[existing % COLORS.length].hex,
        icon: ICONS.includes(icon) ? icon : ICONS[existing % ICONS.length],
        proxy: sanitizeProxy(proxy),
        createdAt: Date.now()
      };
      const extra = await this.platform.accountCreated?.(acc) || {};
      Object.assign(acc, extra);
      await this.store.update((s) => {
        s.accounts[acc.id] = acc;
      });
      await this.platform.accountsChanged?.();
      return this.publicAccount(acc);
    }
    async updateAccount(id, patch) {
      const old = this.accounts[id];
      if (!old) throw new Error("no such account");
      const acc = { ...old };
      if (patch.name !== void 0) acc.name = String(patch.name).trim() || old.name;
      if (patch.color) acc.color = patch.color;
      if (patch.icon && ICONS.includes(patch.icon)) acc.icon = patch.icon;
      if (patch.proxy !== void 0) {
        const p = sanitizeProxy(patch.proxy);
        if (p && patch.proxy.password === "\u2022\u2022\u2022\u2022" && old.proxy) p.password = old.proxy.password;
        acc.proxy = p;
      }
      const extra = await this.platform.accountUpdated?.(acc, old) || {};
      Object.assign(acc, extra);
      await this.store.update((s) => {
        s.accounts[id] = acc;
      });
      await this.platform.accountsChanged?.();
      return this.publicAccount(acc);
    }
    async deleteAccount(id) {
      const acc = this.accounts[id];
      if (!acc) return false;
      for (const [tabId, t] of [...this.tabs.entries()]) {
        if (t.accountId === id) {
          try {
            await this.platform.moveTab(tabId, null, { reason: "account-deleted" });
          } catch (e) {
            console.warn("moveTab", e);
          }
        }
      }
      await this.platform.accountDeleted?.(acc);
      await this.store.update((s) => {
        delete s.accounts[id];
        delete s.origins[id];
        for (const [svc, a] of Object.entries(s.lastAccount)) if (a === id) delete s.lastAccount[svc];
      });
      await this.platform.accountsChanged?.();
      return true;
    }
    /** User-driven switch (popup / picker). Never touches other tabs. */
    async setTabAccount(tabId, accountId, { url, remember = true } = {}) {
      const tab = await ext.tabs.get(tabId);
      const target = url || tab.url;
      const sid = this.serviceOfUrl(target) || this.getTab(tabId).home;
      if (accountId && !this.accounts[accountId]) throw new Error("no such account");
      if (accountId && this.accounts[accountId].serviceId !== sid) throw new Error("account belongs to another service");
      if (remember && sid) {
        await this.store.update((s) => {
          s.lastAccount[sid] = accountId || null;
        });
        await this.platform.modesChanged?.();
      }
      this.setTab(tabId, { home: sid, flow: null });
      const newTabId = await this.platform.moveTab(tabId, accountId, { url: target, explicit: true });
      return { tabId: newTabId ?? tabId };
    }
    // ---- settings & services ------------------------------------------------------
    async setSettings(patch) {
      await this.store.update((s) => {
        for (const k of ["defaultMode", "theme", "border", "badge", "tabGroups"]) if (patch[k] !== void 0) s.settings[k] = patch[k];
        if (!MODES.includes(s.settings.defaultMode)) s.settings.defaultMode = "default";
      });
      await this.platform.settingsChanged?.();
      return this.state.settings;
    }
    async setServiceMode(serviceId, mode) {
      await this.store.update((s) => {
        if (!mode || mode === "inherit") delete s.settings.modes[serviceId];
        else if (MODES.includes(mode)) s.settings.modes[serviceId] = mode;
      });
      await this.platform.settingsChanged?.();
    }
    async serviceEdit(op, a) {
      await this.store.update((s) => {
        switch (op) {
          case "create": {
            const id = "user:" + uid(8);
            s.user = opCreateService(s.user, id, a.name || "New service", a.domains || []);
            a._id = id;
            break;
          }
          case "rename":
            s.user = opRenameService(s.user, a.id, a.name);
            break;
          case "assign":
            s.user = opSetDomains(s.user, a.id, a.domains);
            break;
          case "unassign":
            s.user = opUnsetDomain(s.user, a.domain);
            break;
          case "delete": {
            s.user = opDeleteService(s.user, a.id);
            for (const acc of Object.values(s.accounts)) if (acc.serviceId === a.id) acc.serviceId = a.into || "auto:orphan";
            break;
          }
          case "merge": {
            const r = new Resolver({ catalog, user: s.user });
            const doms = r.domains(a.from);
            s.user = opSetDomains(s.user, a.to, doms);
            for (const acc of Object.values(s.accounts)) if (acc.serviceId === a.from) acc.serviceId = a.to;
            if (s.user.services[a.from]) s.user = opDeleteService(s.user, a.from);
            break;
          }
          case "split": {
            const id = "user:" + uid(8);
            s.user = opCreateService(s.user, id, a.name || "New service", a.domains);
            a._id = id;
            break;
          }
          default:
            throw new Error("unknown service op " + op);
        }
      });
      await this.platform.servicesChanged?.();
      for (const [id, t] of this.tabs) this.tabs.set(id, { ...t, flow: null });
      return { id: a._id };
    }
    allServices() {
      const extra = new Set(Object.values(this.accounts).map((a) => a.serviceId));
      for (const id of Object.keys(this.state.settings.modes)) extra.add(id);
      const list = this.resolver.list([...extra]);
      return list.map((s) => ({ ...s, accounts: this.accountsOf(s.id).length, mode: this.state.settings.modes[s.id] || null })).sort((a, b) => b.accounts - a.accounts || Object.keys(this.state.settings.modes).includes(b.id) - Object.keys(this.state.settings.modes).includes(a.id) || a.name.localeCompare(b.name));
    }
    // ---- messages -----------------------------------------------------------------
    async handle(msg, sender) {
      switch (msg.type) {
        case "ping":
          return { ok: true, target: TARGET };
        case "tabInfo":
          return this.tabInfo(msg.tabId);
        case "state":
          return {
            settings: this.state.settings,
            accounts: Object.values(this.accounts).map((a) => this.publicAccount(a)),
            services: this.allServices(),
            target: TARGET,
            user: this.state.user
          };
        case "identity":
          return this.identityFor(sender?.tab?.id ?? msg.tabId);
        case "createAccount":
          return this.createAccount(msg);
        case "updateAccount":
          return this.updateAccount(msg.id, msg.patch);
        case "deleteAccount":
          return this.deleteAccount(msg.id);
        case "setTabAccount":
          return this.setTabAccount(msg.tabId, msg.accountId, { url: msg.url, remember: msg.remember !== false });
        case "setSettings":
          return this.setSettings(msg.patch);
        case "setServiceMode":
          return this.setServiceMode(msg.serviceId, msg.mode);
        case "serviceEdit":
          return this.serviceEdit(msg.op, { ...msg.args });
        case "picker":
          return this.pickerInfo(msg.tabId);
        case "pickerChoice":
          return this.pickerChoice(msg);
        case "resolve": {
          const id = this.serviceOfUrl(msg.url);
          return id ? this.serviceInfo(id) : null;
        }
        case "gesture?":
          return { ok: true };
        default:
          return this.platform.handleMessage?.(msg, sender);
      }
    }
    pickerInfo(tabId) {
      const p = this.pickerFor.get(tabId);
      if (!p) return null;
      return { url: p.url, service: this.serviceInfo(p.serviceId), accounts: this.accountsOf(p.serviceId).map((a) => this.publicAccount(a)), tabId };
    }
    async pickerChoice({ tabId, accountId, remember }) {
      const p = this.pickerFor.get(tabId);
      if (!p) throw new Error("no picker pending for tab");
      if (remember) await this.store.update((s) => {
        s.settings.modes[p.serviceId] = "remember";
      });
      await this.store.update((s) => {
        s.lastAccount[p.serviceId] = accountId || null;
      });
      await this.platform.modesChanged?.();
      this.pickerFor.delete(tabId);
      this.setTab(tabId, { home: p.serviceId, flow: null });
      const id = await this.platform.moveTab(tabId, accountId, { url: p.url, explicit: true, fromPicker: true });
      return { tabId: id ?? tabId };
    }
  };

  // src/core/identity.js
  var cache = /* @__PURE__ */ new Map();
  var b64 = (buf) => {
    let s = "";
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    return btoa(s);
  };
  var toDataUrl = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  var esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);
  var dot = (color) => `<circle cx="47" cy="47" r="14.5" fill="${esc(color)}" stroke="#fff" stroke-width="4.5"/>`;
  function svgData(svg) {
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  }
  function letterIcon(host, color) {
    const ch = (host || "?").replace(/^www\./, "").charAt(0).toUpperCase();
    return svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#64748b"/><text x="32" y="43" font-size="32" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${esc(ch)}</text>${dot(color)}</svg>`);
  }
  async function badgedIcon(href, color, host) {
    const key = href + "|" + color;
    if (cache.has(key)) return cache.get(key);
    let out;
    try {
      const res = await fetch(href, { credentials: "omit", cache: "force-cache" });
      if (!res.ok) throw new Error("http " + res.status);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      const buf = await res.arrayBuffer();
      if (type.includes("svg") || /\.svg(\?|$)/i.test(href)) {
        const inner = "data:image/svg+xml;base64," + b64(buf);
        out = { dataUrl: svgData(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image href="${inner}" width="64" height="64"/>${dot(color)}</svg>`), type: "image/svg+xml" };
      } else {
        const bmp = await createImageBitmap(new Blob([buf], { type: type || "image/png" }));
        const S = 64, c = new OffscreenCanvas(S, S), g2 = c.getContext("2d");
        const k = Math.min(S / bmp.width, S / bmp.height);
        g2.drawImage(bmp, (S - bmp.width * k) / 2, (S - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        g2.beginPath();
        g2.arc(47, 47, 14.5, 0, Math.PI * 2);
        g2.fillStyle = color;
        g2.fill();
        g2.lineWidth = 4.5;
        g2.strokeStyle = "#fff";
        g2.stroke();
        out = { dataUrl: await toDataUrl(await c.convertToBlob({ type: "image/png" })), type: "image/png" };
      }
    } catch {
      out = { dataUrl: letterIcon(host, color), type: "image/svg+xml" };
    }
    if (cache.size > 200) cache.clear();
    cache.set(key, out);
    return out;
  }

  // src/chrome/jar.js
  var TRUSTWORTHY = (host) => host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  var isSecureUrl = (u) => u.protocol === "https:" || u.protocol === "wss:" || TRUSTWORTHY(u.hostname);
  var siteOf = (hostOrUrl) => {
    let h = hostOrUrl;
    try {
      if (/^[a-z]+:\/\//i.test(h)) h = new URL(h).hostname;
    } catch {
    }
    return getDomain2(h, { allowPrivateDomains: true }) || h;
  };
  var lc = (s) => s.toLowerCase();
  var isIp3 = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":");
  function defaultPath(u) {
    const p = u.pathname;
    if (!p || p[0] !== "/") return "/";
    const i = p.lastIndexOf("/");
    return i <= 0 ? "/" : p.slice(0, i);
  }
  function domainMatch(host, domain) {
    return host === domain || host.endsWith("." + domain) && !isIp3(host);
  }
  function pathMatch(reqPath, cPath) {
    if (reqPath === cPath) return true;
    if (reqPath.startsWith(cPath)) return cPath.endsWith("/") || reqPath[cPath.length] === "/";
    return false;
  }
  function parseSetCookie(header, url, { fromJs = false, now = Date.now() } = {}) {
    const u = typeof url === "string" ? new URL(url) : url;
    const parts = header.split(";");
    const first = parts.shift();
    const eq = first.indexOf("=");
    let name, value;
    if (eq < 0) {
      name = "";
      value = first.trim();
    } else {
      name = first.slice(0, eq).trim();
      value = first.slice(eq + 1).trim();
    }
    if (!name && !value) return null;
    if (name.length + value.length > 4096) return null;
    const c = { name, value, domain: u.hostname, hostOnly: true, path: defaultPath(u), secure: false, httpOnly: false, sameSite: "", expires: null, created: now };
    let maxAge = null, expires = null;
    for (const raw of parts) {
      const i = raw.indexOf("=");
      const k = lc((i < 0 ? raw : raw.slice(0, i)).trim());
      const v = i < 0 ? "" : raw.slice(i + 1).trim();
      if (k === "expires") {
        const t = Date.parse(v);
        if (!isNaN(t)) expires = t;
      } else if (k === "max-age") {
        if (/^-?\d+$/.test(v)) maxAge = parseInt(v, 10);
      } else if (k === "domain") {
        let d = lc(v).replace(/^\./, "");
        if (!d) continue;
        if (!domainMatch(u.hostname, d)) return null;
        if (!isIp3(d) && !getDomain2(d, { allowPrivateDomains: true }) && d !== u.hostname) return null;
        c.domain = d;
        c.hostOnly = false;
      } else if (k === "path") {
        if (v.startsWith("/")) c.path = v;
      } else if (k === "secure") c.secure = true;
      else if (k === "httponly") c.httpOnly = true;
      else if (k === "samesite") {
        const s = lc(v);
        c.sameSite = s === "strict" ? "strict" : s === "none" ? "none" : "lax";
      }
    }
    if (fromJs && c.httpOnly) return null;
    if (maxAge !== null) c.expires = maxAge <= 0 ? 0 : now + maxAge * 1e3;
    else if (expires !== null) c.expires = expires;
    if (c.secure && !isSecureUrl(u)) return null;
    if (c.sameSite === "none" && !c.secure) return null;
    const lname = lc(name);
    if (lname.startsWith("__secure-") && !c.secure) return null;
    if (lname.startsWith("__host-") && (!c.secure || !c.hostOnly || c.path !== "/")) return null;
    return c;
  }
  var Jar = class {
    constructor() {
      this.data = /* @__PURE__ */ new Map();
    }
    // accountId -> Map(key -> cookie)
    load(accountId, list) {
      this.data.set(accountId, new Map((list || []).map((c) => [this.key(c), c])));
    }
    has(accountId) {
      return this.data.has(accountId);
    }
    key(c) {
      return `${c.domain}\0${c.path}\0${c.name}${c.hostOnly ? "\0h" : ""}`;
    }
    map(accountId) {
      let m = this.data.get(accountId);
      if (!m) {
        m = /* @__PURE__ */ new Map();
        this.data.set(accountId, m);
      }
      return m;
    }
    list(accountId) {
      return [...this.map(accountId).values()];
    }
    clear(accountId) {
      this.data.delete(accountId);
    }
    /** Store a parsed cookie (or delete when expired). Returns true when the jar changed. */
    put(accountId, c, { fromJs = false, now = Date.now() } = {}) {
      const m = this.map(accountId);
      const k = this.key(c);
      const old = m.get(k);
      if (old && old.httpOnly && fromJs) return false;
      if (c.expires !== null && c.expires <= now) {
        return m.delete(k);
      }
      if (old) c.created = old.created;
      m.set(k, c);
      return true;
    }
    /** Apply Set-Cookie header(s) seen on a response. `ctx.sameSiteOk` is not needed for storing. */
    setFromHeader(accountId, url, header, now = Date.now()) {
      const c = parseSetCookie(header, url, { now });
      return c ? this.put(accountId, c, { now }) : false;
    }
    setFromJs(accountId, url, str, now = Date.now()) {
      const c = parseSetCookie(str, url, { fromJs: true, now });
      return c ? this.put(accountId, c, { fromJs: true, now }) : false;
    }
    /**
     * Cookies to send for `url`.
     * ctx: 'same' (same-site request/document), 'nav' (cross-site top-level GET navigation), 'cross' (cross-site subresource/iframe)
     */
    match(accountId, url, { ctx = "same", includeHttpOnly = true, now = Date.now() } = {}) {
      const u = typeof url === "string" ? new URL(url) : url;
      const m = this.data.get(accountId);
      if (!m) return [];
      const secureUrl = isSecureUrl(u);
      const out = [];
      for (const [k, c] of m) {
        if (c.expires !== null && c.expires <= now) {
          m.delete(k);
          continue;
        }
        if (c.hostOnly ? u.hostname !== c.domain : !domainMatch(u.hostname, c.domain)) continue;
        if (!pathMatch(u.pathname || "/", c.path)) continue;
        if (c.secure && !secureUrl) continue;
        if (!includeHttpOnly && c.httpOnly) continue;
        const ss = c.sameSite || "lax";
        if (ctx === "cross" && ss !== "none") continue;
        if (ctx === "nav" && ss === "strict") continue;
        out.push(c);
      }
      out.sort((a, b) => b.path.length - a.path.length || a.created - b.created);
      return out;
    }
    header(accountId, url, opts) {
      const cs = this.match(accountId, url, opts);
      return cs.length ? cs.map((c) => c.name ? `${c.name}=${c.value}` : c.value).join("; ") : "";
    }
    documentCookie(accountId, url) {
      return this.header(accountId, url, { ctx: "same", includeHttpOnly: false });
    }
    toJSON(accountId) {
      return this.list(accountId);
    }
  };
  function requestContext({ url, topUrl, initiator, type, method }) {
    const reqSite = siteOf(url);
    if (type === "main_frame") {
      if (!initiator) return "same";
      return siteOf(initiator) === reqSite ? "same" : method === "GET" ? "nav" : "cross";
    }
    const top = topUrl ? siteOf(topUrl) : initiator ? siteOf(initiator) : reqSite;
    return top === reqSite ? "same" : "cross";
  }

  // src/platform/chrome-proxy.js
  var hostIn = (host, d) => host === d || host.endsWith("." + d);
  var rule = (p) => `${p.type === "socks5" ? "SOCKS5" : p.type === "https" ? "HTTPS" : "PROXY"} ${p.host}:${p.port}`;
  var ChromeProxy = class {
    constructor(base2) {
      this.b = base2;
      this.observed = /* @__PURE__ */ new Map();
      this.leaks = /* @__PURE__ */ new Map();
      this.errors = /* @__PURE__ */ new Map();
      this.authFails = /* @__PURE__ */ new Map();
      this.attempts = /* @__PURE__ */ new Map();
      this.control = "unknown";
      this.applied = null;
      this.timer = null;
    }
    /** Listeners (registered synchronously in MV3 so they can wake the service worker; `wrap` gates them on start-up). */
    bindEvents(wrap = (f) => f) {
      const b = this.b;
      try {
        ext.proxy.onProxyError?.addListener?.(wrap((e) => this.noteError(null, "Proxy error: " + (e.error || e.details || "unknown"))));
      } catch {
      }
      ext.webRequest.onAuthRequired.addListener((d, cb) => {
        b.readyP.then(() => this.onAuth(d, cb));
      }, { urls: ["<all_urls>"] }, ["asyncBlocking"]);
      ext.webRequest.onErrorOccurred.addListener(wrap((d) => {
        if (!/PROXY|TUNNEL|SOCKS/.test(d.error || "")) return;
        const accId = b.accountOf(d.tabId);
        const acc = accId && b.c.accounts[accId];
        if (acc && acc.proxy) this.noteError(accId, `Proxy ${acc.proxy.host}:${acc.proxy.port} failed (${d.error.replace("net::ERR_", "")}). The request was blocked, not sent directly.`, d.tabId);
      }), { urls: ["<all_urls>"] });
      this.bound = true;
    }
    async init() {
      if (!this.bound) this.bindEvents();
      await this.recompute(true);
    }
    noteError(accId, msg, tabId) {
      if (accId) this.errors.set(accId, msg);
      for (const id of accId ? [...this.b.c.tabs.entries()].filter(([, t]) => t.accountId === accId).map(([i]) => i) : []) this.b.pushIdentity(id);
    }
    onAuth(d, cb) {
      if (!d.isProxy) {
        cb({});
        return;
      }
      const n = (this.attempts.get(d.requestId) || 0) + 1;
      this.attempts.set(d.requestId, n);
      const accs = Object.values(this.b.c.accounts).filter((a) => a.proxy && a.proxy.host === d.challenger.host && Number(a.proxy.port) === Number(d.challenger.port));
      const tabAcc = this.b.accountOf(d.tabId);
      const acc = accs.find((a) => a.id === tabAcc) || accs.find((a) => a.proxy.username);
      if (!acc || !acc.proxy.username || n > 2) {
        if (acc) {
          this.authFails.set(acc.id, true);
          this.errors.set(acc.id, `Proxy ${acc.proxy.host}:${acc.proxy.port} rejected the credentials.`);
        }
        cb({});
        return;
      }
      cb({ authCredentials: { username: acc.proxy.username, password: acc.proxy.password } });
    }
    // ---- bookkeeping
    /** Called for every request of a tab inside a proxied account. */
    observe(accId, tabId, host) {
      if (!host) return;
      const acc = this.b.c.accounts[accId];
      if (!acc || !acc.proxy) return;
      const covered = this.coveredHosts(accId);
      if (covered.has(host) || [...covered].some((d) => hostIn(host, d))) return;
      let s = this.observed.get(accId);
      if (!s) this.observed.set(accId, s = /* @__PURE__ */ new Set());
      s.add(host);
      let l = this.leaks.get(tabId);
      if (!l) this.leaks.set(tabId, l = /* @__PURE__ */ new Set());
      l.add(host);
      this.recompute();
      this.b.pushIdentity(tabId);
    }
    coveredHosts(accId) {
      const acc = this.b.c.accounts[accId];
      const set = /* @__PURE__ */ new Set();
      if (!acc) return set;
      for (const d of this.b.c.resolver.domains(acc.serviceId)) set.add(d);
      for (const h of this.observed.get(accId) || []) set.add(h);
      return set;
    }
    isActive(accId) {
      return !!this.applied && this.activeAccounts().some((a) => a.id === accId) && this.applied.includes(JSON.stringify([...this.coveredHosts(accId)][0] || ""));
    }
    activeAccounts() {
      const ids = /* @__PURE__ */ new Set();
      for (const t of this.b.c.tabs.values()) if (t.accountId) ids.add(t.accountId);
      return [...ids].map((i) => this.b.c.accounts[i]).filter((a) => a && a.proxy);
    }
    buildPac() {
      const rules = [];
      const seen = /* @__PURE__ */ new Map();
      for (const acc of this.activeAccounts()) {
        for (const d of this.coveredHosts(acc.id)) {
          if (!seen.has(d)) {
            seen.set(d, acc.id);
            rules.push([d, rule(acc.proxy)]);
          }
        }
      }
      this.claims = seen;
      const pac = `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  var R = ${JSON.stringify(rules)};
  for (var i = 0; i < R.length; i++) { var d = R[i][0]; if (host === d || (host.length > d.length && host.substr(host.length - d.length - 1) === "." + d)) return R[i][1]; }
  return "DIRECT";
}`;
      return { pac, rules };
    }
    async recompute(now = false) {
      clearTimeout(this.timer);
      const run = async () => {
        try {
          const active = this.activeAccounts();
          if (!active.length) {
            if (this.applied !== null) {
              await ext.proxy.settings.clear({ scope: "regular" });
              await this.setWebRtc(false);
              this.applied = null;
            }
          } else {
            const { pac } = this.buildPac();
            if (pac !== this.applied) {
              await ext.proxy.settings.set({ value: { mode: "pac_script", pacScript: { data: pac, mandatory: true } }, scope: "regular" });
              this.applied = pac;
            }
            await this.setWebRtc(true);
          }
          const cur = await ext.proxy.settings.get({});
          this.control = cur.levelOfControl;
        } catch (e) {
          this.control = "error:" + e.message;
        }
        for (const [id, t] of this.b.c.tabs) if (t.accountId && this.b.c.accounts[t.accountId]?.proxy) this.b.pushIdentity(id);
      };
      if (now) return run();
      this.timer = setTimeout(run, 40);
      this.pending = this.timer;
    }
    async setWebRtc(on) {
      try {
        const p = ext.privacy?.network?.webRTCIPHandlingPolicy;
        if (!p) return;
        if (on) await p.set({ value: "disable_non_proxied_udp" });
        else await p.clear({});
      } catch {
      }
    }
    statusFor(tabId, acc) {
      if (!acc.proxy) return null;
      const msgs = [];
      let level = "ok";
      const bump = (l, m) => {
        msgs.push(m);
        if (l === "fail" || l === "warn" && level === "ok") level = l;
      };
      const label = `${acc.proxy.type.toUpperCase()} ${acc.proxy.host}:${acc.proxy.port}`;
      if (this.errors.get(acc.id)) bump("fail", this.errors.get(acc.id));
      if (this.control && this.control !== "controlled_by_this_extension" && this.control !== "unknown") bump("fail", `Chrome's proxy setting is controlled by ${this.control.replace(/_/g, " ")}; Box cannot route this account through ${label}.`);
      const covered = this.coveredHosts(acc.id);
      const sharing = [];
      for (const [id, st] of this.b.c.tabs) {
        if (id === tabId || st.accountId === acc.id) continue;
        const h = hostOf(this.b.tabTop.get(id) || "");
        if (h && [...covered].some((d) => hostIn(h, d))) sharing.push(h);
      }
      if (sharing.length) bump("warn", `${sharing.length} other tab(s) outside this account (default session or other accounts) use the same sites, so Chrome sends them through ${label} too \u2014 Chrome has one proxy setting for the whole browser.`);
      const conflicts = [];
      if (this.claims) for (const d of covered) {
        const owner = this.claims.get(d);
        if (owner && owner !== acc.id && this.activeAccounts().some((x) => x.id === owner)) conflicts.push(d);
      }
      if (conflicts.length) bump("warn", `Another proxied account claims the same site(s) (${[...new Set(conflicts)].slice(0, 3).join(", ")}); only one proxy can apply.`);
      const leaks = this.leaks.get(tabId);
      if (leaks && leaks.size) bump("warn", `${leaks.size} host(s) were first contacted before Box could add them to the proxy rule and may have connected directly: ${[...leaks].slice(0, 3).join(", ")}${leaks.size > 3 ? "\u2026" : ""}.`);
      if (level === "ok") msgs.push(`Routed through ${label}. Applies to this account\u2019s known hosts; unseen third-party hosts are added when first contacted.`);
      return { level, messages: msgs };
    }
    debug() {
      return { applied: this.applied, control: this.control, observed: Object.fromEntries([...this.observed].map(([k, v]) => [k, [...v]])), errors: Object.fromEntries(this.errors) };
    }
  };

  // src/platform/chrome-base.js
  var SYNC_PATH = "/__box_sync";
  var pfxOf = (accId) => "__box_" + accId.replace(/^acc_/, "") + "__";
  var prefixFor = pfxOf;
  var ChromeBase = class {
    constructor() {
      this.jar = new Jar();
      this.tabTop = /* @__PURE__ */ new Map();
      this.windowType = /* @__PURE__ */ new Map();
      this.tabMeta = /* @__PURE__ */ new Map();
      this.gestures = /* @__PURE__ */ new Map();
      this.expect = /* @__PURE__ */ new Map();
      this.saveTimers = /* @__PURE__ */ new Map();
      this.wipeTabs = /* @__PURE__ */ new Set();
      this.proxy = new ChromeProxy(this);
      this.readyP = new Promise((r) => {
        this.markReady = r;
      });
      this.gateEvents = (fn) => (...a) => this.readyP.then(() => fn.apply(this, a)).catch((e) => console.error("event handler", e));
    }
    bindEvents(wrap = (f) => f) {
      this.eventsBound = true;
      ext.windows.onCreated.addListener(wrap((w) => this.windowType.set(w.id, w.type)));
      ext.windows.onRemoved.addListener(wrap((id) => this.windowType.delete(id)));
      ext.tabs.onCreated.addListener(wrap((t) => this.onTabCreated(t)));
      ext.tabs.onRemoved.addListener(wrap((id) => this.onTabRemoved(id)));
      ext.tabs.onUpdated.addListener(wrap((id, info) => {
        if (info.status === "complete" || info.url) this.pushIdentity(id);
      }));
      ext.tabs.onActivated?.addListener?.(wrap(({ tabId }) => this.pushIdentity(tabId)));
      ext.webNavigation.onCreatedNavigationTarget?.addListener?.(wrap((d) => this.onNavTarget(d)));
      ext.webNavigation.onCommitted.addListener(wrap((d) => {
        if (d.frameId === 0) {
          this.tabTop.set(d.tabId, d.url);
          this.afterCommit(d);
        }
      }));
    }
    // ------------------------------------------------------------------ lifecycle
    async init(c) {
      this.c = c;
      await this.loadJars();
      for (const w of await ext.windows.getAll()) this.windowType.set(w.id, w.type);
      this.restoredTabs = /* @__PURE__ */ new Set();
      for (const t of await ext.tabs.query({})) {
        this.trackTab(t, true);
        this.restoredTabs.add(t.id);
      }
      if (!this.eventsBound) this.bindEvents();
      await this.installNet();
      await this.proxy.init();
      this.markReady();
    }
    trackTab(t, initial = false) {
      this.tabMeta.set(t.id, { opener: t.openerTabId, windowId: t.windowId });
      if (t.url && isWebUrl(t.url)) this.tabTop.set(t.id, t.url);
      if (!this.c.tabs.has(t.id)) this.c.setTab(t.id, { accountId: null, home: isWebUrl(t.url || "") ? this.c.serviceOfUrl(t.url) : null, flow: null });
    }
    onTabCreated(t) {
      this.tabMeta.set(t.id, { opener: t.openerTabId, windowId: t.windowId });
      if (!this.c.tabs.has(t.id)) this.c.setTab(t.id, { accountId: null, home: null, flow: null });
    }
    onNavTarget(d) {
      if (this.c.getTab(d.tabId).accountId) return;
      const src = this.c.tabs.get(d.sourceTabId);
      if (src && src.accountId) {
        this.c.setTab(d.tabId, { accountId: src.accountId, home: src.home, flow: null });
        this.accountAssigned(d.tabId, null, src.accountId);
      }
    }
    onTabRemoved(id) {
      const st = this.c.tabs.get(id);
      this.tabMeta.delete(id);
      this.tabTop.delete(id);
      this.gestures.delete(id);
      this.expect.delete(id);
      this.c.dropTab(id);
      if (st && st.accountId) {
        this.accountUnassigned(id, st.accountId);
        this.proxy.recompute?.();
      }
    }
    afterCommit() {
    }
    // ------------------------------------------------------------------ jars
    async loadJars() {
      const all = await ext.storage.local.get(null);
      for (const [k, v] of Object.entries(all)) if (k.startsWith("jar:")) this.jar.load(k.slice(4), v);
    }
    jarDirty(accId) {
      clearTimeout(this.saveTimers.get(accId));
      this.saveTimers.set(accId, setTimeout(() => {
        if (this.c.accounts[accId]) ext.storage.local.set({ ["jar:" + accId]: this.jar.list(accId) });
      }, 250));
    }
    async dropJar(accId) {
      this.jar.clear(accId);
      clearTimeout(this.saveTimers.get(accId));
      await ext.storage.local.remove("jar:" + accId);
    }
    accountOf(tabId) {
      return tabId >= 0 ? this.c.getTab(tabId).accountId : null;
    }
    /** Cookie header value for a request of an account tab, or '' */
    cookieHeaderFor(accId, d) {
      const ctx = requestContext({ url: d.url, topUrl: this.tabTop.get(d.tabId), initiator: d.initiator, type: d.type, method: d.method || "GET" });
      return this.jar.header(accId, d.url, { ctx });
    }
    storeSetCookies(accId, url, values) {
      let changed = false;
      for (const v of values) if (this.jar.setFromHeader(accId, url, v)) changed = true;
      else if (/max-age=0|expires=/i.test(v)) changed = true;
      if (changed) this.jarDirty(accId);
    }
    // ------------------------------------------------------------------ sync ops (shim <-> background)
    syncOp(tabId, frameId, q, extra = {}) {
      if (q.op === "gesture") {
        this.gestures.set(tabId, Date.now());
        return { ok: 1 };
      }
      const accId = this.accountOf(tabId);
      if (!accId) return { acct: null };
      switch (q.op) {
        case "sw":
          this.swControlled?.add(tabId);
          this.onServiceWorkerControl?.(tabId);
          return { ok: 1 };
        case "hello":
          return { acct: accId, pfx: pfxOf(accId), proxied: !!this.c.accounts[accId]?.proxy, nonce: this.nonceFor?.(tabId, frameId, extra.parentFrameId) || "" };
        case "c.get":
          return { v: this.jar.documentCookie(accId, q.u) };
        case "c.list":
          return { v: this.jar.match(accId, q.u, { ctx: "same", includeHttpOnly: false }) };
        case "c.set":
          if (this.jar.setFromJs(accId, q.u, q.v)) this.jarDirty(accId);
          return { v: this.jar.documentCookie(accId, q.u) };
        case "touch":
          this.touchOrigin(accId, q.o);
          return { ok: 1 };
        case "gesture":
          this.gestures.set(tabId, Date.now());
          return { ok: 1 };
        default:
          return { error: "unknown op" };
      }
    }
    touchOrigin(accId, origin) {
      const o = this.c.state.origins[accId] || [];
      if (!origin || origin === "null" || o.includes(origin)) return;
      this.c.store.update((s) => {
        (s.origins[accId] = s.origins[accId] || []).push(origin);
      });
    }
    // ------------------------------------------------------------------ navigation helpers
    hasRecentGesture(tabId) {
      const t = this.gestures.get(tabId);
      return !!t && Date.now() - t < 1500;
    }
    async queryGesture(tabId) {
      try {
        const r = await ext.tabs.sendMessage(tabId, { box: true, type: "gesture?" });
        return !!(r && r.recent);
      } catch {
        return false;
      }
    }
    isPopupTab(tabId) {
      const m = this.tabMeta.get(tabId);
      return !!(m && m.opener != null && this.windowType.get(m.windowId) === "popup");
    }
    pickerUrl(tabId) {
      return ext.runtime.getURL(`picker.html?tab=${tabId}`);
    }
    // ------------------------------------------------------------------ account lifecycle
    async accountCreated(acc) {
      return {};
    }
    async accountUpdated(acc) {
      for (const [id, t] of this.c.tabs) if (t.accountId === acc.id) this.pushIdentity(id);
      this.proxy.recompute();
      this.updateGroups();
      return {};
    }
    async accountsChanged() {
      this.updateGroups();
      this.proxy.recompute();
    }
    async settingsChanged() {
      for (const id of this.c.tabs.keys()) this.pushIdentity(id);
      this.updateGroups();
    }
    async accountDeleted(acc) {
      const origins = this.c.state.origins[acc.id] || [];
      const prefix = pfxOf(acc.id);
      await this.dropJar(acc.id);
      const pending = [];
      for (const origin of origins) {
        const ok = await this.wipeOrigin(origin, acc.id, prefix).catch(() => false);
        if (!ok) pending.push(origin);
      }
      if (pending.length) {
        const got = await ext.storage.local.get("pendingWipes");
        const pw = got.pendingWipes || {};
        for (const o of pending) (pw[o] = pw[o] || []).push({ accountId: acc.id, prefix });
        await ext.storage.local.set({ pendingWipes: pw });
      }
      this.proxy.recompute();
    }
    /** Open a short-lived background tab on `origin`, let the content script erase the account's namespaced data. */
    async wipeOrigin(origin, accId, prefix) {
      const tab = await this.openWipeTab(origin);
      try {
        for (let i = 0; i < 40; i++) {
          await sleep(150);
          let t;
          try {
            t = await ext.tabs.get(tab.id);
          } catch {
            return false;
          }
          if (t.status === "complete" && t.url && t.url.startsWith(origin)) {
            try {
              const r = await ext.tabs.sendMessage(tab.id, { box: true, type: "wipe", accountId: accId, prefix });
              if (r && !r.error) return true;
            } catch {
            }
          }
        }
        return false;
      } finally {
        this.wipeTabs.delete(tab.id);
        try {
          await ext.tabs.remove(tab.id);
        } catch {
        }
      }
    }
    /** MV2: the request reaches the site (with its cookies stripped by the blocking handler). MV3 overrides this to serve the page locally. */
    async openWipeTab(origin) {
      const tab = await ext.tabs.create({ url: "about:blank", active: false });
      this.wipeTabs.add(tab.id);
      await ext.tabs.update(tab.id, { url: origin + "/__box_wipe" });
      return tab;
    }
    async handleMessage(msg, sender) {
      switch (msg.type) {
        case "pendingWipes": {
          const got = await ext.storage.local.get("pendingWipes");
          const w = (got.pendingWipes || {})[msg.origin];
          return { wipes: w || [] };
        }
        case "wipeDone": {
          const got = await ext.storage.local.get("pendingWipes");
          const pw = got.pendingWipes || {};
          if (pw[msg.origin]) {
            pw[msg.origin] = pw[msg.origin].filter((x) => x.accountId !== msg.accountId);
            if (!pw[msg.origin].length) delete pw[msg.origin];
            await ext.storage.local.set({ pendingWipes: pw });
          }
          return true;
        }
        case "gesture":
          this.gestures.set(sender.tab.id, Date.now());
          return true;
        case "adopt":
          return this.adoptTab(sender.tab.id, msg.accountId);
        case "restoreIsolation":
          return this.restoreIsolation?.(msg.tabId);
      }
      return void 0;
    }
    /** A restored tab (after browser restart) carries its account id in sessionStorage; re-enter it. */
    async adoptTab(tabId, accountId) {
      if (!this.restoredTabs.has(tabId) || !this.c.accounts[accountId] || this.c.getTab(tabId).accountId) return false;
      this.restoredTabs.delete(tabId);
      const tab = await ext.tabs.get(tabId);
      await this.moveTab(tabId, accountId, { url: tab.url });
      return true;
    }
    // ------------------------------------------------------------------ identity
    async pushIdentity(tabId) {
      try {
        await ext.tabs.sendMessage(tabId, { box: true, type: "identity", identity: this.c.identityFor(tabId) });
      } catch {
      }
      this.paintBadge(tabId);
    }
    tabChanged(tabId) {
      this.pushIdentity(tabId);
    }
    async paintBadge(tabId) {
      try {
        const st = this.c.getTab(tabId);
        const status = this.status(tabId, st);
        const act = ext.action || ext.browserAction;
        const warn = st.accountId && status.level !== "ok";
        await act.setBadgeText({ tabId, text: warn ? "!" : "" });
        if (warn) await act.setBadgeBackgroundColor({ tabId, color: status.level === "fail" ? "#e5484d" : "#d97706" });
      } catch {
      }
    }
    status(tabId, tab) {
      const msgs = [], level = [];
      let action = null;
      const acc = tab.accountId ? this.c.accounts[tab.accountId] : null;
      if (!acc) return { level: "ok", messages: [] };
      const iso = this.isolationStatus?.(tabId);
      if (iso) {
        level.push(iso.level);
        msgs.push(...iso.messages);
        if (iso.action) action = iso.action;
      }
      const px = this.proxy.statusFor(tabId, acc);
      if (px) {
        level.push(px.level);
        msgs.push(...px.messages);
      }
      const rank = { ok: 0, warn: 1, fail: 2 };
      return { level: level.reduce((a, b) => rank[b] > rank[a] ? b : a, "ok"), messages: msgs, action };
    }
    async updateGroups() {
      if (!ext.tabs.group || !ext.tabGroups || !this.c.state.settings.tabGroups) return;
      try {
        const tabs = await ext.tabs.query({});
        const byKey = /* @__PURE__ */ new Map();
        for (const t of tabs) {
          const st = this.c.tabs.get(t.id);
          if (!st || !st.accountId || this.wipeTabs.has(t.id)) continue;
          const key = st.accountId + "@" + t.windowId;
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(t);
        }
        for (const [, list] of byKey) {
          const acc = this.c.accounts[this.c.tabs.get(list[0].id).accountId];
          if (!acc) continue;
          const ungrouped = list.filter((t) => t.groupId === -1 || t.groupId === void 0);
          const existing = list.find((t) => t.groupId >= 0);
          if (!ungrouped.length && !existing) continue;
          let gid = existing && existing.groupId;
          if (ungrouped.length) gid = await ext.tabs.group(existing ? { tabIds: ungrouped.map((t) => t.id), groupId: gid } : { tabIds: ungrouped.map((t) => t.id) });
          await ext.tabGroups.update(gid, { title: acc.name, color: nearest(acc.color, CHROME_GROUP_COLORS) });
        }
        for (const t of tabs) {
          const st = this.c.tabs.get(t.id);
          if (t.groupId >= 0 && (!st || !st.accountId)) {
            try {
              await ext.tabs.ungroup(t.id);
            } catch {
            }
          }
        }
      } catch {
      }
    }
    // ------------------------------------------------------------------ moving a tab between accounts (no tab recreation on Chrome)
    async moveTab(tabId, accountId, { url } = {}) {
      const c = this.c;
      const tab = await ext.tabs.get(tabId);
      const target = url || tab.url;
      const web = isWebUrl(target);
      this.restoredTabs?.delete(tabId);
      const prev = c.getTab(tabId).accountId || null;
      c.setTab(tabId, { accountId: accountId || null, home: web ? c.serviceOfUrl(target) : c.getTab(tabId).home, flow: null });
      await this.accountAssigned(tabId, prev, accountId || null);
      await this.proxy.recompute(true);
      if (web) {
        this.expect.set(tabId, target);
        await ext.tabs.update(tabId, { url: target });
      }
      this.pushIdentity(tabId);
      this.updateGroups();
      this.proxy.recompute();
      return tabId;
    }
    // hooks overridden by builds
    async accountAssigned(tabId, prev, next) {
    }
    async accountUnassigned(tabId, prev) {
    }
    async installNet() {
    }
    async testCall(call, args) {
      if (call === "gestures") return [...this.gestures.entries()].map(([k, v]) => [k, Date.now() - v]);
      if (call === "jar") return args.accountId ? this.jar.list(args.accountId) : null;
      if (call === "groups") return ext.tabGroups ? ext.tabGroups.query({}) : null;
      if (call === "wipeDefault") {
        await ext.browsingData.remove({ since: 0 }, { cookies: true, localStorage: true, indexedDB: true, cache: true, cacheStorage: true, serviceWorkers: true, fileSystems: true });
        return true;
      }
      if (call === "forget") {
        await this.accountUnassigned(args.tabId, null).catch(() => {
        });
        this.c.setTab(args.tabId, { accountId: null, home: null, flow: null });
        this.restoredTabs.add(args.tabId);
        return true;
      }
      if (call === "webrtc") {
        const r = await ext.privacy.network.webRTCIPHandlingPolicy.get({});
        return r.value;
      }
      if (call === "proxy") return this.proxy.debug();
      if (call === "badge") return (ext.action || ext.browserAction).getBadgeText({ tabId: args.tabId });
      if (call === "raw-cookies") return ext.cookies.getAll({});
      return null;
    }
  };

  // src/chrome/shim.js
  function shim(cfg) {
    "use strict";
    const g2 = globalThis;
    if (g2.__boxShimmed) return;
    const isWorker = typeof WorkerGlobalScope !== "undefined" && g2 instanceof WorkerGlobalScope;
    const pfx = cfg.pfx;
    const ORIGIN = () => {
      try {
        return g2.origin || g2.location.origin;
      } catch {
        return "";
      }
    };
    const SRC = cfg.src;
    try {
      Object.defineProperty(g2, "__boxShimmed", { value: true, enumerable: false });
    } catch {
      return;
    }
    const patched = /* @__PURE__ */ new WeakMap();
    const origFnToString = Function.prototype.toString;
    const fakeToString = function toString() {
      const o = patched.get(this);
      return origFnToString.call(o || this);
    };
    patched.set(fakeToString, origFnToString);
    try {
      Object.defineProperty(Function.prototype, "toString", { value: fakeToString, writable: true, configurable: true });
    } catch {
    }
    const mark = (fn, orig) => {
      try {
        patched.set(fn, orig);
      } catch {
      }
      return fn;
    };
    const redefine = (obj, key, make) => {
      if (!obj) return;
      const d = Object.getOwnPropertyDescriptor(obj, key);
      if (!d) return;
      if ("value" in d && typeof d.value === "function") {
        const o = d.value;
        const n = make(o);
        try {
          Object.defineProperty(obj, key, { ...d, value: mark(n, o) });
        } catch {
        }
      }
    };
    const redefineGetter = (obj, key, make) => {
      if (!obj) return;
      const d = Object.getOwnPropertyDescriptor(obj, key);
      if (!d || !d.get) return;
      const o = d.get;
      const n = make(o);
      try {
        Object.defineProperty(obj, key, { ...d, get: mark(n, o) });
      } catch {
      }
    };
    const NX = g2.XMLHttpRequest;
    const xOpen = NX.prototype.open, xSend = NX.prototype.send;
    const xStatus = Object.getOwnPropertyDescriptor(NX.prototype, "status").get, xText = Object.getOwnPropertyDescriptor(NX.prototype, "responseText").get;
    const sync = (op, args) => {
      try {
        const x = new NX();
        xOpen.call(x, "GET", ORIGIN() + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), false);
        xSend.call(x);
        if (xStatus.call(x) === 200) return JSON.parse(xText.call(x));
      } catch {
      }
      return null;
    };
    let touched = false;
    const touch = () => {
      if (!touched) {
        touched = true;
        sync("touch", { o: ORIGIN() });
      }
    };
    const docUrl = () => {
      const p = g2.location.protocol;
      return p === "about:" || p === "blob:" || p === "data:" ? ORIGIN() + "/" : g2.location.href;
    };
    if (typeof Document !== "undefined") {
      let last = "";
      const d = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
      if (d) {
        const get = function() {
          const r = sync("c.get", { u: docUrl() });
          if (r) last = r.v;
          return last;
        };
        const set = function(v) {
          const r = sync("c.set", { u: docUrl(), v: String(v) });
          if (r && r.v !== void 0) last = r.v;
        };
        mark(get, d.get);
        mark(set, d.set);
        Object.defineProperty(Document.prototype, "cookie", { get, set, configurable: true, enumerable: true });
      }
    }
    if (typeof CookieStore !== "undefined") {
      const toObj = (c) => ({ name: c.name, value: c.value, domain: c.hostOnly ? null : c.domain, path: c.path, expires: c.expires, secure: c.secure, sameSite: c.sameSite || "lax", partitioned: false });
      const list = () => {
        const r = sync("c.list", { u: docUrl() });
        return r ? r.v : [];
      };
      redefine(CookieStore.prototype, "getAll", () => async function getAll(arg) {
        const n = typeof arg === "string" ? arg : arg && arg.name;
        return list().filter((c) => !n || c.name === n).map(toObj);
      });
      redefine(CookieStore.prototype, "get", () => async function get(arg) {
        const n = typeof arg === "string" ? arg : arg && arg.name;
        const c = list().find((x) => x.name === n);
        return c ? toObj(c) : null;
      });
      redefine(CookieStore.prototype, "set", () => async function set(a, b) {
        const o = typeof a === "string" ? { name: a, value: b } : a;
        let s = `${o.name}=${o.value}; Path=${o.path || "/"}`;
        if (o.domain) s += `; Domain=${o.domain}`;
        if (o.expires) s += `; Expires=${new Date(o.expires).toUTCString()}`;
        if (o.sameSite) s += `; SameSite=${o.sameSite}`;
        if (docUrl().startsWith("https:") || /localhost/.test(ORIGIN())) s += "; Secure";
        sync("c.set", { u: docUrl(), v: s });
      });
      redefine(CookieStore.prototype, "delete", () => async function del(arg) {
        const o = typeof arg === "string" ? { name: arg } : arg;
        sync("c.set", { u: docUrl(), v: `${o.name}=; Path=${o.path || "/"}${o.domain ? "; Domain=" + o.domain : ""}; Max-Age=0` });
      });
    }
    const makeStorage = (real, kind) => {
      const keys = () => {
        const out = [];
        for (let i = 0; i < real.length; i++) {
          const k = real.key(i);
          if (k !== null && k.startsWith(pfx)) out.push(k.slice(pfx.length));
        }
        return out;
      };
      const methods = {
        getItem: (k) => real.getItem(pfx + String(k)),
        setItem: (k, v) => {
          if (kind === "local") touch();
          real.setItem(pfx + String(k), String(v));
        },
        removeItem: (k) => real.removeItem(pfx + String(k)),
        clear: () => {
          for (const k of keys()) real.removeItem(pfx + k);
        },
        key: (i) => {
          const ks = keys();
          i = Number(i) >>> 0;
          return i < ks.length ? ks[i] : null;
        }
      };
      const bound = {};
      for (const [n, f] of Object.entries(methods)) {
        const orig = Storage.prototype[n];
        bound[n] = mark(function() {
          return f.apply(null, arguments);
        }, orig);
        Object.defineProperty(bound[n], "name", { value: n });
      }
      const target = Object.create(Storage.prototype);
      const proxy = new Proxy(target, {
        get(t, k, r) {
          if (typeof k === "symbol") return Reflect.get(Storage.prototype, k, proxy);
          if (k === "length") return keys().length;
          if (Object.prototype.hasOwnProperty.call(bound, k)) return bound[k];
          if (k in Storage.prototype) return Reflect.get(Storage.prototype, k, r);
          const v = real.getItem(pfx + k);
          return v === null ? void 0 : v;
        },
        set(t, k, v) {
          if (typeof k === "symbol") return false;
          methods.setItem(k, v);
          return true;
        },
        deleteProperty(t, k) {
          if (typeof k === "symbol") return true;
          methods.removeItem(k);
          return true;
        },
        has(t, k) {
          if (typeof k === "symbol") return k in Storage.prototype;
          return k in bound || k === "length" || real.getItem(pfx + k) !== null || k in Storage.prototype;
        },
        ownKeys() {
          return keys();
        },
        getOwnPropertyDescriptor(t, k) {
          if (typeof k !== "string") return void 0;
          const v = real.getItem(pfx + k);
          return v === null ? void 0 : { value: v, writable: true, enumerable: true, configurable: true };
        },
        defineProperty(t, k, desc) {
          if ("value" in desc) methods.setItem(k, desc.value);
          return true;
        },
        getPrototypeOf() {
          return Storage.prototype;
        }
      });
      return proxy;
    };
    const realStores = {};
    const wrapStorageGlobal = (name, kind) => {
      if (!(name in g2)) return;
      const host = Object.getOwnPropertyDescriptor(g2, name) ? g2 : Object.getPrototypeOf(g2);
      const d = Object.getOwnPropertyDescriptor(host, name);
      if (!d || !d.get) return;
      let cached, realRef;
      try {
        realStores[kind] = d.get.call(g2);
      } catch {
      }
      const get = function() {
        const real = d.get.call(this);
        if (!cached || realRef !== real) {
          realRef = real;
          cached = makeStorage(real, kind);
        }
        return cached;
      };
      mark(get, d.get);
      try {
        Object.defineProperty(host, name, { ...d, get });
      } catch {
      }
    };
    if (typeof Storage !== "undefined" && !isWorker) {
      try {
        if (g2.top === g2) {
          const host = Object.getOwnPropertyDescriptor(g2, "sessionStorage") ? g2 : Object.getPrototypeOf(g2);
          Object.getOwnPropertyDescriptor(host, "sessionStorage").get.call(g2).setItem("__box_acct", cfg.acct);
        }
      } catch {
      }
      wrapStorageGlobal("localStorage", "local");
      wrapStorageGlobal("sessionStorage", "session");
      g2.addEventListener("storage", (e) => {
        if (e.__box) return;
        const k = e.key;
        if (k !== null && !k.startsWith(pfx)) {
          e.stopImmediatePropagation();
          return;
        }
        if (k === null) return;
        e.stopImmediatePropagation();
        const area = e.storageArea === realStores.local ? g2.localStorage : g2.sessionStorage;
        const ev = new StorageEvent("storage", { key: k.slice(pfx.length), oldValue: e.oldValue, newValue: e.newValue, url: e.url });
        Object.defineProperty(ev, "storageArea", { get: () => area });
        Object.defineProperty(ev, "__box", { value: true });
        g2.dispatchEvent(ev);
      }, true);
    }
    if (typeof IDBFactory !== "undefined") {
      redefine(IDBFactory.prototype, "open", (o) => function open(name, ...rest) {
        touch();
        return o.call(this, pfx + String(name), ...rest);
      });
      redefine(IDBFactory.prototype, "deleteDatabase", (o) => function deleteDatabase(name, ...rest) {
        return o.call(this, pfx + String(name), ...rest);
      });
      redefine(IDBFactory.prototype, "databases", (o) => function databases() {
        return o.call(this).then((l) => l.filter((d) => d.name && d.name.startsWith(pfx)).map((d) => ({ ...d, name: d.name.slice(pfx.length) })));
      });
      redefineGetter(IDBDatabase.prototype, "name", (o) => function() {
        const n = o.call(this);
        return typeof n === "string" && n.startsWith(pfx) ? n.slice(pfx.length) : n;
      });
    }
    const CSP = typeof CacheStorage !== "undefined" ? CacheStorage.prototype : g2.caches ? Object.getPrototypeOf(g2.caches) : null;
    if (CSP) {
      redefine(CSP, "open", (o) => function open(n) {
        touch();
        return o.call(this, pfx + String(n));
      });
      redefine(CSP, "has", (o) => function has(n) {
        return o.call(this, pfx + String(n));
      });
      redefine(CSP, "delete", (o) => function del(n) {
        return o.call(this, pfx + String(n));
      });
      redefine(CSP, "keys", (o) => function keys() {
        return o.call(this).then((l) => l.filter((k) => k.startsWith(pfx)).map((k) => k.slice(pfx.length)));
      });
      redefine(CSP, "match", (o) => function match(req, opts) {
        if (opts && opts.cacheName) return o.call(this, req, { ...opts, cacheName: pfx + opts.cacheName });
        const self = this;
        return (async () => {
          for (const n of await self.keys()) {
            const c = await self.open(n);
            const r = await c.match(req, opts);
            if (r) return r;
          }
          return void 0;
        })();
      });
    }
    if (typeof StorageManager !== "undefined" && StorageManager.prototype.getDirectory) {
      const dirName = pfx.replace(/[^a-z0-9_]/gi, "_");
      redefine(StorageManager.prototype, "getDirectory", (o) => async function getDirectory() {
        touch();
        const root = await o.call(this);
        return root.getDirectoryHandle(dirName, { create: true });
      });
    }
    if (typeof BroadcastChannel !== "undefined") {
      const BC = BroadcastChannel;
      const NBC = function BroadcastChannel2(name) {
        return new BC(pfx + String(name));
      };
      NBC.prototype = BC.prototype;
      mark(NBC, BC);
      redefineGetter(BC.prototype, "name", (o) => function() {
        const n = o.call(this);
        return n.startsWith(pfx) ? n.slice(pfx.length) : n;
      });
      try {
        Object.defineProperty(g2, "BroadcastChannel", { value: NBC, writable: true, configurable: true });
      } catch {
      }
    }
    if (typeof LockManager !== "undefined") {
      redefine(LockManager.prototype, "request", (o) => function request(name, ...rest) {
        return o.call(this, pfx + String(name), ...rest);
      });
    }
    if (!isWorker && typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof ServiceWorkerContainer !== "undefined") {
      const regs = /* @__PURE__ */ new Map();
      let readyResolve;
      const readyP = new Promise((r) => {
        readyResolve = r;
      });
      const fakeWorker = (url) => {
        const w = new EventTarget();
        Object.assign(w, { scriptURL: url, state: "activated", onstatechange: null, onerror: null, postMessage() {
        } });
        return w;
      };
      const fakeReg = (scope, url) => {
        const t = new EventTarget();
        Object.assign(t, {
          scope,
          installing: null,
          waiting: null,
          active: fakeWorker(url),
          navigationPreload: { enable: async () => {
          }, disable: async () => {
          }, getState: async () => ({ enabled: false }), setHeaderValue: async () => {
          } },
          updateViaCache: "imports",
          update: async () => t,
          unregister: async () => {
            regs.delete(scope);
            return true;
          },
          getNotifications: async () => [],
          showNotification: async () => {
          }
        });
        return t;
      };
      try {
        if (navigator.serviceWorker.controller) sync("sw", {});
      } catch {
      }
      redefine(ServiceWorkerContainer.prototype, "register", () => async function register(url, opts) {
        const scope = new URL(opts && opts.scope || "./", new URL(String(url), g2.location.href)).href;
        let r = regs.get(scope);
        if (!r) {
          r = fakeReg(scope, new URL(String(url), g2.location.href).href);
          regs.set(scope, r);
        }
        readyResolve(r);
        return r;
      });
      redefine(ServiceWorkerContainer.prototype, "getRegistration", () => async function getRegistration(u) {
        for (const [s, r] of regs) if (!u || new URL(String(u), g2.location.href).href.startsWith(s)) return r;
        return void 0;
      });
      redefine(ServiceWorkerContainer.prototype, "getRegistrations", () => async function getRegistrations() {
        return [...regs.values()];
      });
      redefineGetter(ServiceWorkerContainer.prototype, "controller", () => function() {
        return null;
      });
      redefineGetter(ServiceWorkerContainer.prototype, "ready", () => function() {
        return readyP;
      });
    }
    if (cfg.wrapWorkers && !isWorker && typeof Worker !== "undefined") {
      const blobs = /* @__PURE__ */ new Map();
      const wrapUrl = (url, type) => {
        const abs = new URL(String(url), g2.__BOX_BASE || g2.location.href).href;
        const key = abs + "|" + type;
        let b = blobs.get(key);
        if (!b) {
          const prelude = `self.__BOX_BASE=${JSON.stringify(abs)};(${SRC})(${JSON.stringify({ ...cfg, wrapWorkers: true, src: SRC, inWorker: true })});(function(){var B=self.__BOX_BASE,R=function(u){try{return new URL(String(u),B).href}catch(e){return u}};var f=self.fetch;if(f)self.fetch=function(i,o){return f.call(self,typeof i==='string'||i instanceof URL?R(i):i,o)};var xo=self.XMLHttpRequest&&XMLHttpRequest.prototype.open;if(xo)XMLHttpRequest.prototype.open=function(m,u){arguments[1]=R(u);return xo.apply(this,arguments)};var is=self.importScripts;if(is)self.importScripts=function(){return is.apply(self,[].map.call(arguments,R))};var RQ=self.Request;if(RQ){var NRQ=function Request(i,o){return new RQ(typeof i==='string'?R(i):i,o)};NRQ.prototype=RQ.prototype;self.Request=NRQ;}if(self.Cache){['match','put','add','delete'].forEach(function(k){var f=Cache.prototype[k];if(f)Cache.prototype[k]=function(a){if(typeof a==='string'){arguments[0]=R(a)}return f.apply(this,arguments)}});}if(self.WebSocket){var WS=self.WebSocket;var NWS=function WebSocket(u,p){return p===undefined?new WS(R(u)):new WS(R(u),p)};NWS.prototype=WS.prototype;self.WebSocket=NWS;}if(self.EventSource){var ES=self.EventSource;var NES=function EventSource(u,o){return new ES(R(u),o)};NES.prototype=ES.prototype;self.EventSource=NES;}})();`;
          const code = type === "module" ? `${prelude}
await import(${JSON.stringify(abs)});` : `${prelude}
importScripts(${JSON.stringify(abs)});`;
          b = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          blobs.set(key, b);
        }
        return b;
      };
      const W = Worker;
      const NW = function Worker2(url, opts) {
        return new W(wrapUrl(url, opts && opts.type === "module" ? "module" : "classic"), opts);
      };
      NW.prototype = W.prototype;
      mark(NW, W);
      try {
        Object.defineProperty(g2, "Worker", { value: NW, writable: true, configurable: true });
      } catch {
      }
      if (typeof SharedWorker !== "undefined") {
        const SW = SharedWorker;
        const NSW = function SharedWorker2(url, opts) {
          const o = typeof opts === "string" ? { name: opts } : { ...opts || {} };
          o.name = pfx + (o.name || "");
          return new SW(wrapUrl(url, o.type === "module" ? "module" : "classic"), o);
        };
        NSW.prototype = SW.prototype;
        mark(NSW, SW);
        try {
          Object.defineProperty(g2, "SharedWorker", { value: NSW, writable: true, configurable: true });
        } catch {
        }
      }
    }
    if (cfg.guardPopups && !isWorker) {
      const http = (u) => /^https?:/i.test(u);
      const nativeFetch = g2.fetch;
      const asyncOp = (op, args) => nativeFetch.call(g2, ORIGIN() + "/__box_sync?q=" + encodeURIComponent(JSON.stringify({ op, a: cfg.acct, ...args })), { cache: "no-store", credentials: "omit" }).then((r) => r.json()).catch(() => null);
      redefine(Object.getOwnPropertyDescriptor(g2, "open") ? g2 : Window.prototype, "open", (o) => function open(url, target, features) {
        try {
          const t = target === void 0 || target === "" ? "_blank" : String(target);
          if (url === void 0 || url === null || url === "" || /^(_self|_top|_parent)$/i.test(t)) return o.apply(this, arguments);
          const abs = new URL(String(url), g2.location.href).href;
          if (!http(abs)) return o.apply(this, arguments);
          if (/noopener|noreferrer/.test(String(features || ""))) {
            asyncOp("openTab", { url: abs, active: true });
            return null;
          }
          const w = o.call(this, "about:blank", target, features);
          if (!w) return w;
          asyncOp("popup", {}).then(() => {
            try {
              w.location.replace(abs);
            } catch {
              try {
                w.location = abs;
              } catch {
              }
            }
          });
          return w;
        } catch {
          return o.apply(this, arguments);
        }
      });
      const onClick = (e) => {
        if (!e.isTrusted || e.defaultPrevented) return;
        const a = e.target && e.target.closest ? e.target.closest("a[href], area[href]") : null;
        if (!a) return;
        const modifier = e.ctrlKey || e.metaKey || e.button === 1;
        if (!(a.target === "_blank" || modifier) || e.altKey) return;
        if (e.type === "click" && e.button !== 0) return;
        if (e.type === "auxclick" && e.button !== 1) return;
        const href = a.href;
        if (!http(href)) return;
        e.preventDefault();
        asyncOp("openTab", { url: href, active: !(e.ctrlKey || e.metaKey || e.button === 1) });
      };
      g2.addEventListener("click", onClick);
      g2.addEventListener("auxclick", onClick);
    }
    if (cfg.proxied && typeof RTCPeerConnection !== "undefined") {
      const R = RTCPeerConnection;
      const NR = function RTCPeerConnection2(conf, c) {
        conf = { ...conf || {}, iceTransportPolicy: "relay" };
        return new R(conf, c);
      };
      NR.prototype = R.prototype;
      mark(NR, R);
      try {
        Object.defineProperty(g2, "RTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
      if (g2.webkitRTCPeerConnection) try {
        Object.defineProperty(g2, "webkitRTCPeerConnection", { value: NR, writable: true, configurable: true });
      } catch {
      }
    }
    if (!isWorker && SRC && typeof HTMLIFrameElement !== "undefined") {
      const ensure = (w) => {
        try {
          if (!w || w.__boxShimmed) return;
          if (w.origin !== g2.origin) return;
          w.eval(`(${SRC})(${JSON.stringify(cfg)})`);
        } catch {
        }
      };
      redefineGetter(HTMLIFrameElement.prototype, "contentWindow", (o) => function() {
        const w = o.call(this);
        ensure(w);
        return w;
      });
      redefineGetter(HTMLIFrameElement.prototype, "contentDocument", (o) => function() {
        const d = o.call(this);
        if (d) ensure(d.defaultView);
        return d;
      });
      redefine(Object.getOwnPropertyDescriptor(g2, "open") ? g2 : Window.prototype, "open", (o) => function open() {
        const w = o.apply(this, arguments);
        ensure(w);
        return w;
      });
    }
  }

  // src/platform/chrome-mv3.js
  var NET_URLS = ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"];
  var ALL_TYPES = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "other"];
  var b642 = (s) => btoa(unescape(encodeURIComponent(s)));
  var dbgErr = (e) => String(e && e.message || e);
  var ChromeMv3Platform = class extends ChromeBase {
    constructor() {
      super();
      this.sessions = /* @__PURE__ */ new Map();
      this.lost = /* @__PURE__ */ new Set();
      this.initiators = /* @__PURE__ */ new Map();
      this.entering = /* @__PURE__ */ new Set();
      this.shimSrc = shim.toString();
      const g2 = this.gateEvents, f = { urls: NET_URLS };
      this.bindEvents(g2);
      ext.webRequest.onHeadersReceived.addListener(g2((d) => this.onHeadersReceived(d)), f, ["responseHeaders", "extraHeaders"]);
      ext.webRequest.onBeforeRequest.addListener(g2((d) => this.onBeforeRequestObserve(d)), f);
      ext.debugger.onEvent.addListener(g2((src, method, params) => this.onDebuggerEvent(src, method, params)));
      ext.debugger.onDetach.addListener(g2((src, reason) => this.onDetach(src, reason)));
      ext.webNavigation.onBeforeNavigate.addListener(g2((d) => {
        if (d.frameId === 0) this.onBeforeNavigate(d);
      }));
      this.proxy.bindEvents(g2);
    }
    async installNet() {
      await this.syncGateRules();
      const stale = await ext.declarativeNetRequest.getSessionRules();
      if (stale.length) await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale.map((r) => r.id) });
      for (const [tabId, st] of this.c.tabs) if (st.accountId) this.accountAssigned(tabId, null, st.accountId, true).catch((e) => console.warn("re-attach", tabId, dbgErr(e)));
    }
    // ---------------------------------------------------------------- observers
    onBeforeRequestObserve(d) {
      if (d.tabId < 0) return;
      if (d.type === "main_frame") {
        this.initiators.set(d.tabId + "|" + d.url, { initiator: d.initiator, t: Date.now() });
        if (this.initiators.size > 200) {
          for (const [k, v] of this.initiators) if (Date.now() - v.t > 1e4) this.initiators.delete(k);
        }
      }
      const acc = this.accountOf(d.tabId);
      if (acc) {
        this.proxy.observe(acc, d.tabId, new URL(d.url).hostname);
        if (d.type === "websocket") {
          this.wsTabs = this.wsTabs || /* @__PURE__ */ new Set();
          if (!this.wsTabs.has(d.tabId)) {
            this.wsTabs.add(d.tabId);
            this.pushIdentity(d.tabId);
          }
        }
      }
    }
    onHeadersReceived(d) {
      try {
        if (d.tabId < 0 || !d.responseHeaders) return;
        const acc = this.accountOf(d.tabId);
        if (!acc) return;
        const vals = d.responseHeaders.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
        if (vals.length) this.storeSetCookies(acc, d.url, vals);
      } catch (e) {
        console.error("onHeadersReceived", e);
      }
    }
    // ---------------------------------------------------------------- account <-> debugger/DNR
    async accountAssigned(tabId, prev, next, force = false) {
      if (!next) {
        if (prev) await this.accountUnassigned(tabId, prev);
        return;
      }
      if (!force && prev === next && this.sessions.has(tabId)) return;
      if (this.sessions.has(tabId)) await this.detachSession(tabId);
      await this.attachSession(tabId, next);
      await this.proxy.recompute(true);
    }
    async accountUnassigned(tabId) {
      this.wsTabs?.delete(tabId);
      this.exposedFirst?.delete(tabId);
      await this.detachSession(tabId);
      await this.setRules(tabId, false);
      this.lost.delete(tabId);
    }
    /** DNR rule ids must be small integers; Chrome's tab ids can be ~2^31, so tabs get sequential slots. */
    slotOf(tabId) {
      if (!this.slots) {
        this.slots = /* @__PURE__ */ new Map();
        this.nextSlot = 1;
      }
      if (!this.slots.has(tabId)) this.slots.set(tabId, this.nextSlot++);
      return this.slots.get(tabId);
    }
    async setRules(tabId, on, block = false) {
      const n = this.slotOf(tabId) * 4;
      const ids = [n + 1, n + 2, n + 3, n + 4];
      const rules = [];
      if (on) {
        rules.push({ id: ids[0], priority: 10, condition: { tabIds: [tabId], resourceTypes: ALL_TYPES }, action: { type: "modifyHeaders", responseHeaders: [{ header: "set-cookie", operation: "remove" }] } });
        rules.push({ id: ids[1], priority: 10, condition: { tabIds: [tabId], resourceTypes: ["websocket"] }, action: { type: "modifyHeaders", requestHeaders: [{ header: "cookie", operation: "remove" }] } });
      }
      if (on) rules.push({ id: ids[3], priority: 1, condition: { tabIds: [tabId], resourceTypes: ["main_frame"] }, action: { type: "allow" } });
      if (block) rules.push({ id: ids[2], priority: 100, condition: { tabIds: [tabId], resourceTypes: ALL_TYPES }, action: { type: "block" } });
      await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids, addRules: rules });
    }
    async attachSession(tabId, accId) {
      await this.setRules(tabId, true);
      const s = { mainFrame: null, scripts: /* @__PURE__ */ new Map(), children: /* @__PURE__ */ new Map(), accId };
      this.sessions.set(tabId, s);
      try {
        await ext.debugger.attach({ tabId }, "1.3");
      } catch (e) {
        if (!/already attached/i.test(dbgErr(e))) {
          this.sessions.delete(tabId);
          this.lost.add(tabId);
          await this.setRules(tabId, true, true);
          this.pushIdentity(tabId);
          throw e;
        }
      }
      this.lost.delete(tabId);
      await this.setupTarget({ tabId }, s, "page");
      this.pushIdentity(tabId);
    }
    async detachSession(tabId) {
      const s = this.sessions.get(tabId);
      if (!s) return;
      this.sessions.delete(tabId);
      try {
        await ext.debugger.detach({ tabId });
      } catch {
      }
    }
    cfgFor(accId) {
      const acc = this.c.accounts[accId];
      return { acct: accId, pfx: prefixFor(accId), proxied: !!(acc && acc.proxy), src: this.shimSrc, wrapWorkers: false, guardPopups: true };
    }
    async setupTarget(target, s, type) {
      const send = (m, p) => ext.debugger.sendCommand(target, m, p);
      const key = target.sessionId || "page";
      const soft = async (m, p) => {
        try {
          return await send(m, p);
        } catch (e) {
          return null;
        }
      };
      try {
        const cfg = this.cfgFor(s.accId);
        const source = `(${this.shimSrc})(${JSON.stringify(cfg)});`;
        if (type === "worker" || type === "shared_worker") {
          await soft("Runtime.enable");
          await send("Runtime.evaluate", { expression: source });
          await soft("Network.enable");
          await soft("Network.setBypassServiceWorker", { bypass: true });
        } else {
          await send("Network.enable");
          await soft("Network.setBypassServiceWorker", { bypass: true });
          await soft("Network.setCacheDisabled", { cacheDisabled: true });
          await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
          await send("Page.enable");
          const r = await send("Page.addScriptToEvaluateOnNewDocument", { source, runImmediately: true });
          s.scripts.set(key, r.identifier);
          if (!target.sessionId) {
            const t = await send("Page.getFrameTree");
            s.mainFrame = t.frameTree.frame.id;
          }
        }
        await soft("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      } catch (e) {
        console.warn("setupTarget", type, dbgErr(e));
      }
    }
    /** Account of an attached tab changed (leave -> other account): swap the shim configuration. */
    async reconfigure(tabId, accId) {
      const s = this.sessions.get(tabId);
      if (!s) return;
      s.accId = accId;
      for (const [key, id] of s.scripts) {
        const target = key === "page" ? { tabId } : { tabId, sessionId: key };
        try {
          await ext.debugger.sendCommand(target, "Page.removeScriptToEvaluateOnNewDocument", { identifier: id });
          const r = await ext.debugger.sendCommand(target, "Page.addScriptToEvaluateOnNewDocument", { source: `(${this.shimSrc})(${JSON.stringify(this.cfgFor(accId))});` });
          s.scripts.set(key, r.identifier);
        } catch (e) {
          console.warn("reconfigure", dbgErr(e));
        }
      }
    }
    // ---------------------------------------------------------------- CDP events
    onDebuggerEvent(src, method, p) {
      if (src.tabId == null) return;
      if (method === "Fetch.requestPaused") {
        this.onPaused(src, p).catch((e) => console.error("onPaused", dbgErr(e)));
        return;
      }
      if (method === "Target.attachedToTarget") {
        this.onChildAttached(src, p).catch((e) => console.warn("onChildAttached", dbgErr(e)));
        return;
      }
      if (method === "Page.frameNavigated" && !src.sessionId && !p.frame.parentId) {
        const s = this.sessions.get(src.tabId);
        if (s) s.mainFrame = p.frame.id;
      }
    }
    async onChildAttached(src, p) {
      const s = this.sessions.get(src.tabId);
      const type = p.targetInfo.type;
      const target = { tabId: src.tabId, sessionId: p.sessionId };
      if (s && (type === "iframe" || type === "worker" || type === "shared_worker")) {
        s.children.set(p.sessionId, type);
        await this.setupTarget(target, s, type);
      } else {
        try {
          await ext.debugger.sendCommand({ tabId: src.tabId, sessionId: src.sessionId }, "Target.detachFromTarget", { sessionId: p.sessionId });
        } catch {
        }
        return;
      }
      try {
        await ext.debugger.sendCommand(target, "Runtime.runIfWaitingForDebugger");
      } catch {
      }
    }
    onDetach(src, reason) {
      const tabId = src.tabId;
      if (tabId == null) return;
      const s = this.sessions.get(tabId);
      if (!s) return;
      this.sessions.delete(tabId);
      if (reason === "target_closed") return;
      if (this.accountOf(tabId)) {
        this.lost.add(tabId);
        this.setRules(tabId, true, true).catch(() => {
        });
        this.pushIdentity(tabId);
      }
    }
    isolationStatus(tabId) {
      if (this.lost.has(tabId)) return { level: "fail", action: "restoreIsolation", messages: ["Isolation is paused for this tab because the debugging bar was closed. The tab is blocked so nothing is sent outside its account \u2014 use \u201CRestore isolation\u201D below."] };
      const notes = [];
      if (this.wsTabs && this.wsTabs.has(tabId)) notes.push("This page opened a WebSocket. Chrome gives extensions no way to intercept WebSocket handshakes, so Box sends them without cookies (nothing from other sessions is exposed, but cookie-authenticated sockets will not log in).");
      if (this.exposedFirst && this.exposedFirst.has(tabId)) notes.push("This tab was opened by the browser (for example \u201COpen link in new tab\u201D from the context menu) before Box could attach, so its very first request was sent in the default session and then repeated inside the account.");
      return notes.length ? { level: "warn", messages: notes } : null;
    }
    async restoreIsolation(tabId) {
      const acc = this.accountOf(tabId);
      if (!acc) return false;
      await this.setRules(tabId, true, false);
      this.lost.delete(tabId);
      await this.attachSession(tabId, acc);
      await ext.tabs.reload(tabId);
      return true;
    }
    // ---------------------------------------------------------------- the paused request (heart of the MV3 build)
    async onPaused(src, p) {
      const tabId = src.tabId;
      const target = src.sessionId ? { tabId, sessionId: src.sessionId } : { tabId };
      const send = (m, params) => ext.debugger.sendCommand(target, m, params);
      const cont = (headers) => send("Fetch.continueRequest", headers ? { requestId: p.requestId, headers } : { requestId: p.requestId });
      try {
        if (p.responseStatusCode !== void 0 || p.responseErrorReason) {
          await send("Fetch.continueResponse", { requestId: p.requestId });
          return;
        }
        const req = p.request;
        let u;
        try {
          u = new URL(req.url);
        } catch {
          await cont();
          return;
        }
        if (this.wipeTabs.has(tabId)) {
          if (u.pathname === "/__box_wipe") await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/html" }, { name: "Cache-Control", value: "no-store" }], body: b642("<!doctype html><title>Box</title>") });
          else await send("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" });
          return;
        }
        const s = this.sessions.get(tabId);
        let acc = this.accountOf(tabId);
        if (!acc || !s) {
          await cont();
          return;
        }
        if (u.pathname === SYNC_PATH && u.protocol.startsWith("http")) {
          let q = {};
          try {
            q = JSON.parse(u.searchParams.get("q") || "{}");
          } catch {
          }
          const body = JSON.stringify(q.op === "popup" || q.op === "openTab" ? await this.asyncOp(tabId, q) : this.syncOp(tabId, 0, q));
          await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }], body: b642(body) });
          return;
        }
        const isMain = p.resourceType === "Document" && !src.sessionId && p.frameId === s.mainFrame;
        let type = isMain ? "main_frame" : p.resourceType === "Document" ? "sub_frame" : "other";
        let initiator;
        if (isMain) {
          const dec = await this.decideMain(tabId, req, p);
          if (dec.abort) {
            await send("Fetch.failRequest", { requestId: p.requestId, errorReason: "Aborted" });
            return;
          }
          acc = this.accountOf(tabId);
          this.tabTop.set(tabId, req.url);
          initiator = dec.initiator;
          if (!acc) {
            await cont();
            return;
          }
        }
        if (!isMain) initiator = req.headers.Origin || req.headers.Referer || void 0;
        const hdrs = Object.entries(req.headers).filter(([k]) => k.toLowerCase() !== "cookie").map(([name, value]) => ({ name, value }));
        const ck = this.cookieHeaderFor(acc, { url: req.url, tabId, initiator, type, method: req.method });
        hdrs.push({ name: "Cookie", value: ck });
        await cont(hdrs);
      } catch (e) {
        try {
          await send("Fetch.continueRequest", { requestId: p.requestId });
        } catch {
        }
        if (!/No (target|session)|Invalid InterceptionId|Cannot find/i.test(dbgErr(e))) console.warn("paused", dbgErr(e));
      }
    }
    /** Decide a main-frame navigation of an account tab while its request is held. */
    async decideMain(tabId, req, p) {
      const c = this.c;
      const exp = this.expect.get(tabId);
      if (exp && req.url === exp) {
        this.expect.delete(tabId);
        return {};
      }
      const rec = await this.waitInitiator(tabId, req.url);
      const initiator = rec ? rec.initiator : void 0;
      let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
      const rp = this.replay && this.replay.get(tabId);
      if (rp && rp.url === req.url) {
        user = rp.user;
        this.replay.delete(tabId);
      } else if (!user) user = await this.queryGesture(tabId) || this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener);
      if (user && this.isPopupTab(tabId)) user = false;
      const dec = c.decideNavigation({ tabId, url: req.url, userInitiated: user });
      if (dec.type === "ask") {
        c.pickerFor.set(tabId, { url: req.url, serviceId: dec.serviceId });
        ext.tabs.update(tabId, { url: this.pickerUrl(tabId) }).catch(() => {
        });
        return { abort: true };
      }
      if (dec.type === "move") {
        const prev = c.getTab(tabId).accountId || null;
        c.setTab(tabId, { accountId: dec.accountId, home: dec.home, flow: null });
        if (dec.accountId) {
          await this.reconfigure(tabId, dec.accountId);
          await this.proxy.recompute(true);
        } else {
          await this.setRules(tabId, false);
          setTimeout(() => this.accountUnassigned(tabId, prev).catch(() => {
          }), 0);
        }
        this.updateGroups();
        this.proxy.recompute();
        this.pushIdentity(tabId);
      }
      return { initiator };
    }
    async waitInitiator(tabId, url) {
      for (let i = 0; i < 12; i++) {
        const r = this.initiators.get(tabId + "|" + url);
        if (r) return r;
        await sleep(12);
      }
      return null;
    }
    /**
     * Tabs/popups opened by an account page. The debugger cannot be attached before the new tab's first request starts, so the
     * navigation is replayed inside the isolated session once attached (the unattached first request is discarded).
     */
    onNavTarget(d) {
      const src = this.c.tabs.get(d.sourceTabId);
      if (!src || !src.accountId || this.c.getTab(d.tabId).accountId) return;
      const p = this.adoptNavTarget(d, src);
      this.lastPopup = this.lastPopup || /* @__PURE__ */ new Map();
      this.popupWait = this.popupWait || /* @__PURE__ */ new Map();
      this.lastPopup.set(d.sourceTabId, { p, t: Date.now() });
      const w = this.popupWait.get(d.sourceTabId);
      if (w) {
        this.popupWait.delete(d.sourceTabId);
        p.then(w, w);
      }
    }
    async adoptNavTarget(d, src) {
      const user = isWebUrl(d.url) ? await this.queryGesture(d.sourceTabId) : false;
      this.c.setTab(d.tabId, { accountId: src.accountId, home: src.home, flow: null });
      await this.accountAssigned(d.tabId, null, src.accountId);
      if (isWebUrl(d.url)) {
        this.exposedFirst = this.exposedFirst || /* @__PURE__ */ new Set();
        this.exposedFirst.add(d.tabId);
        this.replay = this.replay || /* @__PURE__ */ new Map();
        this.replay.set(d.tabId, { url: d.url, user });
        await ext.tabs.update(d.tabId, { url: d.url }).catch(() => {
        });
      }
    }
    /** Blocking ops of the shim (the page is stuck in a synchronous XHR until we answer). */
    async asyncOp(tabId, q) {
      this.lastPopup = this.lastPopup || /* @__PURE__ */ new Map();
      this.popupWait = this.popupWait || /* @__PURE__ */ new Map();
      if (q.op === "popup") {
        const last = this.lastPopup.get(tabId);
        if (last && Date.now() - last.t < 3e3) await last.p;
        else await new Promise((res) => {
          this.popupWait.set(tabId, res);
          setTimeout(res, 3e3);
        });
        return { ok: 1 };
      }
      if (q.op === "openTab") {
        const st = this.c.getTab(tabId);
        const src = await ext.tabs.get(tabId);
        const nt = await ext.tabs.create({ url: "about:blank", active: q.active !== false, index: src.index + 1, windowId: src.windowId, openerTabId: tabId });
        this.c.setTab(nt.id, { accountId: st.accountId, home: st.home, flow: null });
        await this.accountAssigned(nt.id, null, st.accountId);
        this.replay = this.replay || /* @__PURE__ */ new Map();
        this.replay.set(nt.id, { url: q.url, user: true });
        await ext.tabs.update(nt.id, { url: q.url });
        this.updateGroups();
        return { ok: 1 };
      }
      return { error: "unknown op" };
    }
    // ---------------------------------------------------------------- entry gate (default tabs entering a service)
    //
    // Services that need a decision on entry (Ask, or Remember with a remembered account) get a DNR redirect rule that sends
    // main-frame navigations to gate.html instead of the network, so *no request leaves the browser* before the decision.
    // Navigations initiated from within the service itself and tabs that are already in an account (handled via Fetch) are excluded.
    gatedServices() {
      const c = this.c, out = [];
      for (const sid of new Set(Object.values(c.accounts).map((a) => a.serviceId))) {
        const mode = c.modeFor(sid), last = c.state.lastAccount[sid];
        if (mode === "ask" || mode === "remember" && last && c.accounts[last]) out.push(sid);
      }
      return out;
    }
    async syncGateRules() {
      try {
        const gate = ext.runtime.getURL("gate.html");
        const rules = [];
        let n = 0;
        this.gated = /* @__PURE__ */ new Set();
        for (const sid of this.gatedServices()) {
          const domains = this.c.resolver.domains(sid);
          if (!domains.length) continue;
          this.gated.add(sid);
          rules.push({
            id: 1e3 + n++,
            priority: 1,
            condition: { regexFilter: "^(https?://.*)$", requestDomains: domains, excludedInitiatorDomains: domains, resourceTypes: ["main_frame"] },
            action: { type: "redirect", redirect: { regexSubstitution: gate + "?u=\\1" } }
          });
        }
        const old = (await ext.declarativeNetRequest.getDynamicRules()).filter((r) => r.id >= 1e3 && r.id < 2e3).map((r) => r.id);
        await ext.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules: rules });
      } catch (e) {
        console.warn("syncGateRules", dbgErr(e));
      }
    }
    async servicesChanged() {
      await this.syncGateRules();
    }
    async modesChanged() {
      await this.syncGateRules();
    }
    async accountsChanged() {
      await super.accountsChanged();
      await this.syncGateRules();
    }
    async settingsChanged() {
      await super.settingsChanged();
      await this.syncGateRules();
    }
    async allowTab(tabId, ms = 6e3) {
      const id = 1e5 + this.slotOf(tabId);
      await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [{ id, priority: 1, condition: { tabIds: [tabId], resourceTypes: ["main_frame"] }, action: { type: "allow" } }] });
      setTimeout(() => ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {
      }), ms);
    }
    /** gate.html asks what to do with the navigation it intercepted. */
    async gate(tabId, url) {
      const c = this.c;
      if (!isWebUrl(url)) return { go: url };
      const hint = this.hints && this.hints.get(tabId);
      const user = hint && hint.url === url ? await hint.p : true;
      const dec = c.decideNavigation({ tabId, url, userInitiated: user });
      if (dec.type === "ask") {
        c.pickerFor.set(tabId, { url, serviceId: dec.serviceId });
        return { go: this.pickerUrl(tabId) };
      }
      if (dec.type === "move" && dec.accountId) {
        this.entering.add(tabId);
        try {
          await this.moveTab(tabId, dec.accountId, { url });
        } finally {
          this.entering.delete(tabId);
        }
        return { go: null };
      }
      await this.allowTab(tabId);
      return { go: url };
    }
    async testCall(call, args) {
      if (call === "detach") {
        try {
          await ext.debugger.detach({ tabId: args.tabId });
        } catch {
        }
        this.onDetach({ tabId: args.tabId }, "canceled_by_user");
        return true;
      }
      if (call === "sessions") return [...this.sessions.keys()];
      if (call === "simulateRestart") {
        await sleep(200);
        this.sessions.clear();
        this.lost.clear();
        this.slots = null;
        this.hints = null;
        this.replay = null;
        this.jar = new this.jar.constructor();
        await this.loadJars();
        this.c.tabs.clear();
        await this.c.restoreTabs();
        const stale = await ext.declarativeNetRequest.getSessionRules();
        if (stale.length) await ext.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale.map((r) => r.id) });
        for (const [tabId, st] of this.c.tabs) if (st.accountId) await this.accountAssigned(tabId, null, st.accountId, true);
        return [...this.sessions.keys()];
      }
      return super.testCall(call, args);
    }
    async handleMessage(msg, sender) {
      if (msg.type === "gate") return this.gate(sender.tab.id, msg.url);
      if (msg.type === "restoreIsolation") return this.restoreIsolation(msg.tabId);
      return super.handleMessage(msg, sender);
    }
    /** Remember whether the navigation that is about to be redirected to the gate was user-initiated (the old page is still alive now). */
    async onBeforeNavigate(d) {
      try {
        const tabId = d.tabId;
        if (!isWebUrl(d.url) || this.wipeTabs.has(tabId) || this.sessions.has(tabId) || this.accountOf(tabId) || this.entering.has(tabId)) return;
        if (!this.gated || !this.gated.has(this.c.serviceOfUrl(d.url))) return;
        this.hints = this.hints || /* @__PURE__ */ new Map();
        this.hints.set(tabId, { url: d.url, p: this.computeUser(tabId, d.url) });
      } catch (e) {
        console.warn("onBeforeNavigate", dbgErr(e));
      }
    }
    async computeUser(tabId, url) {
      const rec = await this.waitInitiator(tabId, url);
      const initiator = rec ? rec.initiator : void 0;
      let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
      if (!user) user = await this.queryGesture(tabId) || this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener);
      if (user && this.isPopupTab(tabId)) user = false;
      return user;
    }
    async _unusedOnBeforeNavigate(d) {
      try {
        const tabId = d.tabId;
        if (!isWebUrl(d.url) || this.wipeTabs.has(tabId) || this.sessions.has(tabId) || this.accountOf(tabId) || this.entering.has(tabId)) return;
        const exp = this.expect.get(tabId);
        if (exp && d.url === exp) {
          this.expect.delete(tabId);
          this.tabTop.set(tabId, d.url);
          return;
        }
        const rec = await this.waitInitiator(tabId, d.url);
        const initiator = rec ? rec.initiator : void 0;
        let user = !initiator || /^(chrome-extension|chrome|about):/.test(initiator);
        if (!user) user = await this.queryGesture(tabId) || this.tabMeta.get(tabId)?.opener != null && await this.queryGesture(this.tabMeta.get(tabId).opener);
        if (user && this.isPopupTab(tabId)) user = false;
        const dec = this.c.decideNavigation({ tabId, url: d.url, userInitiated: user });
        if (dec.type === "ask") {
          this.c.pickerFor.set(tabId, { url: d.url, serviceId: dec.serviceId });
          await ext.tabs.update(tabId, { url: this.pickerUrl(tabId) });
        } else if (dec.type === "move" && dec.accountId) {
          this.entering.add(tabId);
          try {
            await this.moveTab(tabId, dec.accountId, { url: d.url });
          } finally {
            this.entering.delete(tabId);
          }
        }
      } catch (e) {
        console.warn("onBeforeNavigate", dbgErr(e));
      }
    }
    async moveTab(tabId, accountId, opts = {}) {
      const prev = this.accountOf(tabId);
      const r = await super.moveTab(tabId, accountId, opts);
      return r;
    }
    /** The wipe page is answered locally by the debugger: deleting an account makes no network request at all. */
    async openWipeTab(origin) {
      const tab = await ext.tabs.create({ url: "about:blank", active: false });
      this.wipeTabs.add(tab.id);
      await ext.debugger.attach({ tabId: tab.id }, "1.3");
      await ext.debugger.sendCommand({ tabId: tab.id }, "Fetch.enable", { patterns: [{ urlPattern: "*" }] });
      await ext.tabs.update(tab.id, { url: origin + "/__box_wipe" });
      return tab;
    }
  };

  // src/platform/chrome-mv3-entry.js
  var createPlatform = () => new ChromeMv3Platform();

  // src/test/hooks.js
  var hooks;
  function installTestHooks(controller2, platform2) {
    if (hooks) return hooks;
    hooks = {
      async handle(msg, sender) {
        switch (msg.type) {
          case "test:openUi": {
            const url = ext.runtime.getURL(msg.page + (msg.query ? "?" + msg.query : ""));
            const t = await ext.tabs.create({ url, active: msg.active !== false, windowId: msg.windowId });
            return { tabId: t.id };
          }
          case "test:tabs": {
            const tabs = await ext.tabs.query({});
            return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, cookieStoreId: t.cookieStoreId, windowId: t.windowId, index: t.index, active: t.active, groupId: t.groupId, state: controller2.tabs.get(t.id) || null }));
          }
          case "test:sender":
            return { tabId: sender?.tab?.id, windowId: sender?.tab?.windowId };
          case "test:state":
            return { ...controller2.state, tabs: [...controller2.tabs.entries()], pickers: [...controller2.pickerFor.entries()] };
          case "test:reset": {
            for (const id of Object.keys(controller2.accounts)) await controller2.deleteAccount(id);
            const d = DEFAULT_STATE();
            await controller2.store.update((s) => {
              s.settings = d.settings;
              s.user = d.user;
              s.lastAccount = {};
              s.origins = {};
            });
            controller2.tabs.clear();
            controller2.pickerFor.clear();
            await platform2.testCall?.("wipeDefault", { origins: msg.origins });
            return true;
          }
          case "test:closeTab":
            await ext.tabs.remove(msg.tabId);
            return true;
          case "test:platform":
            return platform2.testCall ? platform2.testCall(msg.call, msg.args) : null;
          default:
            return platform2.handleMessage ? platform2.handleMessage(msg, sender) : null;
        }
      }
    };
    return hooks;
  }

  // src/background/main.js
  var platform = createPlatform();
  var controller = new Controller(platform);
  var bootId = Math.random().toString(36).slice(2, 8);
  var initState = "starting";
  var initError = null;
  var ready = controller.init().then(() => {
    initState = "ready";
  }, (e) => {
    initState = "failed";
    initError = String(e && e.stack || e);
    console.error("Box init failed", e);
    throw e;
  });
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return false;
    if (msg.type === "ping") {
      sendResponse({ ok: true, target: TARGET, init: initState, initError, bootId });
      return false;
    }
    (async () => {
      await ready;
      if (msg.type === "badgeIcon") return badgedIcon(msg.href, msg.color, msg.host);
      if (msg.type.startsWith("test:")) return installTestHooks(controller, platform).handle(msg, sender);
      return controller.handle(msg, sender);
    })().then((r) => sendResponse(r === void 0 ? null : r), (e) => sendResponse({ error: String(e && e.message || e) }));
    return true;
  });
  globalThis.__box = { controller, platform, TARGET };
})();
