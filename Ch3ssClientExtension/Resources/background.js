const DEFAULTS = {
  running: false,
  mode: 'human_safe',
  autoQueue: true,
  showArrow: true,
  sound: true,
  theme: 'mono',
  errorRate: 15,
  errorPattern: 'chance',
  errorStep: 2,
  errorType: 'inaccuracy',
  protectMate: true,
  safeMargin: 120,
  delayMin: 1000,
  delayMax: 2600,
  dynamicTiming: true,
  configs: [],
  activeTab: 'game',
  live: {
    board: {},
    flipped: false,
    turn: 'w',
    bestScore: '0.00',
    scoreNum: 0,
    isMate: false,
    depth: 0,
    lastBest: null,
    status: 'РћС‚РєСЂРѕР№С‚Рµ chess.com',
    movesMade: 0,
    evalHistory: [0],
    updatedAt: 0
  }
};

function updateBadge(running) {
  browser.action.setBadgeText({ text: running ? 'ON' : '' });
  browser.action.setBadgeBackgroundColor({ color: running ? '#16a34a' : '#4b5563' });
}

browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.storage.local.get(Object.keys(DEFAULTS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (existing[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length) await browser.storage.local.set(toSet);
  updateBadge(!!existing.running);
});

browser.runtime.onStartup.addListener(async () => {
  const { running } = await browser.storage.local.get('running');
  updateBadge(!!running);
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.running) {
    updateBadge(!!changes.running.newValue);
  }
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ENSURE_CHESS_TAB') {
    browser.tabs.query({ url: ['https://www.chess.com/*', 'https://chess.com/*'] }, tabs => {
      if (tabs.length > 0) {
        if (msg.focus) {
          browser.tabs.update(tabs[0].id, { active: true });
          browser.windows.update(tabs[0].windowId, { focused: true });
        }
        sendResponse({ ok: true, existed: true, tabId: tabs[0].id });
      } else {
        browser.tabs.create({ url: 'https://www.chess.com/play/online', active: true }, tab => {
          sendResponse({ ok: true, existed: false, tabId: tab.id });
        });
      }
    });
    return true;
  }
});
