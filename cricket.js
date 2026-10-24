/**
 * DiuWin Cricket Exchange Client Controller
 * Modeled on RajveerExch247 / Diamond Exchange Architecture
 */

(function () {
  'use strict';

  // State
  let currentMatchData = null;
  let userBalance = 1000.0;
  let pollIntervalId = null;
  let lastBallText = '';
  let activeBetSlip = {
    market: 'matchOdds',
    selection: 'teamA',
    selectionName: 'India',
    betType: 'back',
    odds: 1.68,
    stake: 100
  };

  // DOM Elements
  const headerUserBalance = document.getElementById('headerUserBalance');
  const cricketPeriodBadge = document.getElementById('cricketPeriodBadge');
  const btnRefreshBalance = document.getElementById('btnRefreshBalance');
  const btnHeaderDeposit = document.getElementById('btnHeaderDeposit');
  const btnOpenMyBets = document.getElementById('btnOpenMyBets');
  const activeBetsCountBadge = document.getElementById('activeBetsCountBadge');

  // Match Hero Elements
  const matchTournament = document.getElementById('matchTournament');
  const teamAFlag = document.getElementById('teamAFlag');
  const teamAName = document.getElementById('teamAName');
  const teamBFlag = document.getElementById('teamBFlag');
  const teamBName = document.getElementById('teamBName');
  const scoreTeamCode = document.getElementById('scoreTeamCode');
  const scoreRunsWickets = document.getElementById('scoreRunsWickets');
  const scoreOvers = document.getElementById('scoreOvers');
  const valCRR = document.getElementById('valCRR');
  const valRRR = document.getElementById('valRRR');
  const valTarget = document.getElementById('valTarget');
  const equationText = document.getElementById('equationText');

  // Radar Elements
  const radarEventBadge = document.getElementById('radarEventBadge');
  const radarBall = document.getElementById('radarBall');
  const strikerName = document.getElementById('strikerName');
  const strikerScore = document.getElementById('strikerScore');
  const strikerBoundaries = document.getElementById('strikerBoundaries');
  const nonStrikerName = document.getElementById('nonStrikerName');
  const nonStrikerScore = document.getElementById('nonStrikerScore');
  const nonStrikerBoundaries = document.getElementById('nonStrikerBoundaries');
  const bowlerName = document.getElementById('bowlerName');
  const bowlerFigs = document.getElementById('bowlerFigs');
  const recentBallsRow = document.getElementById('recentBallsRow');
  const liveCommentaryText = document.getElementById('liveCommentaryText');

  // Market Elements
  const btnBackTeamA = document.getElementById('btnBackTeamA');
  const btnLayTeamA = document.getElementById('btnLayTeamA');
  const valBackTeamA = document.getElementById('valBackTeamA');
  const valLayTeamA = document.getElementById('valLayTeamA');
  const sizeBackTeamA = document.getElementById('sizeBackTeamA');
  const sizeLayTeamA = document.getElementById('sizeLayTeamA');
  const oddsTeamAFlag = document.getElementById('oddsTeamAFlag');
  const oddsTeamAName = document.getElementById('oddsTeamAName');
  const posTeamA = document.getElementById('posTeamA');

  const btnBackTeamB = document.getElementById('btnBackTeamB');
  const btnLayTeamB = document.getElementById('btnLayTeamB');
  const valBackTeamB = document.getElementById('valBackTeamB');
  const valLayTeamB = document.getElementById('valLayTeamB');
  const sizeBackTeamB = document.getElementById('sizeBackTeamB');
  const sizeLayTeamB = document.getElementById('sizeLayTeamB');
  const oddsTeamBFlag = document.getElementById('oddsTeamBFlag');
  const oddsTeamBName = document.getElementById('oddsTeamBName');
  const posTeamB = document.getElementById('posTeamB');

  // Bookmaker Elements
  const valBmBackTeamA = document.getElementById('valBmBackTeamA');
  const valBmLayTeamA = document.getElementById('valBmLayTeamA');
  const valBmBackTeamB = document.getElementById('valBmBackTeamB');
  const valBmLayTeamB = document.getElementById('valBmLayTeamB');
  const bmTeamAFlag = document.getElementById('bmTeamAFlag');
  const bmTeamAName = document.getElementById('bmTeamAName');
  const bmTeamBFlag = document.getElementById('bmTeamBFlag');
  const bmTeamBName = document.getElementById('bmTeamBName');
  const btnBmBackTeamA = document.getElementById('btnBmBackTeamA');
  const btnBmLayTeamA = document.getElementById('btnBmLayTeamA');
  const btnBmBackTeamB = document.getElementById('btnBmBackTeamB');
  const btnBmLayTeamB = document.getElementById('btnBmLayTeamB');

  // Fancy Markets List
  const fancyMarketsList = document.getElementById('fancyMarketsList');

  // Bet Slip Elements
  const betSlipDrawer = document.getElementById('betSlipDrawer');
  const btnBetSlipClose = document.getElementById('btnBetSlipClose');
  const slipBetTypeTag = document.getElementById('slipBetTypeTag');
  const slipSelectionName = document.getElementById('slipSelectionName');
  const slipOddsVal = document.getElementById('slipOddsVal');
  const slipStakeInput = document.getElementById('slipStakeInput');
  const btnClearStake = document.getElementById('btnClearStake');
  const slipCalcLabel = document.getElementById('slipCalcLabel');
  const slipCalcVal = document.getElementById('slipCalcVal');
  const btnConfirmBet = document.getElementById('btnConfirmBet');

  // History & Cashout
  const historyTableBody = document.getElementById('historyTableBody');
  const btnExecuteCashout = document.getElementById('btnExecuteCashout');
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');

  // My Bets Modal Elements
  const myBetsModal = document.getElementById('myBetsModal');
  const btnCloseMyBetsModal = document.getElementById('btnCloseMyBetsModal');
  const tabOpenBets = document.getElementById('tabOpenBets');
  const tabSettledBets = document.getElementById('tabSettledBets');
  const myBetsListContainer = document.getElementById('myBetsListContainer');
  const modalActiveCount = document.getElementById('modalActiveCount');

  // Sounds
  const sndFour = document.getElementById('sndFour');
  const sndSix = document.getElementById('sndSix');
  const sndWicket = document.getElementById('sndWicket');

  function playSound(audioEl) {
    if (!audioEl) return;
    try {
      audioEl.currentTime = 0;
      audioEl.play().catch(function () {});
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // USER BALANCE & PROFILE INIT
  // -------------------------------------------------------------
  function fetchUserBalance() {
    fetch('/api/user/profile')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success && data.user) {
          userBalance = parseFloat(data.user.balance) || 0;
          updateBalanceUI();
        } else {
          fallbackGuestBalance();
        }
      })
      .catch(function () {
        fallbackGuestBalance();
      });
  }

  function fallbackGuestBalance() {
    var stored = localStorage.getItem('diuwin_user_balance');
    if (stored) {
      userBalance = parseFloat(stored) || 1000.0;
    } else {
      userBalance = 1000.0;
    }
    updateBalanceUI();
  }

  function updateBalanceUI() {
    if (headerUserBalance) {
      headerUserBalance.textContent = '₹' + userBalance.toFixed(2);
    }
    localStorage.setItem('diuwin_user_balance', userBalance.toFixed(2));
  }

  // -------------------------------------------------------------
  // LIVE CRICKET STATE POLLING
  // -------------------------------------------------------------
  function pollCricketState() {
    fetch('/api/cricket/state')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.success) {
          renderCricketState(data);
        }
      })
      .catch(function (err) {
        console.warn('[Cricket Poller] Error fetching state:', err.message);
      });
  }

  function renderCricketState(data) {
    var period = data.period || 'CR1';
    var m = data.match;
    if (!m) return;

    currentMatchData = m;

    if (cricketPeriodBadge) {
      cricketPeriodBadge.textContent = 'ROUND ' + period;
    }

    if (activeBetsCountBadge) {
      activeBetsCountBadge.textContent = data.activeBetsCount || 0;
      modalActiveCount.textContent = data.activeBetsCount || 0;
    }

    // Match Hero Card
    matchTournament.textContent = m.tournament || "ICC Men's T20 Championship";
    teamAFlag.textContent = m.teamA.flag || '🇮🇳';
    teamAName.textContent = m.teamA.name;
    teamBFlag.textContent = m.teamB.flag || '🇦🇺';
    teamBName.textContent = m.teamB.name;

    oddsTeamAFlag.textContent = m.teamA.flag || '🇮🇳';
    oddsTeamAName.textContent = m.teamA.name;
    oddsTeamBFlag.textContent = m.teamB.flag || '🇦🇺';
    oddsTeamBName.textContent = m.teamB.name;

    bmTeamAFlag.textContent = m.teamA.flag || '🇮🇳';
    bmTeamAName.textContent = m.teamA.name;
    bmTeamBFlag.textContent = m.teamB.flag || '🇦🇺';
    bmTeamBName.textContent = m.teamB.name;

    // Scoreboard
    scoreTeamCode.textContent = m.teamA.code;
    scoreRunsWickets.textContent = m.runs + '/' + m.wickets;
    scoreOvers.textContent = m.overs;
    valCRR.textContent = m.currRunRate || '9.00';
    valRRR.textContent = m.reqRunRate || '9.50';
    valTarget.textContent = m.target;

    if (m.status === 'COMPLETED') {
      var winTeam = m.winner === 'teamA' ? m.teamA.name : m.teamB.name;
      equationText.innerHTML = '🏆 <strong>' + winTeam + ' WON THE MATCH!</strong> Starting next match shortly...';
    } else {
      equationText.textContent = m.teamA.name + ' need ' + m.runsNeeded + ' runs in ' + m.ballsRemaining + ' balls to win';
    }

    // Radar Pitch HUD & Ball Animation
    strikerName.textContent = m.batsmen[0].name.split(' ').pop();
    strikerScore.textContent = m.batsmen[0].runs + ' (' + m.batsmen[0].balls + ')';
    strikerBoundaries.textContent = '4s: ' + (m.batsmen[0].fours || 0) + ' | 6s: ' + (m.batsmen[0].sixes || 0);

    nonStrikerName.textContent = m.batsmen[1].name.split(' ').pop();
    nonStrikerScore.textContent = m.batsmen[1].runs + ' (' + m.batsmen[1].balls + ')';
    nonStrikerBoundaries.textContent = '4s: ' + (m.batsmen[1].fours || 0) + ' | 6s: ' + (m.batsmen[1].sixes || 0);

    bowlerName.textContent = m.bowler.name;
    bowlerFigs.textContent = m.bowler.overs + '-' + (m.bowler.maidens || 0) + '-' + m.bowler.runs + '-' + m.bowler.wickets;

    // Check if new ball event arrived
    var currentBall = m.currentBall;
    if (currentBall && currentBall.text !== lastBallText) {
      lastBallText = currentBall.text;
      triggerBallAnimation(currentBall);
    }

    // Recent Over Balls Row
    renderRecentBalls(m.recentBalls);

    // Commentary Ticker
    if (m.commentary && m.commentary.length > 0) {
      liveCommentaryText.textContent = m.commentary[0].over + ' ov: ' + m.commentary[0].text;
    }

    // Match Odds (Back & Lay)
    var mo = m.markets.matchOdds;
    if (mo) {
      valBackTeamA.textContent = mo.teamA.back;
      sizeBackTeamA.textContent = mo.teamA.backSize;
      valLayTeamA.textContent = mo.teamA.lay;
      sizeLayTeamA.textContent = mo.teamA.laySize;

      valBackTeamB.textContent = mo.teamB.back;
      sizeBackTeamB.textContent = mo.teamB.backSize;
      valLayTeamB.textContent = mo.teamB.lay;
      sizeLayTeamB.textContent = mo.teamB.laySize;

      // Update data attributes on buttons
      btnBackTeamA.setAttribute('data-odds', mo.teamA.back);
      btnLayTeamA.setAttribute('data-odds', mo.teamA.lay);
      btnBackTeamB.setAttribute('data-odds', mo.teamB.back);
      btnLayTeamB.setAttribute('data-odds', mo.teamB.lay);
    }

    // Bookmaker
    var bm = m.markets.bookmaker;
    if (bm) {
      valBmBackTeamA.textContent = bm.teamA.back;
      valBmLayTeamA.textContent = bm.teamA.lay;
      valBmBackTeamB.textContent = bm.teamB.back;
      valBmLayTeamB.textContent = bm.teamB.lay;

      btnBmBackTeamA.setAttribute('data-odds', (1 + bm.teamA.back / 100).toFixed(2));
      btnBmLayTeamA.setAttribute('data-odds', (1 + bm.teamA.lay / 100).toFixed(2));
      btnBmBackTeamB.setAttribute('data-odds', (1 + bm.teamB.back / 100).toFixed(2));
      btnBmLayTeamB.setAttribute('data-odds', (1 + bm.teamB.lay / 100).toFixed(2));
    }

    // Fancy Sessions List
    renderFancyMarkets(m.markets.fancy);

    // Match History
    if (data.history) {
      renderHistoryTable(data.history);
    }
  }

  function triggerBallAnimation(ball) {
    if (!radarBall || !radarEventBadge) return;

    // Reset ball position
    radarBall.style.transition = 'none';
    radarBall.style.left = '18%';
    radarBall.style.top = '50%';
    radarBall.style.transform = 'translateY(-50%) scale(0.9)';

    setTimeout(function () {
      radarBall.style.transition = 'all 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      radarBall.style.left = '78%';
      radarBall.style.top = (40 + Math.random() * 20) + '%';
      radarBall.style.transform = 'translateY(-50%) scale(1.15)';
    }, 40);

    // Update Event Badge
    radarEventBadge.className = 'radar-event-badge';
    if (ball.type === 'four') {
      radarEventBadge.classList.add('event-four');
      radarEventBadge.innerHTML = '💥 <strong>FOUR! BOUNDARY</strong>';
      playSound(sndFour);
    } else if (ball.type === 'six') {
      radarEventBadge.classList.add('event-six');
      radarEventBadge.innerHTML = '🚀 <strong>MAXIMUM SIX!</strong>';
      playSound(sndSix);
    } else if (ball.type === 'wicket') {
      radarEventBadge.classList.add('event-wicket');
      radarEventBadge.innerHTML = '🚨 <strong>WICKET FALLEN!</strong>';
      playSound(sndWicket);
    } else if (ball.type === 'dot') {
      radarEventBadge.innerHTML = '🎯 <strong>DOT BALL</strong>';
    } else {
      radarEventBadge.innerHTML = '⚡ <strong>' + ball.runs + ' RUN' + (ball.runs > 1 ? 'S' : '') + '</strong>';
    }
  }

  function renderRecentBalls(recentBalls) {
    if (!recentBallsRow || !recentBalls) return;
    recentBallsRow.innerHTML = '';
    recentBalls.forEach(function (b) {
      var span = document.createElement('span');
      span.className = 'ball-pill';
      if (b === '0') span.classList.add('pill-dot');
      else if (b === '1') span.classList.add('pill-single');
      else if (b === '2') span.classList.add('pill-two');
      else if (b === '3') span.classList.add('pill-three');
      else if (b === '4') span.classList.add('pill-four');
      else if (b === '6') span.classList.add('pill-six');
      else if (b === 'W') span.classList.add('pill-wicket');
      else span.classList.add('pill-single');
      span.textContent = b;
      recentBallsRow.appendChild(span);
    });
  }

  function renderFancyMarkets(fancyList) {
    if (!fancyMarketsList || !fancyList) return;
    fancyMarketsList.innerHTML = '';

    fancyList.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'fancy-row';

      var titleCol = document.createElement('div');
      titleCol.className = 'fancy-title-col';
      titleCol.textContent = f.title;

      var ratesCol = document.createElement('div');
      ratesCol.className = 'fancy-rates-col';

      if (f.status === 'SETTLED') {
        var settledBadge = document.createElement('span');
        settledBadge.className = 'badge-settled';
        settledBadge.textContent = 'SETTLED: ' + (f.result !== undefined ? f.result : '');
        ratesCol.appendChild(settledBadge);
      } else {
        // NO button (Pink)
        var btnNo = document.createElement('button');
        btnNo.className = 'rate-box btn-lay';
        btnNo.innerHTML = '<span class="rate-val">' + f.no + '</span><span class="rate-size">100</span>';
        btnNo.addEventListener('click', function () {
          openBetSlip('fancy', f.id, f.title + ' (NO ' + f.no + ')', 'no', 2.0);
        });

        // YES button (Blue)
        var btnYes = document.createElement('button');
        btnYes.className = 'rate-box btn-back';
        btnYes.innerHTML = '<span class="rate-val">' + f.yes + '</span><span class="rate-size">100</span>';
        btnYes.addEventListener('click', function () {
          openBetSlip('fancy', f.id, f.title + ' (YES ' + f.yes + ')', 'yes', 2.0);
        });

        ratesCol.appendChild(btnNo);
        ratesCol.appendChild(btnYes);
      }

      row.appendChild(titleCol);
      row.appendChild(ratesCol);
      fancyMarketsList.appendChild(row);
    });
  }

  function renderHistoryTable(history) {
    if (!historyTableBody) return;
    if (!history || history.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No past matches recorded yet</td></tr>';
      return;
    }

    historyTableBody.innerHTML = '';
    history.forEach(function (h) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><strong>' + (h.period || 'CR') + '</strong></td>' +
        '<td>' + (h.matchName || 'T20 Clash') + '</td>' +
        '<td><span style="color: var(--accent-green); font-weight: 700;">' + (h.winner || 'Completed') + '</span></td>' +
        '<td>' + (h.score || '-') + '</td>' +
        '<td><span style="color: var(--accent-gold); font-size: 10px;">SETTLED</span></td>';
      historyTableBody.appendChild(tr);
    });
  }

  // -------------------------------------------------------------
  // BET SLIP INTERACTIONS
  // -------------------------------------------------------------
  function openBetSlip(market, selection, selectionName, betType, odds) {
    activeBetSlip = {
      market: market,
      selection: selection,
      selectionName: selectionName,
      betType: betType,
      odds: parseFloat(odds) || 1.95,
      stake: parseInt(slipStakeInput.value, 10) || 100
    };

    slipBetTypeTag.textContent = betType.toUpperCase();
    slipBetTypeTag.className = 'betslip-tag ' + (betType === 'lay' || betType === 'no' ? 'tag-lay' : 'tag-back');
    slipSelectionName.textContent = selectionName;
    slipOddsVal.textContent = activeBetSlip.odds.toFixed(2);

    updateBetSlipCalculations();
    betSlipDrawer.classList.add('open');
  }

  function closeBetSlip() {
    betSlipDrawer.classList.remove('open');
  }

  function updateBetSlipCalculations() {
    var stake = parseFloat(slipStakeInput.value) || 0;
    activeBetSlip.stake = stake;

    if (activeBetSlip.betType === 'back') {
      slipCalcLabel.textContent = 'Profit to Win:';
      var profit = stake * (activeBetSlip.odds - 1);
      slipCalcVal.className = 'calc-value';
      slipCalcVal.textContent = '+₹' + profit.toFixed(2);
    } else if (activeBetSlip.betType === 'lay') {
      slipCalcLabel.textContent = 'Liability (Risk):';
      var liability = stake * (activeBetSlip.odds - 1);
      slipCalcVal.className = 'calc-value liability';
      slipCalcVal.textContent = '-₹' + liability.toFixed(2);
    } else {
      // Fancy Yes / No
      slipCalcLabel.textContent = 'Profit to Win:';
      slipCalcVal.className = 'calc-value';
      slipCalcVal.textContent = '+₹' + stake.toFixed(2);
    }
  }

  function placeBet() {
    var stake = parseFloat(slipStakeInput.value);
    if (isNaN(stake) || stake < 10) {
      alert('Minimum bet amount is ₹10');
      return;
    }

    var requiredBal = activeBetSlip.betType === 'lay' ? stake * (activeBetSlip.odds - 1) : stake;
    if (userBalance < requiredBal) {
      alert('Insufficient wallet balance. Required: ₹' + requiredBal.toFixed(2) + ', Available: ₹' + userBalance.toFixed(2));
      return;
    }

    btnConfirmBet.disabled = true;
    btnConfirmBet.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Placing Bet...';

    fetch('/api/cricket/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: activeBetSlip.market,
        selection: activeBetSlip.selection,
        betType: activeBetSlip.betType,
        odds: activeBetSlip.odds,
        amount: stake
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        btnConfirmBet.disabled = false;
        btnConfirmBet.innerHTML = '<i class="fa fa-check-circle"></i> PLACE BET';

        if (data && data.success) {
          if (data.newBalance !== undefined) {
            userBalance = data.newBalance;
            updateBalanceUI();
          }
          closeBetSlip();
          pollCricketState();

          // Show floating success toast
          showCricketToast('🎉 Bet Placed Successfully on ' + activeBetSlip.selectionName);
        } else {
          alert(data.message || 'Failed to place bet. Please try again.');
        }
      })
      .catch(function (err) {
        btnConfirmBet.disabled = false;
        btnConfirmBet.innerHTML = '<i class="fa fa-check-circle"></i> PLACE BET';
        alert('Error placing bet: ' + err.message);
      });
  }

  // -------------------------------------------------------------
  // CASHOUT / BOOK LOCK
  // -------------------------------------------------------------
  function executeCashout() {
    btnExecuteCashout.disabled = true;
    btnExecuteCashout.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Locking...';

    fetch('/api/cricket/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        btnExecuteCashout.disabled = false;
        btnExecuteCashout.innerHTML = '<i class="fa fa-lock"></i> CASH OUT';

        if (data && data.success) {
          if (data.newBalance !== undefined) {
            userBalance = data.newBalance;
            updateBalanceUI();
          }
          pollCricketState();

          // Celebrate with DiuWin Outcome Modal
          if (window.DiuWinOutcomeModal) {
            window.DiuWinOutcomeModal.showWin({
              title: 'CASHOUT SUCCESSFUL!',
              game: 'Cricket Exchange',
              winAmount: data.cashoutValue,
              multiplier: 'HEDGE LOCK',
              details: data.profit > 0 ? 'Locked Profit: +₹' + data.profit : 'Positions Closed'
            });
          } else {
            alert('🎉 ' + data.message);
          }
        } else {
          alert(data.message || 'Cashout currently unavailable.');
        }
      })
      .catch(function (err) {
        btnExecuteCashout.disabled = false;
        btnExecuteCashout.innerHTML = '<i class="fa fa-lock"></i> CASH OUT';
        alert('Cashout error: ' + err.message);
      });
  }

  // -------------------------------------------------------------
  // MY BETS MODAL
  // -------------------------------------------------------------
  function openMyBetsModal() {
    myBetsModal.classList.add('open');
    loadMyBetsList('open');
  }

  function closeMyBetsModal() {
    myBetsModal.classList.remove('open');
  }

  function loadMyBetsList(tabType) {
    myBetsListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;"><i class="fa fa-spinner fa-spin"></i> Loading bets...</div>';

    fetch('/api/cricket/my-bets')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          myBetsListContainer.innerHTML = '<div class="text-center text-muted">Unable to load bets</div>';
          return;
        }

        var bets = tabType === 'open' ? data.activeBets : data.settledBets;
        if (!bets || bets.length === 0) {
          myBetsListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">No ' + tabType + ' bets found</div>';
          return;
        }

        myBetsListContainer.innerHTML = '';
        bets.forEach(function (b) {
          var card = document.createElement('div');
          card.className = 'my-bet-card';

          var selTitle = b.choice || (b.market + ' - ' + b.selection);
          var metaText = 'Round: ' + (b.period || 'CR1') + ' • Rate: ' + (b.odds || b.multiplier || 1.95);

          var amountClass = 'pending';
          var amountPrefix = '₹';
          if (b.settled) {
            amountClass = b.isWin ? 'win' : 'loss';
            amountPrefix = b.isWin ? '+₹' : '-₹';
          }

          var displayAmt = b.winAmount > 0 ? b.winAmount : b.amount;

          card.innerHTML = '<div class="my-bet-info">' +
            '<div class="my-bet-title">' + selTitle + '</div>' +
            '<div class="my-bet-meta">' + metaText + '</div>' +
            '</div>' +
            '<div class="my-bet-outcome">' +
            '<div class="my-bet-amount ' + amountClass + '">' + amountPrefix + displayAmt.toFixed(2) + '</div>' +
            '<div style="font-size: 10px; color: var(--text-muted);">' + (b.settled ? (b.isWin ? 'WON' : 'LOST') : 'ACTIVE') + '</div>' +
            '</div>';

          myBetsListContainer.appendChild(card);
        });
      })
      .catch(function () {
        myBetsListContainer.innerHTML = '<div class="text-center text-muted">Failed to load bets</div>';
      });
  }

  // Toast Notification
  function showCricketToast(msg) {
    var toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.top = '70px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'linear-gradient(135deg, #06b6d4, #0284c7)';
    toast.style.color = '#fff';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '20px';
    toast.style.fontSize = '12px';
    toast.style.fontWeight = '800';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    toast.style.zIndex = '999';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 2500);
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS BINDING
  // -------------------------------------------------------------
  function bindEvents() {
    if (btnRefreshBalance) {
      btnRefreshBalance.addEventListener('click', function () {
        fetchUserBalance();
      });
    }

    if (btnHeaderDeposit) {
      btnHeaderDeposit.addEventListener('click', function () {
        if (window.UpiRechargeModal) {
          window.UpiRechargeModal.open();
        } else {
          location.href = 'index.html#wallet';
        }
      });
    }

    if (btnOpenMyBets) {
      btnOpenMyBets.addEventListener('click', openMyBetsModal);
    }
    if (btnCloseMyBetsModal) {
      btnCloseMyBetsModal.addEventListener('click', closeMyBetsModal);
    }

    if (tabOpenBets) {
      tabOpenBets.addEventListener('click', function () {
        tabOpenBets.classList.add('active');
        tabSettledBets.classList.remove('active');
        loadMyBetsList('open');
      });
    }
    if (tabSettledBets) {
      tabSettledBets.addEventListener('click', function () {
        tabSettledBets.classList.add('active');
        tabOpenBets.classList.remove('active');
        loadMyBetsList('settled');
      });
    }

    // Market Navigation Tabs
    var tabBtns = document.querySelectorAll('.m-tab');
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var targetTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.market-tab-content').forEach(function (c) {
          c.classList.remove('active');
        });

        if (targetTab === 'matchOdds') {
          document.getElementById('tabMatchOdds').classList.add('active');
        } else if (targetTab === 'bookmaker') {
          document.getElementById('tabBookmaker').classList.add('active');
        } else if (targetTab === 'fancy') {
          document.getElementById('tabFancy').classList.add('active');
        }
      });
    });

    // Match Odds Buttons
    btnBackTeamA.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamA.name : 'India';
      var odds = btnBackTeamA.getAttribute('data-odds') || '1.68';
      openBetSlip('matchOdds', 'teamA', name + ' (BACK)', 'back', odds);
    });
    btnLayTeamA.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamA.name : 'India';
      var odds = btnLayTeamA.getAttribute('data-odds') || '1.70';
      openBetSlip('matchOdds', 'teamA', name + ' (LAY)', 'lay', odds);
    });
    btnBackTeamB.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamB.name : 'Australia';
      var odds = btnBackTeamB.getAttribute('data-odds') || '2.44';
      openBetSlip('matchOdds', 'teamB', name + ' (BACK)', 'back', odds);
    });
    btnLayTeamB.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamB.name : 'Australia';
      var odds = btnLayTeamB.getAttribute('data-odds') || '2.48';
      openBetSlip('matchOdds', 'teamB', name + ' (LAY)', 'lay', odds);
    });

    // Bookmaker Buttons
    btnBmBackTeamA.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamA.name : 'India';
      var odds = btnBmBackTeamA.getAttribute('data-odds') || '1.68';
      openBetSlip('bookmaker', 'teamA', name + ' Bookmaker (BACK)', 'back', odds);
    });
    btnBmLayTeamA.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamA.name : 'India';
      var odds = btnBmLayTeamA.getAttribute('data-odds') || '1.70';
      openBetSlip('bookmaker', 'teamA', name + ' Bookmaker (LAY)', 'lay', odds);
    });
    btnBmBackTeamB.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamB.name : 'Australia';
      var odds = btnBmBackTeamB.getAttribute('data-odds') || '2.44';
      openBetSlip('bookmaker', 'teamB', name + ' Bookmaker (BACK)', 'back', odds);
    });
    btnBmLayTeamB.addEventListener('click', function () {
      var name = currentMatchData ? currentMatchData.teamB.name : 'Australia';
      var odds = btnBmLayTeamB.getAttribute('data-odds') || '2.48';
      openBetSlip('bookmaker', 'teamB', name + ' Bookmaker (LAY)', 'lay', odds);
    });

    // Bet Slip Controls
    btnBetSlipClose.addEventListener('click', closeBetSlip);
    slipStakeInput.addEventListener('input', updateBetSlipCalculations);
    btnClearStake.addEventListener('click', function () {
      slipStakeInput.value = '100';
      updateBetSlipCalculations();
    });

    // Quick Chips
    document.querySelectorAll('.chip-btn:not(.chip-max)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var addVal = parseInt(btn.getAttribute('data-stake'), 10) || 100;
        var curr = parseInt(slipStakeInput.value, 10) || 0;
        slipStakeInput.value = curr + addVal;
        updateBetSlipCalculations();
      });
    });

    var btnChipMax = document.getElementById('btnChipMax');
    if (btnChipMax) {
      btnChipMax.addEventListener('click', function () {
        var maxStake = activeBetSlip.betType === 'lay' ? Math.floor(userBalance / (activeBetSlip.odds - 1)) : Math.floor(userBalance);
        slipStakeInput.value = Math.max(10, maxStake);
        updateBetSlipCalculations();
      });
    }

    btnConfirmBet.addEventListener('click', placeBet);

    // Cashout Button
    if (btnExecuteCashout) {
      btnExecuteCashout.addEventListener('click', executeCashout);
    }

    if (btnRefreshHistory) {
      btnRefreshHistory.addEventListener('click', function () {
        pollCricketState();
      });
    }
  }

  // -------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    fetchUserBalance();
    bindEvents();
    pollCricketState();
    pollIntervalId = setInterval(pollCricketState, 1500);
  });

})();
