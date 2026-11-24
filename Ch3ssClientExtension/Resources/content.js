(function () {
  'use strict';

  if (window.__caContentLoaded) return;
  window.__caContentLoaded = true;

  const FILES = 'abcdefgh';

  const THEME_ARROWS = {
    mono:   '#ffffff',
    dark:   '#f4f4f5',
    silver: '#e5e7eb',
    gray:   '#d4d4d8',
    blue:   '#ffffff',
    green:  '#ffffff',
    purple: '#ffffff',
    gold:   '#ffffff'
  };

  const MODES = {
    legit:      { id: 'legit',      name: 'Р›РµРіРёС‚',                 movetime: 500,  delayMin: 700,  delayMax: 1600, skill: 12 },
    pro:        { id: 'pro',        name: 'РџСЂРѕ',                   movetime: 1100, delayMin: 350,  delayMax: 850,  skill: 18 },
    human_safe: { id: 'human_safe', name: 'humen mode(full safe)', movetime: 1400, delayMin: 1000, delayMax: 2600, skill: 20, humanSafe: true },
    autowin:    { id: 'autowin',    name: 'AutoWin',               movetime: 1800, delayMin: 120,  delayMax: 250,  skill: 20 }
  };

  const state = {
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
    movesThisGame: 0,

    timer: null,
    lastMoveTime: 0,
    lastQueueClick: 0,
    lastBoardHash: '',
    engine: null,
    enginePromise: null,

    live: {
      board: {},
      flipped: false,
      turn: 'w',
      bestScore: '0.00',
      scoreNum: 0,
      isMate: false,
      depth: 0,
      lastBest: null,
      status: 'Р“РѕС‚РѕРІ Рє СЂР°Р±РѕС‚Рµ',
      movesMade: 0,
      evalHistory: [0],
      updatedAt: 0
    }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function syncLive(patch = {}) {
    state.live = { ...state.live, ...patch, updatedAt: Date.now() };
    try {
      browser.storage.local.set({ live: state.live });
    } catch (_) {}
  }

  /* =========================================================
     Р—Р’РЈРљР
  ========================================================= */
  let audioCtx = null;
  function playSound(kind) {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const map = {
        move:  { f1: 480, f2: 640, dur: 0.075, type: 'triangle', vol: 0.05 },
        queue: { f1: 660, f2: 990, dur: 0.13,  type: 'sine',     vol: 0.05 }
      };
      const cfg = map[kind] || map.move;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = cfg.type;
      osc.frequency.setValueAtTime(cfg.f1, now);
      osc.frequency.exponentialRampToValueAtTime(cfg.f2, now + cfg.dur);
      gain.gain.setValueAtTime(cfg.vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + cfg.dur);
    } catch (_) {}
  }

  /* =========================================================
     Р§РўР•РќРР• Р”РћРЎРљР
  ========================================================= */
  function getBoardEl() {
    const cands = [
      ...document.querySelectorAll('chess-board'),
      ...document.querySelectorAll('wc-chess-board'),
      ...document.querySelectorAll('.board')
    ];
    for (const c of cands) if (c.querySelector('.piece')) return c;
    return null;
  }

  function isFlipped() {
    const b = getBoardEl();
    return !!b && (b.classList.contains('flipped') || !!b.querySelector('.flipped'));
  }

  function readBoard() {
    const board = {};
    const boardEl = getBoardEl();
    if (!boardEl) return board;
    boardEl.querySelectorAll('.piece').forEach(el => {
      let color, type, sq;
      for (const c of el.classList) {
        if (/^[wb][pnbrqk]$/.test(c)) { color = c[0]; type = c[1]; }
        if (/^square-\d\d$/.test(c)) { sq = c.slice(-2); }
      }
      if (!color || !sq) return;
      const file = FILES[parseInt(sq[0]) - 1];
      if (file) board[file + sq[1]] = color + type;
    });
    return board;
  }

  function detectTurn() {
    if (document.querySelector('.clock-black.clock-player-turn')) return 'b';
    if (document.querySelector('.clock-white.clock-player-turn')) return 'w';
    const nodes = document.querySelectorAll('.vertical-move-list .node, .move-list .node, wc-move-list .node');
    if (nodes.length) return nodes.length % 2 === 0 ? 'w' : 'b';
    return 'w';
  }

  function boardToFen(board, turn) {
    let fen = '';
    for (let r = 8; r >= 1; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = board[FILES[f] + r];
        if (p) {
          if (empty) { fen += empty; empty = 0; }
          fen += p[0] === 'w' ? p[1].toUpperCase() : p[1];
        } else empty++;
      }
      if (empty) fen += empty;
      if (r > 1) fen += '/';
    }
    let cast = '';
    if (board['e1'] === 'wk') {
      if (board['h1'] === 'wr') cast += 'K';
      if (board['a1'] === 'wr') cast += 'Q';
    }
    if (board['e8'] === 'bk') {
      if (board['h8'] === 'br') cast += 'k';
      if (board['a8'] === 'br') cast += 'q';
    }
    return `${fen} ${turn} ${cast || '-'} - 0 1`;
  }

  /* =========================================================
     РЎРўР Р•Р›РљРђ РќРђ РћРЎРќРћР’РќРћР™ Р”РћРЎРљР•
  ========================================================= */
  function clearBoardArrow() {
    document.getElementById('ca-board-arrow')?.remove();
  }

  function drawBoardArrow(from, to, tag) {
    clearBoardArrow();
    if (!state.showArrow) return;
    const boardEl = getBoardEl();
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    if (rect.width < 60) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'ca-board-arrow';
    svg.style.left = rect.left + 'px';
    svg.style.top = rect.top + 'px';
    svg.style.width = rect.width + 'px';
    svg.style.height = rect.height + 'px';

    const size = rect.width / 8;
    const flipped = isFlipped();
    const cellCenter = sq => {
      let x = FILES.indexOf(sq[0]);
      let y = 8 - +sq[1];
      if (flipped) { x = 7 - x; y = 7 - y; }
      return { x: x * size + size / 2, y: y * size + size / 2 };
    };

    const a = cellCenter(from);
    const b = cellCenter(to);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const endX = b.x - Math.cos(angle) * (size * 0.34);
    const endY = b.y - Math.sin(angle) * (size * 0.34);
    const hs = size * 0.44;
    const p1x = endX + Math.cos(angle) * hs, p1y = endY + Math.sin(angle) * hs;
    const p2x = endX + Math.cos(angle + Math.PI / 2) * hs * 0.58, p2y = endY + Math.sin(angle + Math.PI / 2) * hs * 0.58;
    const p3x = endX + Math.cos(angle - Math.PI / 2) * hs * 0.58, p3y = endY + Math.sin(angle - Math.PI / 2) * hs * 0.58;
    let col = THEME_ARROWS[state.theme] || '#ffffff';
    if (tag === 'Р—РµРІРѕРє') col = '#71717a';
    else if (tag === 'РћС€РёР±РєР°') col = '#a1a1aa';
    else if (tag === 'РќРµС‚РѕС‡РЅРѕСЃС‚СЊ') col = '#e4e4e7';

    svg.innerHTML = `
      <circle cx="${b.x}" cy="${b.y}" r="${size * 0.38}" fill="none" stroke="${col}" stroke-opacity="0.5" stroke-width="${size * 0.06}"/>
      <line x1="${a.x}" y1="${a.y}" x2="${endX}" y2="${endY}"
            stroke="${col}" stroke-opacity="0.88" stroke-width="${size * 0.16}" stroke-linecap="round"
            style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.45))"/>
      <polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}"
               fill="${col}" fill-opacity="0.94"
               style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.45))"/>`;
    document.body.appendChild(svg);
  }

  window.addEventListener('resize', () => {
    if (state.live.lastBest && state.showArrow) {
      drawBoardArrow(state.live.lastBest.from, state.live.lastBest.to, state.live.lastBest.tag);
    }
  });

  /* =========================================================
     РђР’РўРћ-РџРћРРЎРљ / Р—РђРџРЈРЎРљ РџРђР РўРР
  ========================================================= */
  function isGameOver() {
    return !!document.querySelector('.game-over-modal-content, .board-modal-container-container, .game-over-buttons-component, .game-over-modal-buttons');
  }

  function safeClickButton(btn) {
    if (!btn) return false;
    try {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
      btn.dispatchEvent(new PointerEvent('pointerdown', opts));
      btn.dispatchEvent(new MouseEvent('mousedown', opts));
      btn.dispatchEvent(new PointerEvent('pointerup', opts));
      btn.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch (_) {}
    btn.click();
    return true;
  }

  function findNewGameButton() {
    // 1. РџСЂРёРѕСЂРёС‚РµС‚РЅС‹Р№ РїРѕРёСЃРє СЌР»РµРјРµРЅС‚Р°: <button class="cc-button-component_b359d5b cc-button-secondary_b359d5b..." ...>РќРѕРІР°СЏ 10 РјРёРЅ.</button>
    const directCandidates = [
      ...document.querySelectorAll('button.cc-button-secondary_b359d5b'),
      ...document.querySelectorAll('button[class*="cc-button-secondary"]'),
      ...document.querySelectorAll('button[data-variant="secondary"]'),
      ...document.querySelectorAll('button[class*="cc-button-component"]'),
      ...document.querySelectorAll('button[data-cy*="new-game"]'),
      ...document.querySelectorAll('.game-over-modal-buttons button, .game-over-buttons-component button, .game-over-modal-content button'),
      ...document.querySelectorAll('button')
    ];

    for (const btn of directCandidates) {
      if (!btn || btn.offsetParent === null) continue;
      if (btn.getAttribute('data-disabled') === 'true' || btn.getAttribute('data-loading') === 'true') continue;

      const txt = (btn.textContent || '').trim().toLowerCase();
      if (!txt) continue;

      // РўРѕС‡РЅС‹Р№ РїРѕРёСЃРє "РќРѕРІР°СЏ 10 РјРёРЅ." Рё РґСЂСѓРіРёС… Р±С‹СЃС‚СЂС‹С… РєРѕРЅС‚СЂРѕР»РµР№
      if (
        txt.includes('РЅРѕРІР°СЏ 10 РјРёРЅ') ||
        txt.includes('new 10 min') ||
        (txt.includes('РЅРѕРІР°СЏ') && (txt.includes('РјРёРЅ') || txt.includes('СЃРµРє') || txt.includes('РїР°СЂС‚РёСЏ') || txt.includes('РёРіСЂР°'))) ||
        (txt.includes('new') && (txt.includes('min') || txt.includes('sec') || txt.includes('game')))
      ) {
        return btn;
      }
    }

    // 2. РЎС‚Р°РЅРґР°СЂС‚РЅС‹Рµ РєРЅРѕРїРєРё РјРѕРґР°Р»РєРё РѕРєРѕРЅС‡Р°РЅРёСЏ РёРіСЂС‹
    const modalSelectors = [
      'button[data-cy="game-over-modal-new-game-button"]',
      '.game-over-modal-buttons button.ui_v5-button-primary',
      '.game-over-buttons-component button'
    ];
    for (const sel of modalSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && btn.getAttribute('data-disabled') !== 'true') {
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt.includes('new') || txt.includes('РЅРѕРІ') || txt.includes('РёРіСЂР°С‚СЊ') || txt.includes('play')) {
          return btn;
        }
      }
    }

    // 3. РљРЅРѕРїРєРё РІ Р»РѕР±Р±Рё
    const lobbySelectors = [
      'button[data-cy="new-game-index-play"]',
      '.new-game-index-play button',
      'button.cc-button-primary[data-cy*="play"]',
      '.play-quick-links-link'
    ];
    for (const sel of lobbySelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && btn.getAttribute('data-disabled') !== 'true') {
        return btn;
      }
    }

    return null;
  }

  function tryAutoQueue() {
    if (!state.autoQueue) return false;
    if (Date.now() - state.lastQueueClick < 2000) return false;

    const btn = findNewGameButton();
    if (btn) {
      safeClickButton(btn);
      state.lastQueueClick = Date.now();
      state.movesThisGame = 0;
      clearBoardArrow();
      playSound('queue');
      syncLive({ status: 'Р—Р°РїСѓСЃРє РЅРѕРІРѕР№ РїР°СЂС‚РёРёвЂ¦', lastBest: null, evalHistory: [0], movesMade: 0 });
      return true;
    }

    return false;
  }

  // РњРіРЅРѕРІРµРЅРЅР°СЏ СЂРµР°РєС†РёСЏ С‡РµСЂРµР· MutationObserver: РєР»РёРєР°РµС‚ РєРЅРѕРїРєСѓ РІ С‚РѕС‚ Р¶Рµ РјРёРі, РєР°Рє С‚РѕР»СЊРєРѕ РѕРЅР° РїРѕСЏРІРёР»Р°СЃСЊ РІ DOM
  const autoQueueObserver = new MutationObserver(() => {
    if (state.autoQueue) {
      tryAutoQueue();
    }
  });

  if (document.body) {
    autoQueueObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      autoQueueObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Р¤РѕРЅРѕРІС‹Р№ СЃРєР°РЅРµСЂ РЅР° СЃР»СѓС‡Р°Р№, РµСЃР»Рё РєРЅРѕРїРєР° РїРѕСЏРІРёР»Р°СЃСЊ Р±РµР· РјСѓС‚Р°С†РёРё РґРµСЂРµРІР° (РЅР°РїСЂРёРјРµСЂ, СЃРЅСЏР»Рё display: none)
  setInterval(() => {
    if (state.autoQueue) {
      tryAutoQueue();
    }
  }, 400);

  /* =========================================================
     Р”Р’РР–РћРљ STOCKFISH
  ========================================================= */
  async function initEngine() {
    if (state.engine) return state.engine;
    if (state.enginePromise) return state.enginePromise;

    state.enginePromise = (async () => {
      syncLive({ status: 'Р—Р°РіСЂСѓР·РєР° StockfishвЂ¦' });
      const urls = [
        'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
        'https://unpkg.com/stockfish.js@10.0.2/stockfish.js'
      ];
      for (const url of urls) {
        try {
          const src = await fetch(url).then(r => r.text());
          const blob = new Blob([src], { type: 'application/javascript' });
          const w = new Worker(URL.createObjectURL(blob));
          await new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error('timeout')), 25000);
            const h = e => {
              if (typeof e.data === 'string' && e.data.includes('uciok')) {
                clearTimeout(t);
                w.removeEventListener('message', h);
                res();
              }
            };
            w.addEventListener('message', h);
            w.postMessage('uci');
          });
          state.engine = w;
          return w;
        } catch (e) {
          console.warn('[ChessAuto] CDN error:', url, e);
        }
      }
      state.enginePromise = null;
      throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґРІРёР¶РѕРє');
    })();

    return state.enginePromise;
  }

  async function analyze(fen, modeCfg, errorRate) {
    const w = await initEngine();
    return new Promise((resolve, reject) => {
      let bestScore = '0.00', scoreNum = 0, depth = 0, isMate = false;
      const lines = [];
      const timeout = setTimeout(() => {
        w.removeEventListener('message', handler);
        w.postMessage('stop');
        reject(new Error('timeout'));
      }, 20000);

      const handler = e => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (line.startsWith('info') && line.includes(' pv ')) {
          const dep = line.match(/\bdepth (\d+)\b/);
          const sc = line.match(/\bscore (cp|mate) (-?\d+)\b/);
          const mp = line.match(/\bmultipv (\d+)\b/);
          const pv = line.match(/\bpv (([a-h][1-8][a-h][1-8][qrbn]?)\b.*)/);

          const mpIdx = mp ? parseInt(mp[1], 10) : 1;
          const lineDep = dep ? parseInt(dep[1], 10) : 0;
          let lineScoreNum = 0;
          let lineBestScore = '0.00';
          let lineIsMate = false;

          if (sc) {
            if (sc[1] === 'mate') {
              lineIsMate = true;
              const n = +sc[2];
              lineBestScore = (n > 0 ? '+' : '-') + 'M' + Math.abs(n);
              lineScoreNum = n > 0 ? (9999 - n) : (-9999 - n);
            } else {
              lineIsMate = false;
              lineScoreNum = +sc[2];
              lineBestScore = (lineScoreNum > 0 ? '+' : '') + (lineScoreNum / 100).toFixed(2);
            }
          }

          if (pv) {
            lines[mpIdx - 1] = {
              mp: mpIdx,
              move: pv[2],
              scoreNum: lineScoreNum,
              bestScore: lineBestScore,
              isMate: lineIsMate,
              depth: lineDep
            };
          }

          if (mpIdx === 1) {
            if (dep) depth = lineDep;
            isMate = lineIsMate;
            scoreNum = lineScoreNum;
            bestScore = lineBestScore;
          }
        }

        if (line.startsWith('bestmove')) {
          clearTimeout(timeout);
          w.removeEventListener('message', handler);
          const rawBest = line.split(' ')[1];
          if (!lines[0] || !lines[0].move) {
            lines[0] = { mp: 1, move: rawBest, scoreNum, bestScore, isMate, depth };
          } else if (rawBest && rawBest !== '(none)') {
            lines[0].move = rawBest;
          }
          const validLines = lines.filter(l => l && l.move && l.move.length >= 4);
          resolve({
            bestmove: lines[0]?.move || rawBest,
            bestScore,
            scoreNum,
            depth,
            isMate,
            validLines
          });
        }
      };

      w.addEventListener('message', handler);
      w.postMessage('stop');
      const mpCount = (errorRate && errorRate > 0) ? 5 : 1;
      w.postMessage(`setoption name MultiPV value ${mpCount}`);
      w.postMessage(`setoption name Skill Level value ${modeCfg.skill}`);
      w.postMessage('position fen ' + fen);
      w.postMessage(`go movetime ${modeCfg.movetime}`);
    });
  }

  function calculateHumanDelay(moveCount, isCheck, isCapture, minMs, maxMs, isDynamic) {
    if (!isDynamic) {
      return rand(minMs, maxMs);
    }
    let low = minMs;
    let high = maxMs;

    if (moveCount <= 7) {
      // Р”РµР±СЋС‚РЅС‹Рµ С…РѕРґС‹ РґРµР»Р°СЋС‚СЃСЏ Р±С‹СЃС‚СЂРµРµ
      low = Math.max(450, Math.floor(minMs * 0.6));
      high = Math.max(850, Math.floor(maxMs * 0.65));
    } else if (isCheck || isCapture) {
      // РћС‚РІРµС‚ РЅР° С€Р°С… РёР»Рё РІР·СЏС‚РёРµ
      low = Math.max(650, Math.floor(minMs * 0.8));
      high = Math.max(1200, Math.floor(maxMs * 0.85));
    } else {
      // РњРёС‚С‚РµР»СЊС€РїРёР»СЊ: РіР»СѓР±РѕРєРѕРµ С‡РµР»РѕРІРµС‡РµСЃРєРѕРµ СЂР°Р·РґСѓРјСЊРµ СЃ РІР°СЂРёР°С†РёСЏРјРё
      const thinkVar = rand(150, 950);
      low += thinkVar;
      high += thinkVar + rand(200, 800);
    }

    const jitter = Math.floor((Math.random() - 0.5) * 350);
    return Math.max(300, rand(low, high) + jitter);
  }

  function chooseMove(validLines, mode, errorPattern, errorRate, errorStep, errorType, protectMate, safeMargin, moveIndex) {
    if (!validLines || validLines.length === 0) {
      return { move: null, isError: false, errorKind: null, tag: null };
    }

    const best = validLines[0];
    if (validLines.length === 1) {
      return { move: best.move, isError: false, errorKind: null, tag: null };
    }

    // Р РµР¶РёРј humen mode(full safe):
    // РџРѕС‡С‚Рё РЅРµРІРѕР·РјРѕР¶РЅРѕ РїСЂРѕРёРіСЂР°С‚СЊ! РћС€РёР±РєРё СЂР°Р·СЂРµС€РµРЅС‹ РўРћР›Р¬РљРћ РїСЂРё РЅР°Р»РёС‡РёРё СѓРІРµСЂРµРЅРЅРѕРіРѕ РїРµСЂРµРІРµСЃР° (scoreNum >= safeMargin).
    // Р•СЃР»Рё РїРѕР·РёС†РёСЏ СЂР°РІРЅР°СЏ, СЃРѕРјРЅРёС‚РµР»СЊРЅР°СЏ РёР»Рё С‚СЏР¶РµР»Р°СЏ (< safeMargin) вЂ” Р±РѕС‚ РёРіСЂР°РµС‚ РЅР° РјР°РєСЃРёРјСѓРјРµ (С‚РѕР»СЊРєРѕ Р»СѓС‡С€РёР№ С…РѕРґ).
    const isHumanSafe = (mode === 'human_safe');
    const margin = typeof safeMargin === 'number' ? safeMargin : (isHumanSafe ? 120 : 0);

    if (margin > 0 && best.scoreNum < margin) {
      return { move: best.move, isError: false, errorKind: null, tag: null };
    }

    // РџСЂРѕРІРµСЂСЏРµРј РїР°С‚С‚РµСЂРЅ СЃСЂР°Р±Р°С‚С‹РІР°РЅРёСЏ РѕС€РёР±РєРё (РєР°Р¶РґС‹Р№ 1-Р№, 2-Р№, 3-Р№ С…РѕРґ РёР»Рё РїРѕ С€Р°РЅСЃСѓ)
    let willTrigger = false;
    if (errorPattern === 'chance') {
      willTrigger = (errorRate > 0) && (Math.random() * 100 < errorRate);
    } else {
      const N = errorPattern === 'every2' ? 2 :
                errorPattern === 'every3' ? 3 :
                errorPattern === 'every4' ? 4 :
                errorPattern === 'every5' ? 5 :
                Math.max(1, parseInt(errorStep, 10) || 2);
      willTrigger = (moveIndex % N === 0);
    }

    if (!willTrigger) {
      return { move: best.move, isError: false, errorKind: null, tag: null };
    }

    // РћРїСЂРµРґРµР»СЏРµРј С‚РёРї РѕС€РёР±РєРё: РІ СЂРµР¶РёРјРµ Human Safe РѕС€РёР±РєРё РЎРўР РћР“Рћ РѕРіСЂР°РЅРёС‡РµРЅС‹ РјСЏРіРєРёРјРё РЅРµС‚РѕС‡РЅРѕСЃС‚СЏРјРё!
    let effectiveType = isHumanSafe ? 'inaccuracy' : (errorType || 'mix');
    if (effectiveType === 'mix') {
      const r = Math.random();
      if (r < 0.65) effectiveType = 'inaccuracy';
      else if (r < 0.90) effectiveType = 'mistake';
      else effectiveType = 'blunder';
    }

    // РљР°РЅРґРёРґР°С‚С‹ РЅР° С…РѕРґ-РѕС€РёР±РєСѓ (СЃРѕ 2-Р№ Р»РёРЅРёРё Рё РЅРёР¶Рµ)
    let candidates = validLines.slice(1);

    // Р—Р°С‰РёС‚Р° РѕС‚ РјР°С‚Р°: РµСЃР»Рё РІРєР»СЋС‡РµРЅР°, РЅРµ РґРѕРїСѓСЃРєР°РµРј С…РѕРґ, РѕС‚РґР°СЋС‰РёР№ РєРѕСЂРѕР»СЏ РїРѕРґ Р±С‹СЃС‚СЂС‹Р№ РјР°С‚
    if (protectMate || isHumanSafe) {
      // Р•СЃР»Рё Сѓ РЅР°СЃ СЃР°РјРёС… РјР°С‚ РІ 1 С…РѕРґ, РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅРЅРѕ Р±РµСЂРµРј РїРѕР±РµРґСѓ
      if (best.isMate && best.scoreNum > 0 && Math.abs(best.scoreNum) >= 9990) {
        return { move: best.move, isError: false, errorKind: null, tag: null };
      }

      // РћС‚С„РёР»СЊС‚СЂРѕРІС‹РІР°РµРј С…РѕРґС‹, РІРµРґСѓС‰РёРµ Рє С„РѕСЂСЃРёСЂРѕРІР°РЅРЅРѕРјСѓ РјР°С‚Сѓ СЃРѕРїРµСЂРЅРёРєР°
      const safeCandidates = candidates.filter(c => !(c.isMate && c.scoreNum < 0));
      if (safeCandidates.length > 0) {
        candidates = safeCandidates;
      }
    }

    // Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅР°СЏ РіР°СЂР°РЅС‚РёСЏ Full Safe: РЅРµ РґРѕРїСѓСЃРєР°С‚СЊ РїР°РґРµРЅРёСЏ РѕС†РµРЅРєРё РЅРёР¶Рµ Р±РµР·РѕРїР°СЃРЅРѕРіРѕ СѓСЂРѕРІРЅСЏ (+50 cp)
    if (isHumanSafe) {
      candidates = candidates.filter(c => c.scoreNum >= 50 && (best.scoreNum - c.scoreNum) <= 80);
    }

    if (candidates.length === 0) {
      return { move: best.move, isError: false, errorKind: null, tag: null };
    }

    let chosen = candidates[0];
    let tag = 'РќРµС‚РѕС‡РЅРѕСЃС‚СЊ';

    if (effectiveType === 'inaccuracy') {
      tag = 'РќРµС‚РѕС‡РЅРѕСЃС‚СЊ';
      if (candidates.length >= 2 && Math.abs(candidates[1].scoreNum - best.scoreNum) <= 90) {
        chosen = Math.random() < 0.7 ? candidates[0] : candidates[1];
      } else {
        chosen = candidates[0];
      }
    } else if (effectiveType === 'mistake') {
      tag = 'РћС€РёР±РєР°';
      if (candidates.length >= 3) {
        const idx = Math.floor(Math.random() * (candidates.length - 1)) + 1;
        chosen = candidates[idx];
      } else if (candidates.length >= 2) {
        chosen = candidates[1];
      } else {
        chosen = candidates[0];
      }
    } else if (effectiveType === 'blunder') {
      tag = 'Р—РµРІРѕРє';
      chosen = candidates[candidates.length - 1];
    }

    return {
      move: chosen.move,
      isError: true,
      errorKind: effectiveType,
      tag: tag
    };
  }

  /* =========================================================
     Р’Р«РџРћР›РќР•РќРР• РҐРћР”Рђ
  ========================================================= */
  function getPieceEl(square) {
    const boardEl = getBoardEl();
    if (!boardEl) return null;
    const num = (FILES.indexOf(square[0]) + 1) + square[1];
    return [...boardEl.querySelectorAll('.piece')]
      .find(el => el.classList.contains('square-' + num)) || null;
  }

  function sqToClient(square, addJitter = true) {
    const boardEl = getBoardEl();
    if (!boardEl) return { x: 0, y: 0 };
    const rect = boardEl.getBoundingClientRect();
    const size = rect.width / 8;
    let f = FILES.indexOf(square[0]);
    let r = 8 - +square[1];
    if (isFlipped()) { f = 7 - f; r = 7 - r; }

    // Р§РµР»РѕРІРµС‡РµСЃРєРѕРµ СЃРјРµС‰РµРЅРёРµ: РєР»РёРє РЅРµ СЃС‚СЂРѕРіРѕ РІ С†РµРЅС‚СЂ РєР»РµС‚РєРё, Р° СЃ РµСЃС‚РµСЃС‚РІРµРЅРЅС‹Рј СЂР°Р·Р±СЂРѕСЃРѕРј
    const jx = addJitter ? (Math.random() - 0.5) * (size * 0.42) : 0;
    const jy = addJitter ? (Math.random() - 0.5) * (size * 0.42) : 0;

    return { 
      x: rect.left + f * size + size / 2 + jx, 
      y: rect.top + r * size + size / 2 + jy 
    };
  }

  // Р“РµРЅРµСЂР°С†РёСЏ РµСЃС‚РµСЃС‚РІРµРЅРЅРѕР№ РєСЂРёРІРѕР№ РґРІРёР¶РµРЅРёСЏ СЂСѓРєРё (Bezier Curve)
  function generateBezierCurve(p0, p1, steps) {
    const points = [];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const curveIntensity = (Math.random() - 0.5) * Math.min(50, dist * 0.22);

    const cp = {
      x: midX - (p1.y - p0.y) * 0.12 + curveIntensity,
      y: midY + (p1.x - p0.x) * 0.12 + curveIntensity
    };

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const easeT = 1 - Math.pow(1 - t, 2.2); // РїР»Р°РІРЅРѕРµ Р·Р°РјРµРґР»РµРЅРёРµ РїРµСЂРµРґ СЃР±СЂРѕСЃРѕРј С„РёРіСѓСЂС‹
      const x = Math.pow(1 - easeT, 2) * p0.x + 2 * (1 - easeT) * easeT * cp.x + Math.pow(easeT, 2) * p1.x;
      const y = Math.pow(1 - easeT, 2) * p0.y + 2 * (1 - easeT) * easeT * cp.y + Math.pow(easeT, 2) * p1.y;
      points.push({ x, y });
    }
    return points;
  }

  async function dragPiece(from, to) {
    const pieceEl = getPieceEl(from);
    if (!pieceEl) return false;
    const a = sqToClient(from, true);
    const b = sqToClient(to, true);

    const base = {
      bubbles: true, cancelable: true, button: 0, buttons: 1,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: a.x, clientY: a.y,
      screenX: window.screenX + a.x, screenY: window.screenY + a.y
    };

    // 1. Р—Р°Р¶Р°С‚РёРµ С„РёРіСѓСЂС‹ СЃ С‡РµР»РѕРІРµС‡РµСЃРєРѕР№ РїР°СѓР·РѕР№
    pieceEl.dispatchEvent(new PointerEvent('pointerdown', base));
    pieceEl.dispatchEvent(new MouseEvent('mousedown', base));
    await sleep(rand(45, 90));

    // 2. Р”РІРёР¶РµРЅРёРµ РјС‹С€Рё РїРѕ РєСЂРёРІРѕР№ Р‘РµР·СЊРµ СЃ РёРЅС‚РµСЂРїРѕР»СЏС†РёРµР№
    const steps = rand(6, 11);
    const path = generateBezierCurve(a, b, steps);

    for (const pt of path) {
      const stepEvent = {
        ...base,
        clientX: pt.x,
        clientY: pt.y,
        screenX: window.screenX + pt.x,
        screenY: window.screenY + pt.y
      };
      const curTarget = document.elementFromPoint(pt.x, pt.y) || document.body;
      window.dispatchEvent(new PointerEvent('pointermove', stepEvent));
      curTarget.dispatchEvent(new PointerEvent('pointermove', stepEvent));
      curTarget.dispatchEvent(new MouseEvent('mousemove', stepEvent));
      await sleep(rand(12, 22));
    }

    // 3. РћС‚РїСѓСЃРєР°РЅРёРµ С„РёРіСѓСЂС‹
    await sleep(rand(30, 60));
    const upEvent = {
      ...base,
      clientX: b.x,
      clientY: b.y,
      buttons: 0,
      screenX: window.screenX + b.x,
      screenY: window.screenY + b.y
    };
    const finalTarget = document.elementFromPoint(b.x, b.y) || document.body;
    finalTarget.dispatchEvent(new PointerEvent('pointerup', upEvent));
    finalTarget.dispatchEvent(new MouseEvent('mouseup', upEvent));
    window.dispatchEvent(new PointerEvent('pointerup', upEvent));
    await sleep(rand(45, 80));
    return true;
  }

  async function pickPromotion(promo, isWhite) {
    const want = (isWhite ? 'w' : 'b') + promo.toLowerCase();
    for (let i = 0; i < 25; i++) {
      const box = document.querySelector('.promotion-window, [class*="promotion-window"]');
      const scope = box || document;
      for (const el of scope.querySelectorAll('.piece, [class*="piece"]')) {
        if ((el.className || '').includes(want)) {
          el.click();
          return true;
        }
      }
      await sleep(40);
    }
    return false;
  }

  async function makeMove(uci) {
    if (!uci || uci.length < 4) return;
    const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
    const piece = readBoard()[from];
    const isWhite = piece ? piece[0] === 'w' : true;
    await dragPiece(from, to);
    if (promo) {
      await sleep(80);
      await pickPromotion(promo, isWhite);
    }
  }

  /* =========================================================
     Р“Р›РђР’РќР«Р™ Р¦РРљР› Р РЎРРќРҐР РћРќРР—РђР¦РРЇ
  ========================================================= */
  async function loop() {
    if (!state.running) return;

    try {
      if (isGameOver()) {
        state.movesThisGame = 0;
        clearBoardArrow();
        if (tryAutoQueue()) {
          state.timer = setTimeout(loop, 1500);
          return;
        }
        syncLive({ status: 'РџР°СЂС‚РёСЏ РѕРєРѕРЅС‡РµРЅР°' });
        state.timer = setTimeout(loop, 1000);
        return;
      }

      const board = readBoard();
      const pieceCount = Object.keys(board).length;
      if (pieceCount < 2) {
        state.movesThisGame = 0;
        tryAutoQueue();
        syncLive({ board: {}, status: 'РћР¶РёРґР°РЅРёРµ РїР°СЂС‚РёРёвЂ¦' });
        state.timer = setTimeout(loop, 1000);
        return;
      }

      const flipped = isFlipped();
      const ourSide = flipped ? 'b' : 'w';
      const turn = detectTurn();

      if (turn !== ourSide) {
        syncLive({ board, flipped, turn, status: 'РҐРѕРґ СЃРѕРїРµСЂРЅРёРєР°вЂ¦' });
        state.timer = setTimeout(loop, 350);
        return;
      }

      if (Date.now() - state.lastMoveTime < 700) {
        state.timer = setTimeout(loop, 250);
        return;
      }

      const cfg = MODES[state.mode] || MODES.human_safe;
      const fen = boardToFen(board, turn);
      syncLive({ board, flipped, turn, status: `РђРЅР°Р»РёР· (${cfg.name})вЂ¦` });

      const { bestmove, bestScore, scoreNum, depth, isMate, validLines } = await analyze(fen, cfg, state.errorRate);
      if (!state.running) return;

      if (!bestmove || bestmove === '(none)') {
        state.timer = setTimeout(loop, 800);
        return;
      }

      state.movesThisGame = (state.movesThisGame || 0) + 1;
      const decision = chooseMove(
        validLines,
        state.mode,
        state.errorPattern,
        state.errorRate,
        state.errorStep,
        state.errorType,
        state.protectMate,
        state.safeMargin,
        state.movesThisGame
      );
      const moveToPlay = decision.move || bestmove;

      const from = moveToPlay.slice(0, 2);
      const to = moveToPlay.slice(2, 4);
      const lastBest = { from, to, isError: decision.isError, tag: decision.tag };

      // РќРѕСЂРјР°Р»РёР·СѓРµРј РѕС†РµРЅРєСѓ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ Р±РµР»С‹С… РґР»СЏ РіСЂР°С„РёРєР° РїР°СЂС‚РёРё
      const whiteScore = turn === 'w' ? scoreNum : -scoreNum;
      const history = [...(state.live.evalHistory || [0]), whiteScore].slice(-120);

      drawBoardArrow(from, to, decision.tag);
      const statusMove = decision.isError
        ? `РҐРѕРґ: ${from} в†’ ${to} (${decision.tag})`
        : `РҐРѕРґ: ${from} в†’ ${to}`;

      syncLive({
        board,
        flipped,
        turn,
        bestScore,
        scoreNum,
        isMate,
        depth,
        lastBest,
        evalHistory: history,
        status: statusMove
      });

      const isCheck = !!document.querySelector('.check, [class*="check"]');
      const isCapture = !!board[to];
      const cfgDelayMin = state.delayMin || cfg.delayMin;
      const cfgDelayMax = state.delayMax || cfg.delayMax;
      const delay = calculateHumanDelay(
        state.movesThisGame,
        isCheck,
        isCapture,
        cfgDelayMin,
        cfgDelayMax,
        state.dynamicTiming !== false
      );
      await sleep(delay);
      if (!state.running) return;

      playSound('move');
      await makeMove(moveToPlay);

      state.lastMoveTime = Date.now();
      syncLive({
        board: readBoard(),
        movesMade: (state.live.movesMade || 0) + 1
      });
    } catch (e) {
      console.error('[ChessAuto]', e);
      syncLive({ status: 'РћС€РёР±РєР° Р°РЅР°Р»РёР·Р°' });
    }

    if (state.running) {
      state.timer = setTimeout(loop, 300);
    }
  }

  /* Р¤РѕРЅРѕРІР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РґРѕСЃРєРё РґР»СЏ Popup, РґР°Р¶Рµ РµСЃР»Рё Р±РѕС‚ РЅР° РїР°СѓР·Рµ */
  setInterval(() => {
    const board = readBoard();
    const flipped = isFlipped();
    const turn = detectTurn();
    const hash = JSON.stringify(board) + flipped + turn;
    if (hash !== state.lastBoardHash) {
      state.lastBoardHash = hash;
      syncLive({ board, flipped, turn });
    }
  }, 600);

  /* Р“РѕСЂСЏС‡Р°СЏ РєР»Р°РІРёС€Р° Alt+S РїСЂСЏРјРѕ РЅР° СЃС‚СЂР°РЅРёС†Рµ */
  window.addEventListener('keydown', e => {
    if (e.altKey && e.code === 'KeyS') {
      e.preventDefault();
      browser.storage.local.set({ running: !state.running });
    }
  });

  function applySettings(data) {
    const wasRunning = state.running;

    if (data.mode !== undefined) state.mode = data.mode;
    if (data.autoQueue !== undefined) state.autoQueue = data.autoQueue;
    if (data.showArrow !== undefined) state.showArrow = data.showArrow;
    if (data.sound !== undefined) state.sound = data.sound;
    if (data.theme !== undefined) state.theme = data.theme;
    if (data.errorRate !== undefined) state.errorRate = data.errorRate;
    if (data.errorPattern !== undefined) state.errorPattern = data.errorPattern;
    if (data.errorStep !== undefined) state.errorStep = data.errorStep;
    if (data.errorType !== undefined) state.errorType = data.errorType;
    if (data.protectMate !== undefined) state.protectMate = data.protectMate;
    if (data.safeMargin !== undefined) state.safeMargin = data.safeMargin;
    if (data.delayMin !== undefined) state.delayMin = data.delayMin;
    if (data.delayMax !== undefined) state.delayMax = data.delayMax;
    if (data.dynamicTiming !== undefined) state.dynamicTiming = data.dynamicTiming;
    if (data.running !== undefined) state.running = data.running;
    if (data.live !== undefined && data.live.evalHistory) {
      state.live.evalHistory = data.live.evalHistory;
      state.live.movesMade = data.live.movesMade || 0;
      if (data.live.movesMade === 0) state.movesThisGame = 0;
    }

    if (!state.showArrow) clearBoardArrow();
    else if (state.live.lastBest) drawBoardArrow(state.live.lastBest.from, state.live.lastBest.to, state.live.lastBest.tag);

    if (state.running && !wasRunning) {
      clearTimeout(state.timer);
      syncLive({ status: 'Р—Р°РїСѓС‰РµРЅРѕвЂ¦' });
      loop();
    } else if (!state.running && wasRunning) {
      clearTimeout(state.timer);
      clearBoardArrow();
      syncLive({ status: 'РћСЃС‚Р°РЅРѕРІР»РµРЅРѕ' });
    }
  }

  /* РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ РїСЂРё РѕС‚РєСЂС‹С‚РёРё / РїРµСЂРµР·Р°РіСЂСѓР·РєРµ СЃС‚СЂР°РЅРёС†С‹ */
  browser.storage.local.get(null, data => {
    applySettings(data);
    if (!state.running) {
      syncLive({
        board: readBoard(),
        flipped: isFlipped(),
        turn: detectTurn(),
        status: 'Р“РѕС‚РѕРІ Рє СЂР°Р±РѕС‚Рµ'
      });
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    for (const [k, v] of Object.entries(changes)) {
      if (k !== 'live') patch[k] = v.newValue;
      else if (v.newValue && v.newValue.evalHistory?.length === 1 && v.newValue.evalHistory[0] === 0 && v.newValue.movesMade === 0) {
        patch.live = v.newValue;
      }
    }
    if (Object.keys(patch).length) applySettings(patch);
  });
})();
