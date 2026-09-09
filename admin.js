// DiuWin Official Admin Control Panel Engine
(function () {
  let activeTab = 'wingo';
  let selectedBallNumber = null;
  let currentControlMode = 'manual';
  let liveRoundData = null;
  let pollTimer = null;
  let allUsersCache = [];
  let currentModalUserId = null;

  // Audio / Sounds
  let audioCtx = null;
  function playClick() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch (e) {}
  }

  // Toast Notification
  function showAdminToast(msg, isError = false) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = isError ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'linear-gradient(135deg, #10b981, #059669)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ==================== AUTHENTICATION GATE ====================
  function checkAdminAuth() {
    const gate = document.getElementById('adminLoginGate');
    const isAuth = sessionStorage.getItem('diuwin_admin_auth');

    if (isAuth) {
      if (gate) gate.classList.add('hidden');
      const adminData = JSON.parse(sessionStorage.getItem('diuwin_admin_data') || '{}');
      const nameEl = document.getElementById('activeAdminName');
      if (nameEl && adminData.id) nameEl.textContent = adminData.id.toUpperCase();
      return true;
    } else {
      if (gate) gate.classList.remove('hidden');
      return false;
    }
  }

  function initLoginGate() {
    const form = document.getElementById('adminLoginForm');
    const togglePass = document.getElementById('btnTogglePass');
    const passInput = document.getElementById('adminPassInput');
    const errorEl = document.getElementById('loginErrorMsg');
    const submitBtn = document.getElementById('btnAdminSubmit');
    const logoutBtn = document.getElementById('btnAdminLogout');

    // Toggle Password Visibility
    if (togglePass && passInput) {
      togglePass.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        togglePass.innerHTML = isPass ? '<i class="fa fa-eye-slash"></i>' : '<i class="fa fa-eye"></i>';
      });
    }

    // Login Form Submit
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        playClick();

        const username = document.getElementById('adminIdInput').value.trim();
        const password = passInput.value.trim();

        if (errorEl) errorEl.textContent = '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verifying Credentials...';
        }

        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const data = await res.json();
          if (data.success) {
            sessionStorage.setItem('diuwin_admin_auth', data.token);
            sessionStorage.setItem('diuwin_admin_data', JSON.stringify(data.admin || { id: username }));

            showAdminToast('Access Granted! Welcome to DiuWin Admin Console.');
            checkAdminAuth();

            // Start live data engine
            startLivePolling();
            fetchAdminOverview();
            fetchUsersList();
            fetchTransactionsList();
          } else {
            if (errorEl) errorEl.textContent = data.message || 'Incorrect ID or Password!';
            showAdminToast(data.message || 'Authentication Failed', true);
          }
        } catch (err) {
          if (errorEl) errorEl.textContent = 'Server connection failed.';
          showAdminToast('Server offline or network error', true);
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa fa-sign-in"></i> Unlock Admin Console';
          }
        }
      });
    }

    // Logout Action
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        playClick();
        if (confirm('Are you sure you want to logout from Admin Control?')) {
          sessionStorage.removeItem('diuwin_admin_auth');
          sessionStorage.removeItem('diuwin_admin_data');
          if (pollTimer) clearInterval(pollTimer);
          checkAdminAuth();
          showAdminToast('Logged out successfully');
        }
      });
    }
  }

  // ==================== INITIALIZATION ====================
  document.addEventListener('DOMContentLoaded', () => {
    initLoginGate();
    initNavigationTabs();
    initModeButtons();
    initBallButtons();
    initLockOutcomeButton();
    initBalanceModal();
    initUserSearch();

    // Multi-Game initializers
    initK3Controls();
    init5dControls();
    initAviatorControls();
    initMinesControls();
    initChickenControls();
    initMasterHistoryControls();

    const isAuthed = checkAdminAuth();
    if (isAuthed) {
      startLivePolling();
      fetchAdminOverview();
      fetchUsersList();
      fetchTransactionsList();
      fetchMasterHistory();
    }
  });

  // ==================== TAB NAVIGATION ====================
  function initNavigationTabs() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item, .admin-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        playClick();
        let tabKey = item.dataset.tab;
        if (!tabKey) return;

        const paneId = tabKey.startsWith('tab-') ? tabKey : `tab-${tabKey}`;
        const cleanKey = tabKey.replace('tab-', '');

        navItems.forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        item.classList.add('active');
        const targetPane = document.getElementById(paneId);
        if (targetPane) targetPane.classList.add('active');

        activeTab = paneId;

        // Dynamic Header Title
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
          const titles = {
            'wingo': 'WinGo Outcome Controller',
            'k3': 'K3 Dice Game Controller',
            '5d': '5D Lottery Game Controller',
            'aviator': 'Aviator Multiplier Controller',
            'mines': 'Mines Trap & RTP Controller',
            'chicken': 'Chicken Road Collision Controller',
            'master-history': 'Unified Master Game Audit & Settlement History',
            'users': 'Registered Player Accounts & Wallets',
            'finance': 'Deposit & Withdrawal Authorizations',
            'overview': 'Financial Analytics & Platform Margin'
          };
          pageTitle.textContent = titles[cleanKey] || 'DiuWin Master Control';
        }

        if (cleanKey === 'users') fetchUsersList();
        if (cleanKey === 'finance') fetchTransactionsList();
        if (cleanKey === 'overview') fetchAdminOverview();
        if (cleanKey === 'master-history') fetchMasterHistory();
      });
    });
  }

  // ==================== LIVE MULTI-GAME POLLING ====================
  function startLivePolling() {
    fetchMultiGameSummary();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchMultiGameSummary, 1500);
  }

  async function fetchMultiGameSummary() {
    try {
      const res = await fetch('/api/admin/games/live-summary');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const summary = data.games || data.summary || {};
      if (summary.wingo) {
        liveRoundData = summary.wingo;
        renderLiveWingoBoard(summary.wingo);
      }
      if (summary.k3) renderK3LiveBoard(summary.k3);
      if (summary['5d']) render5dLiveBoard(summary['5d']);
      if (summary.aviator) renderAviatorLiveBoard(summary.aviator);
      if (summary.mines) renderMinesLiveBoard(summary.mines);
      if (summary.chicken) renderChickenLiveBoard(summary.chicken);

      if (activeTab === 'tab-master-history' || activeTab === 'master-history') {
        fetchMasterHistory();
      }
    } catch (err) {
      console.warn('Live poll error:', err);
    }
  }

  function renderLiveWingoBoard(data) {
    // Current Period
    const roundEl = document.getElementById('currentRoundId');
    const targetPeriodEl = document.getElementById('targetPeriodId');
    if (roundEl) roundEl.textContent = '#' + data.period;
    if (targetPeriodEl) targetPeriodEl.textContent = '#' + data.period;

    // Time Remaining Countdown
    const timerEl = document.getElementById('roundTimerVal');
    const noteEl = document.getElementById('roundStatusNote');
    const rem = data.timeRemaining !== undefined ? data.timeRemaining : 60;
    const m = String(Math.floor(rem / 60)).padStart(2, '0');
    const s = String(rem % 60).padStart(2, '0');

    if (timerEl) {
      timerEl.textContent = `${m} : ${s}`;
      if (rem <= 5) {
        timerEl.style.color = '#ef4444';
        timerEl.style.textShadow = '0 0 16px rgba(239,68,68,0.7)';
        if (noteEl) {
          noteEl.textContent = '🔒 ROUND LOCKED - Outcome resolution in progress';
          noteEl.style.color = '#ef4444';
        }
      } else {
        timerEl.style.color = '#38bdf8';
        timerEl.style.textShadow = '0 0 16px rgba(56,189,248,0.4)';
        if (noteEl) {
          noteEl.textContent = '🟢 Bets are open for this period';
          noteEl.style.color = '#10b981';
        }
      }
    }

    // Active Bets Count & Total Pool
    const betsCountEl = document.getElementById('activeBetsCount');
    const betsBadgeEl = document.getElementById('activeBetsBadge');
    const totalPoolEl = document.getElementById('totalPoolAmount');

    const pool = data.livePool || data.pools || { totalPool: 0, green: 0, violet: 0, red: 0, big: 0, small: 0, numbers: {} };
    const totalPoolNum = pool.totalBet !== undefined ? pool.totalBet : (pool.totalPool || 0);

    if (betsCountEl) betsCountEl.textContent = data.activeBetsCount || 0;
    if (betsBadgeEl) betsBadgeEl.textContent = `${data.activeBetsCount || 0} Bets`;
    if (totalPoolEl) totalPoolEl.textContent = `₹${totalPoolNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Active Mode Indicator Badge
    const modeBadge = document.getElementById('currentActiveModeBadge');
    const activeMode = (data.mode || (data.adminSettings && data.adminSettings.mode) || 'manual').toUpperCase().replace('_', ' ');
    if (modeBadge) {
      modeBadge.textContent = `Active Mode: ${activeMode}`;
    }

    // Update Category Pool Bars
    updateBar('barGreen', 'valGreen', pool.green || 0, totalPoolNum);
    updateBar('barViolet', 'valViolet', pool.violet || 0, totalPoolNum);
    updateBar('barRed', 'valRed', pool.red || 0, totalPoolNum);
    updateBar('barBig', 'valBig', pool.big || 0, totalPoolNum);
    updateBar('barSmall', 'valSmall', pool.small || 0, totalPoolNum);

    // Update Liability Matrix
    renderLiabilityMatrix(data.liabilities || {}, totalPoolNum);

    // Update Active Bets Table
    renderActiveBetsTable(data.activeBets || []);

    // If server has a forced number active, highlight it
    const forcedNum = data.forcedOutcome ? data.forcedOutcome.number : ((data.adminSettings && data.adminSettings.forcedNumber !== null) ? data.adminSettings.forcedNumber : null);
    document.querySelectorAll('.admin-ball-btn').forEach(btn => {
      const val = parseInt(btn.dataset.val, 10);
      if (val === forcedNum) {
        btn.classList.add('server-forced');
      } else {
        btn.classList.remove('server-forced');
      }
    });

    // Update impact preview if a ball is selected
    if (selectedBallNumber !== null) {
      calculateAndShowImpact(selectedBallNumber);
    }
  }

  function updateBar(barId, valId, amount, total) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    if (val) val.textContent = `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (bar) {
      const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0;
      bar.style.width = `${pct}%`;
    }
  }

  // ==================== LIABILITY MATRIX ====================
  function renderLiabilityMatrix(liabilities, totalPool) {
    const container = document.getElementById('liabilityMatrix');
    if (!container) return;

    let html = '';
    for (let n = 0; n <= 9; n++) {
      const payout = liabilities[n] || 0;
      const profit = totalPool - payout;
      const isProfitable = profit >= 0;

      let colorTag = 'Red';
      let ballClass = 'ball-red';
      if (n === 0) { colorTag = 'Red+Violet'; ballClass = 'ball-mix-red'; }
      else if (n === 5) { colorTag = 'Green+Violet'; ballClass = 'ball-mix-green'; }
      else if ([1, 3, 7, 9].includes(n)) { colorTag = 'Green'; ballClass = 'ball-green'; }

      html += `
        <div class="matrix-cell ${n === selectedBallNumber ? 'selected' : ''}" onclick="window.adminSelectBall(${n})">
          <div class="matrix-ball ${ballClass}">${n}</div>
          <div class="matrix-info">
            <span class="m-tag">${colorTag}</span>
            <span class="m-payout">Payout: ₹${payout.toFixed(0)}</span>
            <strong class="m-profit ${isProfitable ? 'text-green' : 'text-red'}">
              ${isProfitable ? '+' : ''}₹${profit.toFixed(0)}
            </strong>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  // ==================== ACTIVE BETS TABLE ====================
  function renderActiveBetsTable(bets) {
    const tbody = document.getElementById('activeBetsTableBody');
    if (!tbody) return;

    if (!bets || bets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-td">No bets placed yet in current period.</td></tr>`;
      return;
    }

    tbody.innerHTML = bets.map(b => {
      const timeStr = b.createdAt ? new Date(b.createdAt).toLocaleTimeString() : 'Just now';
      let choiceBadge = `<span class="badge-tag">${b.choice}</span>`;

      if (b.type === 'color') {
        const bg = b.choice === 'green' ? '#10b981' : (b.choice === 'violet' ? '#8b5cf6' : '#ef4444');
        choiceBadge = `<span class="badge-tag" style="background:${bg}; color:#fff;">${b.choice.toUpperCase()}</span>`;
      } else if (b.type === 'size') {
        const bg = b.choice.toLowerCase() === 'big' ? '#f59e0b' : '#3b82f6';
        choiceBadge = `<span class="badge-tag" style="background:${bg}; color:#fff;">${b.choice.toUpperCase()}</span>`;
      } else if (b.type === 'number') {
        choiceBadge = `<span class="badge-tag" style="background:#0284c7; color:#fff; font-weight:800;">BALL ${b.choice}</span>`;
      }

      return `
        <tr>
          <td><span style="color:#94a3b8; font-size:12px;">${timeStr}</span></td>
          <td><strong>${b.userName || b.userId || 'Player'}</strong></td>
          <td><span style="color:#38bdf8;">#${b.period}</span></td>
          <td><span style="text-transform:capitalize; color:#cbd5e1;">${b.type}</span></td>
          <td>${choiceBadge}</td>
          <td><strong style="color:#10b981;">₹${(b.amount || 0).toFixed(2)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // ==================== OUTCOME CONTROL & BALL SELECTOR ====================
  function initModeButtons() {
    const modeBtns = document.querySelectorAll('.mode-card-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentControlMode = btn.dataset.mode;
        const selectorArea = document.getElementById('manualSelectorArea');

        if (currentControlMode === 'manual') {
          if (selectorArea) selectorArea.style.opacity = '1';
        } else {
          // If auto mode, send setting directly to server
          applyControlMode(currentControlMode);
        }
      });
    });
  }

  function initBallButtons() {
    const ballBtns = document.querySelectorAll('.admin-ball-btn');
    ballBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        const val = parseInt(btn.dataset.val, 10);
        window.adminSelectBall(val);
      });
    });
  }

  window.adminSelectBall = function (val) {
    selectedBallNumber = val;

    // Update active state on ball buttons
    document.querySelectorAll('.admin-ball-btn').forEach(b => {
      if (parseInt(b.dataset.val, 10) === val) {
        b.classList.add('selected');
      } else {
        b.classList.remove('selected');
      }
    });

    const statusMsg = document.getElementById('selectionStatusMsg');
    if (statusMsg) {
      statusMsg.textContent = `Ball #${val} selected`;
      statusMsg.style.color = '#38bdf8';
    }

    calculateAndShowImpact(val);
  };

  function calculateAndShowImpact(num) {
    const prevNum = document.getElementById('prevNum');
    const prevColors = document.getElementById('prevColors');
    const prevLiab = document.getElementById('prevLiability');
    const prevProf = document.getElementById('prevProfit');

    if (!prevNum) return;
    prevNum.textContent = `Ball #${num}`;

    let colorsStr = 'Red';
    if (num === 0) colorsStr = 'Red + Violet (Split)';
    else if (num === 5) colorsStr = 'Green + Violet (Split)';
    else if ([1, 3, 7, 9].includes(num)) colorsStr = 'Green';

    const sizeStr = num >= 5 ? 'Big' : 'Small';
    prevColors.textContent = `${colorsStr} • ${sizeStr}`;

    if (liveRoundData && liveRoundData.liabilities) {
      const payout = liveRoundData.liabilities[num] || 0;
      const pool = liveRoundData.livePool || liveRoundData.pools || {};
      const totalPool = pool.totalBet !== undefined ? pool.totalBet : (pool.totalPool || 0);
      const profit = totalPool - payout;

      prevLiab.textContent = `₹${payout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      prevProf.textContent = `${profit >= 0 ? '+' : ''}₹${profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      prevProf.style.color = profit >= 0 ? '#10b981' : '#ef4444';
    }
  }

  function initLockOutcomeButton() {
    const btn = document.getElementById('btnLockOutcome');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      playClick();
      if (selectedBallNumber === null) {
        showAdminToast('Please select a winning ball (0-9) first!', true);
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Locking Result...`;

      try {
        const res = await fetch('/api/admin/wingo/set-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'forced_outcome',
            forcedNumber: selectedBallNumber,
            number: selectedBallNumber
          })
        });

        const data = await res.json();
        if (data.success) {
          showAdminToast(`Outcome LOCKED! Ball #${selectedBallNumber} will win period #${liveRoundData ? liveRoundData.period : ''}`);
          fetchLiveWingoState();
        } else {
          showAdminToast(data.message || 'Failed to lock outcome', true);
        }
      } catch (err) {
        console.error('Error locking outcome:', err);
        showAdminToast('Connection error while setting outcome', true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa fa-check-circle"></i> Apply & Force Winning Outcome`;
      }
    });
  }

  async function applyControlMode(mode) {
    try {
      const res = await fetch('/api/admin/wingo/set-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: mode,
          forcedNumber: null
        })
      });
      const data = await res.json();
      if (data.success) {
        showAdminToast(`Mode switched to: ${mode.toUpperCase().replace('_', ' ')}`);
        selectedBallNumber = null;
        document.querySelectorAll('.admin-ball-btn').forEach(b => b.classList.remove('selected'));
        fetchLiveWingoState();
      }
    } catch (e) {}
  }

  // ==================== USER MANAGEMENT ====================
  function initUserSearch() {
    const searchInput = document.getElementById('userSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const filtered = allUsersCache.filter(u => 
        (u.phone && u.phone.includes(term)) ||
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.id && u.id.toLowerCase().includes(term))
      );
      renderUsersTable(filtered);
    });
  }

  async function fetchUsersList() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      const users = data.users || (Array.isArray(data) ? data : []);
      allUsersCache = users;
      renderUsersTable(users);
    } catch (err) {
      console.error('Failed to load users:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red">Failed to load users.</td></tr>`;
    }
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center empty-td">No user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isBanned = (u.status && u.status.toLowerCase() === 'banned') || u.isBanned;
      const balStr = Number(u.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

      return `
        <tr>
          <td><strong>${u.id}</strong></td>
          <td>${u.phone || 'N/A'}</td>
          <td>${u.name || 'Player'}</td>
          <td><span class="vip-badge">VIP ${u.vipLevel || 1}</span></td>
          <td><strong style="color:#38bdf8; font-size:14px;">₹${balStr}</strong></td>
          <td>
            <span class="status-pill ${isBanned ? 'banned' : 'active'}">
              ${isBanned ? 'BANNED' : 'ACTIVE'}
            </span>
          </td>
          <td>
            <button class="btn-action edit" onclick="window.adminOpenBalanceModal('${u.id}', '${u.name || u.phone}', ${u.balance || 0})">
              <i class="fa fa-pencil"></i> Balance
            </button>
            <button class="btn-action ${isBanned ? 'unban' : 'ban'}" onclick="window.adminToggleBanUser('${u.id}', ${!isBanned})">
              ${isBanned ? 'Unban' : 'Ban'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // User Balance Modal
  function initBalanceModal() {
    const modal = document.getElementById('balanceModal');
    const btnClose = document.getElementById('btnCloseBalanceModal');
    const btnCancel = document.getElementById('btnCancelBalance');
    const btnConfirm = document.getElementById('btnConfirmBalance');

    const closeModal = () => {
      if (modal) modal.classList.remove('show');
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        playClick();
        const action = document.getElementById('modalActionType').value;
        const amount = parseFloat(document.getElementById('modalAmount').value);
        const reason = document.getElementById('modalReason').value.trim();

        if (isNaN(amount) || amount <= 0) {
          showAdminToast('Please enter a valid amount greater than 0', true);
          return;
        }

        btnConfirm.disabled = true;
        try {
          const res = await fetch('/api/admin/users/adjust-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentModalUserId,
              action: action,
              amount: amount,
              reason: reason || 'Manual Admin adjustment'
            })
          });

          const data = await res.json();
          if (data.success) {
            showAdminToast(data.message || 'Balance updated successfully!');
            closeModal();
            fetchUsersList();
            fetchAdminOverview();
          } else {
            showAdminToast(data.message || 'Failed to update balance', true);
          }
        } catch (err) {
          showAdminToast('Error contacting server', true);
        } finally {
          btnConfirm.disabled = false;
        }
      });
    }
  }

  window.adminOpenBalanceModal = function (userId, name, bal) {
    currentModalUserId = userId;
    const modal = document.getElementById('balanceModal');
    const userLabel = document.getElementById('modalUserLabel');
    const amountInput = document.getElementById('modalAmount');
    const reasonInput = document.getElementById('modalReason');

    if (userLabel) userLabel.textContent = `${name} (${userId}) — Balance: ₹${Number(bal).toFixed(2)}`;
    if (amountInput) amountInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (modal) modal.classList.add('show');
  };

  window.adminToggleBanUser = async function (userId, shouldBan) {
    playClick();
    if (!confirm(`Are you sure you want to ${shouldBan ? 'BAN' : 'UNBAN'} user ${userId}?`)) return;

    try {
      const res = await fetch('/api/admin/users/toggle-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      });

      const data = await res.json();
      if (data.success) {
        showAdminToast(data.message);
        fetchUsersList();
      } else {
        showAdminToast(data.message || 'Action failed', true);
      }
    } catch (e) {
      showAdminToast('Network error', true);
    }
  };

  // ==================== FINANCE & TRANSACTIONS ====================
  async function fetchTransactionsList() {
    const tbody = document.getElementById('txTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/transactions');
      if (!res.ok) return;
      const data = await res.json();
      const txs = data.transactions || (Array.isArray(data) ? data : []);
      renderTransactionsTable(txs);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red">Failed to load transactions.</td></tr>`;
    }
  }

  function renderTransactionsTable(txs) {
    const tbody = document.getElementById('txTableBody');
    if (!tbody) return;

    if (!txs || txs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center empty-td">No transaction records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = txs.map(t => {
      const isPending = t.status === 'PENDING' || t.status === 'pending';
      const isSuccess = t.status === 'SUCCESS' || t.status === 'completed';
      const isRejected = t.status === 'REJECTED' || t.status === 'rejected';

      let statusBadge = `<span class="status-pill active">SUCCESS</span>`;
      if (isPending) statusBadge = `<span class="status-pill pending">PENDING</span>`;
      else if (isRejected) statusBadge = `<span class="status-pill banned">REJECTED</span>`;

      const typeClass = t.type && t.type.includes('WITHDRAW') ? 'text-red' : 'text-green';
      const timeStr = t.createdAt ? new Date(t.createdAt).toLocaleString() : 'Recent';

      return `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.userId}</td>
          <td><strong class="${typeClass}">${t.type}</strong></td>
          <td><strong>₹${Number(t.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
          <td><span style="color:#94a3b8; font-size:12px;">${t.description || t.paymentMethod || 'UPI Transfer'}</span></td>
          <td><span style="color:#94a3b8; font-size:12px;">${timeStr}</span></td>
          <td>${statusBadge}</td>
          <td>
            ${isPending ? `
              <button class="btn-action approve" onclick="window.adminProcessTx('${t.id}', 'approve')">Approve</button>
              <button class="btn-action reject" onclick="window.adminProcessTx('${t.id}', 'reject')">Reject</button>
            ` : `<span style="color:#64748b; font-size:12px;">Completed</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  window.adminProcessTx = async function (txId, action) {
    playClick();
    try {
      const res = await fetch('/api/admin/transactions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId, action })
      });

      const data = await res.json();
      if (data.success) {
        showAdminToast(`Transaction ${action}d successfully`);
        fetchTransactionsList();
        fetchAdminOverview();
      } else {
        showAdminToast(data.message || 'Action failed', true);
      }
    } catch (e) {
      showAdminToast('Network error processing transaction', true);
    }
  };

  // ==================== K3 CONTROLLER ====================
  let k3Dice = [1, 2, 3];
  let k3Mode = 'manual';

  function initK3Controls() {
    const modes = [
      { id: 'btnK3ModeManual', mode: 'manual' },
      { id: 'btnK3ModeLeast', mode: 'least_bet' },
      { id: 'btnK3ModeRandom', mode: 'random' }
    ];
    modes.forEach(m => {
      const btn = document.getElementById(m.id);
      if (btn) {
        btn.addEventListener('click', () => {
          playClick();
          k3Mode = m.mode;
          modes.forEach(x => {
            const b = document.getElementById(x.id);
            if (b) b.classList.toggle('active', x.mode === m.mode);
          });
          const badge = document.getElementById('k3ActiveModeBadge');
          if (badge) badge.textContent = 'Mode: ' + m.mode.toUpperCase();
        });
      }
    });

    document.querySelectorAll('.k3-dice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        const die = parseInt(btn.dataset.die);
        const val = parseInt(btn.dataset.val);
        k3Dice[die - 1] = val;

        const group = document.getElementById(`k3Dice${die}Group`);
        if (group) {
          group.querySelectorAll('.k3-dice-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) === val));
        }

        updateK3Preview();
      });
    });

    const lockBtn = document.getElementById('btnLockK3');
    if (lockBtn) {
      lockBtn.addEventListener('click', async () => {
        playClick();
        try {
          const res = await fetch('/api/admin/k3/set-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dice: k3Dice, mode: k3Mode })
          });
          const d = await res.json();
          if (d.success) {
            showAdminToast(`K3 Dice [${k3Dice.join(', ')}] locked successfully for Period #${d.period}!`);
          } else {
            showAdminToast(d.message || 'Failed to set K3 result', true);
          }
        } catch (e) {
          showAdminToast('Network error setting K3 result', true);
        }
      });
    }

    updateK3Preview();
  }

  function updateK3Preview() {
    const d1 = k3Dice[0], d2 = k3Dice[1], d3 = k3Dice[2];
    const sum = d1 + d2 + d3;
    const isBig = sum >= 11;
    const isOdd = sum % 2 !== 0;
    const isTriple = (d1 === d2 && d2 === d3);
    const isTwoSame = (!isTriple && (d1 === d2 || d2 === d3 || d1 === d3));

    const prevDice = document.getElementById('k3DicePrev');
    const prevSum = document.getElementById('k3SumPrev');
    const prevSizeParity = document.getElementById('k3SizeParityPrev');
    const prevPattern = document.getElementById('k3PatternPrev');

    if (prevDice) prevDice.textContent = `[ ${d1}, ${d2}, ${d3} ]`;
    if (prevSum) prevSum.textContent = sum;
    if (prevSizeParity) prevSizeParity.textContent = `${isBig ? 'Big (11-18)' : 'Small (3-10)'} • ${isOdd ? 'Odd' : 'Even'}`;
    if (prevPattern) prevPattern.textContent = isTriple ? 'Triple (All 3 Same - 30x Payout)' : (isTwoSame ? 'Two-Same' : 'Unique (3 Different)');
  }

  function renderK3LiveBoard(data) {
    const roundEl = document.getElementById('k3RoundId');
    const timerEl = document.getElementById('k3Countdown');
    const betsEl = document.getElementById('k3ActiveBets');
    const poolEl = document.getElementById('k3TotalPool');
    const noteEl = document.getElementById('k3StatusNote');

    if (roundEl) roundEl.textContent = '#' + data.period;
    if (betsEl) betsEl.textContent = data.activeBetsCount || 0;
    if (poolEl) poolEl.textContent = `₹${Number(data.totalPool || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const rem = data.timeRemaining !== undefined ? data.timeRemaining : 60;
    const m = String(Math.floor(rem / 60)).padStart(2, '0');
    const s = String(rem % 60).padStart(2, '0');
    if (timerEl) {
      timerEl.textContent = `${m} : ${s}`;
      timerEl.style.color = rem <= 5 ? '#ef4444' : '#fde047';
    }
    if (noteEl) {
      noteEl.textContent = rem <= 5 ? '🔒 ROUND LOCKED - Settle in progress' : '🟢 Bets are open for this period';
      noteEl.style.color = rem <= 5 ? '#ef4444' : '#10b981';
    }
  }

  // ==================== 5D CONTROLLER ====================
  let fivedDigits = [1, 3, 5, 7, 9];
  let fivedMode = 'manual';

  function init5dControls() {
    const modes = [
      { id: 'btn5dModeManual', mode: 'manual' },
      { id: 'btn5dModeLeast', mode: 'least_bet' },
      { id: 'btn5dModeRandom', mode: 'random' }
    ];
    modes.forEach(m => {
      const btn = document.getElementById(m.id);
      if (btn) {
        btn.addEventListener('click', () => {
          playClick();
          fivedMode = m.mode;
          modes.forEach(x => {
            const b = document.getElementById(x.id);
            if (b) b.classList.toggle('active', x.mode === m.mode);
          });
          const badge = document.getElementById('fivedActiveModeBadge');
          if (badge) badge.textContent = 'Mode: ' + m.mode.toUpperCase();
        });
      }
    });

    ['A', 'B', 'C', 'D', 'E'].forEach((pos, idx) => {
      const input = document.getElementById(`digit${pos}`);
      if (input) {
        input.addEventListener('input', () => {
          let val = parseInt(input.value);
          if (isNaN(val) || val < 0) val = 0;
          if (val > 9) val = 9;
          input.value = val;
          fivedDigits[idx] = val;
          update5dPreview();
        });
      }
    });

    const lockBtn = document.getElementById('btnLock5d');
    if (lockBtn) {
      lockBtn.addEventListener('click', async () => {
        playClick();
        try {
          const res = await fetch('/api/admin/5d/set-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ digits: fivedDigits, mode: fivedMode })
          });
          const d = await res.json();
          if (d.success) {
            showAdminToast(`5D Digits [${fivedDigits.join(', ')}] locked successfully for Period #${d.period}!`);
          } else {
            showAdminToast(d.message || 'Failed to set 5D outcome', true);
          }
        } catch (e) {
          showAdminToast('Network error setting 5D result', true);
        }
      });
    }

    update5dPreview();
  }

  function update5dPreview() {
    const sum = fivedDigits.reduce((a, b) => a + b, 0);
    const isBig = sum >= 23;
    const isOdd = sum % 2 !== 0;

    const prevDigits = document.getElementById('fivedPrevDigits');
    const prevSum = document.getElementById('fivedPrevSum');
    const prevAttrs = document.getElementById('fivedPrevAttributes');

    if (prevDigits) prevDigits.textContent = `[ ${fivedDigits.join(', ')} ]`;
    if (prevSum) prevSum.textContent = sum;
    if (prevAttrs) prevAttrs.textContent = `${isBig ? 'Big (≥23)' : 'Small (≤22)'} • ${isOdd ? 'Odd' : 'Even'}`;
  }

  function render5dLiveBoard(data) {
    const roundEl = document.getElementById('fivedRoundId');
    const timerEl = document.getElementById('fivedCountdown');
    const betsEl = document.getElementById('fivedActiveBets');
    const poolEl = document.getElementById('fivedTotalPool');
    const noteEl = document.getElementById('fivedStatusNote');

    if (roundEl) roundEl.textContent = '#' + data.period;
    if (betsEl) betsEl.textContent = data.activeBetsCount || 0;
    if (poolEl) poolEl.textContent = `₹${Number(data.totalPool || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const rem = data.timeRemaining !== undefined ? data.timeRemaining : 60;
    const m = String(Math.floor(rem / 60)).padStart(2, '0');
    const s = String(rem % 60).padStart(2, '0');
    if (timerEl) {
      timerEl.textContent = `${m} : ${s}`;
      timerEl.style.color = rem <= 5 ? '#ef4444' : '#fde047';
    }
    if (noteEl) {
      noteEl.textContent = rem <= 5 ? '🔒 ROUND LOCKED - Settle in progress' : '🟢 Bets are open for this period';
      noteEl.style.color = rem <= 5 ? '#ef4444' : '#10b981';
    }
  }

  // ==================== AVIATOR CONTROLLER ====================
  function initAviatorControls() {
    document.querySelectorAll('.crash-chip-btn[data-mult]').forEach(btn => {
      btn.addEventListener('click', async () => {
        playClick();
        document.querySelectorAll('.crash-chip-btn[data-mult]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mult = parseFloat(btn.dataset.mult);
        const input = document.getElementById('aviatorCustomInput');
        if (input) input.value = mult.toFixed(2);

        await setAviatorCrash(mult);
      });
    });

    const applyBtn = document.getElementById('btnApplyAviatorCrash');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        playClick();
        const input = document.getElementById('aviatorCustomInput');
        const mult = input ? parseFloat(input.value) : 2.50;
        await setAviatorCrash(mult);
      });
    }

    const emergencyBtn = document.getElementById('btnInstantCrashAviator');
    if (emergencyBtn) {
      emergencyBtn.addEventListener('click', async () => {
        playClick();
        if (confirm('CRASH PLANE IMMEDIATELY? All uncashed player bets will be lost!')) {
          try {
            const res = await fetch('/api/admin/aviator/set-crash', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instant: true })
            });
            const d = await res.json();
            if (d.success) {
              showAdminToast('EMERGENCY CRASH TRIGGERED! Plane destroyed.');
            }
          } catch (e) {
            showAdminToast('Failed to trigger instant crash', true);
          }
        }
      });
    }
  }

  async function setAviatorCrash(mult) {
    try {
      const res = await fetch('/api/admin/aviator/set-crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crashPoint: mult })
      });
      const d = await res.json();
      if (d.success) {
        showAdminToast(`Aviator Crash Target set to ${mult.toFixed(2)}x for Period #${d.period}!`);
        const badge = document.getElementById('aviatorModeBadge');
        if (badge) badge.textContent = `Target: ${mult.toFixed(2)}x`;
      } else {
        showAdminToast(d.message || 'Failed to set crash point', true);
      }
    } catch (e) {
      showAdminToast('Network error setting aviator crash', true);
    }
  }

  function renderAviatorLiveBoard(data) {
    const roundEl = document.getElementById('aviatorRoundId');
    const statusEl = document.getElementById('aviatorStatus');
    const liveMultEl = document.getElementById('aviatorMultiplierLive');
    const crashPtEl = document.getElementById('aviatorCurrentCrashPoint');
    const betsEl = document.getElementById('aviatorTotalBets');

    if (roundEl) roundEl.textContent = '#' + data.period;
    const st = (data.state || data.status || 'WAITING').toLowerCase();
    if (statusEl) {
      statusEl.textContent = st.toUpperCase();
      statusEl.style.color = st === 'crashed' ? '#ef4444' : (st === 'flying' ? '#10b981' : '#f59e0b');
    }
    if (liveMultEl) liveMultEl.textContent = `${Number(data.currentMultiplier || 1).toFixed(2)}x`;
    if (crashPtEl) {
      const cp = data.forcedCrash || data.forcedCrashPoint || data.crashPoint;
      crashPtEl.textContent = cp ? `${Number(cp).toFixed(2)}x` : 'Auto';
    }
    if (betsEl) betsEl.textContent = `₹${Number(data.totalPool || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  // ==================== MINES CONTROLLER ====================
  function initMinesControls() {
    const buttons = [
      { id: 'btnMinesForceBomb', trap: 'force_bomb', name: 'FORCE BOMB' },
      { id: 'btnMinesForceGem', trap: 'force_gem', name: 'FORCE GEM' },
      { id: 'btnMinesBalanced', trap: 'balanced', name: 'BALANCED' }
    ];

    buttons.forEach(b => {
      const el = document.getElementById(b.id);
      if (el) {
        el.addEventListener('click', async () => {
          playClick();
          buttons.forEach(x => {
            const btn = document.getElementById(x.id);
            if (btn) btn.classList.toggle('active', x.trap === b.trap);
          });
          try {
            const res = await fetch('/api/admin/mines/set-trap', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trapMode: b.trap })
            });
            const d = await res.json();
            if (d.success) {
              showAdminToast(`Mines Trap Mode set to ${b.name}!`);
              const statusEl = document.getElementById('minesActiveTrapMode');
              if (statusEl) statusEl.textContent = b.name;
            }
          } catch (e) {
            showAdminToast('Failed to set Mines trap', true);
          }
        });
      }
    });
  }

  function renderMinesLiveBoard(data) {
    const roundEl = document.getElementById('minesRoundId');
    const trapEl = document.getElementById('minesActiveTrapMode');
    const countEl = document.getElementById('minesSessionCount');

    if (roundEl) roundEl.textContent = '#' + data.period;
    if (trapEl) trapEl.textContent = (data.trapMode || 'BALANCED').toUpperCase().replace('_', ' ');
    if (countEl) countEl.textContent = data.period;
  }

  // ==================== CHICKEN ROAD CONTROLLER ====================
  function initChickenControls() {
    document.querySelectorAll('.crash-chip-btn[data-step]').forEach(btn => {
      btn.addEventListener('click', async () => {
        playClick();
        document.querySelectorAll('.crash-chip-btn[data-step]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const step = parseInt(btn.dataset.step);
        const input = document.getElementById('chickenCustomStepInput');
        if (input) input.value = step;

        await setChickenStep(step);
      });
    });

    const applyBtn = document.getElementById('btnApplyChickenStep');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        playClick();
        const input = document.getElementById('chickenCustomStepInput');
        const step = input ? parseInt(input.value) : 3;
        await setChickenStep(step);
      });
    }
  }

  async function setChickenStep(step) {
    try {
      const res = await fetch('/api/admin/chicken/set-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step })
      });
      const d = await res.json();
      if (d.success) {
        showAdminToast(`Chicken Road collision forced at Step ${step}!`);
        const display = document.getElementById('chickenCrashStepDisplay');
        if (display) display.textContent = `Step ${step}`;
      }
    } catch (e) {
      showAdminToast('Failed to set Chicken Road step', true);
    }
  }

  function renderChickenLiveBoard(data) {
    const roundEl = document.getElementById('chickenRoundId');
    const stepEl = document.getElementById('chickenCrashStepDisplay');
    const countEl = document.getElementById('chickenRoundsCount');

    if (roundEl) roundEl.textContent = '#' + data.period;
    if (stepEl) stepEl.textContent = `Step ${data.forceCrashStep || 3}`;
    if (countEl) countEl.textContent = data.period;
  }

  // ==================== MASTER HISTORY AUDIT ====================
  let currentHistoryFilter = 'ALL';

  function initMasterHistoryControls() {
    const filterBtns = document.querySelectorAll('#historyFilters .filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentHistoryFilter = btn.dataset.game;
        fetchMasterHistory();
      });
    });
  }

  async function fetchMasterHistory() {
    try {
      const url = currentHistoryFilter && currentHistoryFilter !== 'ALL'
        ? `/api/admin/games/history?game=${encodeURIComponent(currentHistoryFilter)}`
        : '/api/admin/games/history';

      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      renderMasterHistoryTable(data.history || []);
    } catch (e) {
      console.warn('Failed to fetch master history:', e);
    }
  }

  function renderMasterHistoryTable(list) {
    const tbody = document.getElementById('masterHistoryTableBody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center empty-td">No game history records found for ${currentHistoryFilter}.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-IN') : '---';
      const profit = Number(item.netHouseProfit !== undefined ? item.netHouseProfit : (item.profit || 0));
      const profitClass = profit >= 0 ? 'text-emerald' : 'text-red';
      const profitSign = profit >= 0 ? '+' : '';
      const gameLabel = item.gameName || item.gameId || item.game || 'Game';

      let resultBadge = '';
      if (typeof item.result === 'string') {
        resultBadge = `<span class="badge" style="background:#1e293b; color:#f8fafc; font-size:13px; font-weight:600; padding:4px 10px; border-radius:6px; border:1px solid #334155;">${item.result}</span>`;
      } else if (item.result) {
        resultBadge = `<span class="badge" style="background:#1e293b; color:#38bdf8; font-size:13px;">${JSON.stringify(item.result)}</span>`;
      } else {
        resultBadge = `<span class="badge">---</span>`;
      }

      return `
        <tr>
          <td><strong style="color:#60a5fa; font-size:15px; font-family:monospace;">#${item.period}</strong></td>
          <td><span class="game-tag" style="font-weight:800; color:#ffffff; background:#1e3a8a; padding:3px 8px; border-radius:6px; font-size:12px;">${gameLabel}</span></td>
          <td><span style="color:#94a3b8; font-size:12px;">${timeStr}</span></td>
          <td>${resultBadge}</td>
          <td>₹${Number(item.totalBet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>₹${Number(item.totalPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td><strong class="${profitClass}" style="font-size:14px;">${profitSign}₹${profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
          <td><span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-weight:700; padding:2px 8px; border-radius:12px;">SETTLED</span></td>
        </tr>
      `;
    }).join('');
  }

  // ==================== OVERVIEW ANALYTICS ====================
  async function fetchAdminOverview() {
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) return;
      const data = await res.json();
      const stats = data.stats || data;

      const elUsers = document.getElementById('anTotalUsers');
      const elBal = document.getElementById('anTotalBalance');
      const elBets = document.getElementById('anTotalBets');
      const elPayouts = document.getElementById('anTotalPayouts');
      const elProfit = document.getElementById('anNetProfit');

      if (elUsers) elUsers.textContent = stats.totalUsers || 0;
      if (elBal) elBal.textContent = `₹${Number(stats.totalBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (elBets) elBets.textContent = `₹${Number(stats.totalBetVolume || stats.totalBets || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      if (elPayouts) elPayouts.textContent = `₹${Number(stats.totalPayouts || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      if (elProfit) {
        const profit = stats.netHouseProfit !== undefined ? stats.netHouseProfit : (stats.platformProfit || 0);
        elProfit.textContent = `${profit >= 0 ? '+' : ''}₹${Number(profit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        elProfit.style.color = profit >= 0 ? '#10b981' : '#ef4444';
      }
    } catch (e) {
      console.error('Failed to load overview analytics:', e);
    }
  }
})();
