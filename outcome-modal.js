/**
 * DiuWin Official Game Outcome Celebration & Notice System
 * Provides animated Congratulation / Loss modals with sound effects & particle physics
 */

(function (window) {
  let audioCtx = null;
  let particleInterval = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playOutcomeSound(isWin) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (isWin) {
        // Celebratory bright major fanfare chords: C5 -> E5 -> G5 -> C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          gain.gain.setValueAtTime(0.001, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.08 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.36);
        });
      } else {
        // Descending sad minor tones: E4 -> C4 -> A3
        const notes = [329.63, 261.63, 220.00];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.14);

          gain.gain.setValueAtTime(0.001, now + idx * 0.14);
          gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.14 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.14);
          osc.stop(now + idx * 0.14 + 0.42);
        });
      }
    } catch (e) {
      console.warn('Audio playback not supported:', e);
    }
  }

  function spawnParticles(container, isWin) {
    if (!container) return;
    container.innerHTML = '';
    clearInterval(particleInterval);

    const symbols = isWin
      ? ['🪙', '✨', '⭐', '🎉', '💎', '🏆', '🟡', '🟢', '👑']
      : ['💔', '💧', '🌧️', '⚡'];

    const count = isWin ? 40 : 16;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle-item';
      p.textContent = symbols[Math.floor(Math.random() * symbols.length)];

      const left = Math.random() * 96 + 2; // 2% - 98%
      const duration = (isWin ? (2.2 + Math.random() * 2.5) : (2.5 + Math.random() * 2.0)).toFixed(2);
      const delay = (Math.random() * 1.5).toFixed(2);
      const size = Math.floor(16 + Math.random() * 20);

      p.style.left = `${left}%`;
      p.style.fontSize = `${size}px`;
      p.style.animationDuration = `${duration}s`;
      p.style.animationDelay = `${delay}s`;

      container.appendChild(p);
    }
  }

  const DiuWinOutcomeModal = {
    /**
     * Shows the outcome celebration / notice modal
     * @param {Object} options
     * @param {boolean} options.isWin
     * @param {number} options.winAmount
     * @param {number} options.lossAmount
     * @param {string|number} options.period
     * @param {string} [options.gameName]
     * @param {string} [options.detailsHtml]
     * @param {string} [options.betSummary]
     * @param {function} [options.onClose]
     */
    show(options) {
      const modal = document.getElementById('gameOutcomeModal');
      if (!modal) return;

      const isWin = !!options.isWin;
      const winAmt = Number(options.winAmount || 0);
      const lossAmt = Number(options.lossAmount || 0);

      const particles = document.getElementById('outcomeParticles');
      const badgeIcon = document.getElementById('outcomeBadgeIcon');
      const title = document.getElementById('outcomeTitle');
      const subtitle = document.getElementById('outcomeSubtitle');
      const amountBox = document.getElementById('outcomeAmountBox');
      const amountLabel = document.getElementById('outcomeAmountLabel');
      const amountValue = document.getElementById('outcomeAmountValue');
      const detailsPlate = document.getElementById('outcomeDetailsPlate');
      const btnAction = document.getElementById('btnCloseOutcomeModal');
      const btnX = document.getElementById('btnCloseOutcomeX');

      // Set Mode classes
      modal.classList.remove('mode-win', 'mode-loss');
      modal.classList.add(isWin ? 'mode-win' : 'mode-loss');

      // Update contents
      if (isWin) {
        if (badgeIcon) badgeIcon.textContent = '🏆';
        if (title) title.textContent = 'CONGRATULATIONS!';
        if (subtitle) subtitle.textContent = 'Awesome! You won this round!';
        if (amountLabel) amountLabel.textContent = 'Total Prize Won';
        if (amountValue) amountValue.textContent = `+₹${winAmt.toFixed(2)}`;
        if (btnAction) btnAction.textContent = 'Collect & Play';
      } else {
        if (badgeIcon) badgeIcon.textContent = '💔';
        if (title) title.textContent = 'GAME OVER';
        if (subtitle) subtitle.textContent = 'Better luck in the next round!';
        if (amountLabel) amountLabel.textContent = 'Total Bet Lost';
        if (amountValue) amountValue.textContent = `-₹${lossAmt.toFixed(2)}`;
        if (btnAction) btnAction.textContent = 'Try Again';
      }

      // Details plate
      if (detailsPlate) {
        let plateContent = `
          <div class="plate-header-row">
            <span>Period: <strong class="period-tag">${options.period || '-'}</strong></span>
            <span>${options.gameName || 'Round Result'}</span>
          </div>
        `;

        if (options.detailsHtml) {
          plateContent += `<div class="plate-result-content">${options.detailsHtml}</div>`;
        }

        if (options.betSummary) {
          plateContent += `<div class="plate-bet-summary">${options.betSummary}</div>`;
        }

        detailsPlate.innerHTML = plateContent;
      }

      // Spawn animations & sound
      spawnParticles(particles, isWin);
      playOutcomeSound(isWin);

      // Show modal
      modal.classList.add('show');

      // Wire close triggers
      const handleClose = () => {
        DiuWinOutcomeModal.close();
        if (typeof options.onClose === 'function') options.onClose();
      };

      if (btnAction) btnAction.onclick = handleClose;
      if (btnX) btnX.onclick = handleClose;

      // Close on backdrop click (outside card)
      modal.onclick = (e) => {
        if (e.target === modal) handleClose();
      };
    },

    close() {
      const modal = document.getElementById('gameOutcomeModal');
      if (modal) {
        modal.classList.remove('show');
      }
      const particles = document.getElementById('outcomeParticles');
      if (particles) particles.innerHTML = '';
      clearInterval(particleInterval);
    }
  };

  window.DiuWinOutcomeModal = DiuWinOutcomeModal;
})(window);
