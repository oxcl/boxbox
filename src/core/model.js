// Defaults, palettes and small helpers shared by background and UI.
export const COLORS = [
  { key: 'blue',   hex: '#3b82f6', ff: 'blue',      chrome: 'blue' },
  { key: 'indigo', hex: '#6366f1', ff: 'purple',    chrome: 'purple' },
  { key: 'violet', hex: '#a855f7', ff: 'purple',    chrome: 'purple' },
  { key: 'pink',   hex: '#ec4899', ff: 'pink',      chrome: 'pink' },
  { key: 'red',    hex: '#ef4444', ff: 'red',       chrome: 'red' },
  { key: 'orange', hex: '#f97316', ff: 'orange',    chrome: 'orange' },
  { key: 'amber',  hex: '#f59e0b', ff: 'yellow',    chrome: 'yellow' },
  { key: 'lime',   hex: '#84cc16', ff: 'green',     chrome: 'green' },
  { key: 'green',  hex: '#22c55e', ff: 'green',     chrome: 'green' },
  { key: 'teal',   hex: '#14b8a6', ff: 'turquoise', chrome: 'cyan' },
  { key: 'cyan',   hex: '#06b6d4', ff: 'turquoise', chrome: 'cyan' },
  { key: 'slate',  hex: '#64748b', ff: 'toolbar',   chrome: 'grey' },
];

// Firefox container colours (name -> rgb) and Chrome tab-group colours, for nearest matching of any hex.
export const FF_COLORS = { blue: '#37adff', turquoise: '#00c79a', green: '#51cd00', yellow: '#ffcb00', orange: '#ff9f00', red: '#ff613d', pink: '#ff4bda', purple: '#af51f5', toolbar: '#7c7c7d' };
export const CHROME_GROUP_COLORS = { grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#9334e6', cyan: '#007b83', orange: '#e8710a' };

export const ICONS = ['user', 'briefcase', 'home', 'heart', 'star', 'bolt', 'cart', 'game', 'code', 'book', 'cloud', 'shield', 'gift', 'camera', 'music', 'flask'];
export const ICON_EMOJI = { user: '👤', briefcase: '💼', home: '🏠', heart: '❤️', star: '⭐', bolt: '⚡', cart: '🛒', game: '🎮', code: '💻', book: '📖', cloud: '☁️', shield: '🛡️', gift: '🎁', camera: '📷', music: '🎵', flask: '🧪' };
export const FF_ICONS = { user: 'fingerprint', briefcase: 'briefcase', home: 'chill', heart: 'circle', star: 'circle', bolt: 'circle', cart: 'cart', game: 'gift', code: 'fence', book: 'briefcase', cloud: 'vacation', shield: 'fence', gift: 'gift', camera: 'circle', music: 'circle', flask: 'tree' };

export const DEFAULT_STATE = () => ({
  v: 1,
  settings: { defaultMode: 'default', modes: {}, theme: 'auto', border: true, badge: true, tabGroups: true },
  accounts: {},                 // id -> {id, serviceId, name, color, icon, proxy, createdAt, cookieStoreId?}
  user: { services: {}, domainMap: {}, names: {} },
  lastAccount: {},              // serviceId -> accountId | null
  origins: {},                  // accountId -> [origin]   (Chrome: where the account has stored data)
});

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function nearest(hex, table) {
  const [r, g, b] = hexToRgb(hex);
  let best = null, bd = Infinity;
  for (const [k, v] of Object.entries(table)) {
    const [r2, g2, b2] = hexToRgb(v);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

export const MODES = ['default', 'remember', 'ask'];
export const PROXY_TYPES = ['http', 'https', 'socks5'];

export function sanitizeProxy(p) {
  if (!p || !p.host) return null;
  return {
    type: PROXY_TYPES.includes(p.type) ? p.type : 'http',
    host: String(p.host).trim(),
    port: Number(p.port) || (p.type === 'socks5' ? 1080 : 8080),
    username: p.username ? String(p.username) : '',
    password: p.password ? String(p.password) : '',
  };
}
