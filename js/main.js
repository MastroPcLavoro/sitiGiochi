(function () {
  'use strict';

  const GameHub = {
    games: [],
    currentGame: null,
    searchTerm: '',
    grid: document.getElementById('game-grid'),
    searchInput: document.getElementById('search-input'),
    homePage: document.getElementById('home-page'),
    gamePage: document.getElementById('game-page'),
    gameIframe: document.getElementById('game-iframe'),
    gameTitleDisplay: document.getElementById('game-title-display'),
    backBtn: document.getElementById('back-btn'),
    gameLoader: document.getElementById('game-loader'),

    async init() {
      this.createStars();
      await this.loadGames();
      this.renderGrid();
      this.setupSearch();
      this.setupNavigation();
    },

    createStars() {
      const container = document.getElementById('stars');
      for (let i = 0; i < 180; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 3 + 1;
        star.style.cssText = `
          left: ${Math.random() * 100}%;
          top: ${Math.random() * 100}%;
          width: ${size}px;
          height: ${size}px;
          --dur: ${(Math.random() * 3 + 2).toFixed(1)}s;
          animation-delay: ${(Math.random() * 4).toFixed(1)}s;
        `;
        container.appendChild(star);
      }
    },

    async loadGames() {
      if (typeof GIOCHI !== 'undefined' && GIOCHI.length) {
        this.games = GIOCHI;
        return;
      }
      try {
        var res = await fetch('giochi/manifest.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this.games = await res.json();
      } catch (e) {
        console.warn('fetch fallito, nessun gioco trovato:', e);
        this.games = [];
      }
    },

    renderGrid() {
      this.grid.innerHTML = '';
      const term = this.searchTerm.toLowerCase().trim();

      const filtered = this.games.filter(g =>
        g.title.toLowerCase().includes(term) ||
        g.id.toLowerCase().includes(term)
      );

      if (filtered.length === 0) {
        this.grid.innerHTML = `
          <div class="no-results">
            <i class="fas fa-gamepad"></i>
            <p>${term ? 'Nessun gioco trovato per "' + this.searchTerm + '"' : 'Nessun gioco disponibile'}</p>
          </div>
        `;
        return;
      }

      filtered.forEach(game => this.createCard(game));
    },

    createCard(game) {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.dataset.game = game.id;

      const thumb = document.createElement('div');
      thumb.className = 'game-thumb';

      const img = new Image();
      img.alt = game.title;
      img.loading = 'lazy';

      img.onload = () => {
        thumb.innerHTML = '';
        thumb.appendChild(img);
        const badge = document.createElement('span');
        badge.className = 'thumb-badge';
        badge.textContent = 'LOGO';
        thumb.appendChild(badge);
      };

      img.onerror = () => {
        this.createPreview(game, thumb);
      };

      img.src = `giochi/${game.id}/logo.jpg`;

      const info = document.createElement('div');
      info.className = 'game-info';
      info.innerHTML = `<h3>${game.title}</h3>${game.desc ? `<p>${game.desc}</p>` : ''}`;

      const overlay = document.createElement('div');
      overlay.className = 'play-overlay';
      overlay.innerHTML = '<i class="fas fa-play-circle"></i>';

      card.append(thumb, info, overlay);
      card.addEventListener('click', () => this.playGame(game));
      this.grid.appendChild(card);
    },

    createPreview(game, container) {
      if (window.location.protocol === 'file:') {
        this.showPlaceholder(container);
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = `giochi/${game.id}/${game.id}.html`;
      iframe.loading = 'lazy';
      iframe.title = `Anteprima ${game.title}`;

      let timedOut = false;
      const fallbackTimer = setTimeout(() => {
        timedOut = true;
        this.showPlaceholder(container);
      }, 2000);

      iframe.addEventListener('load', () => {
        if (timedOut) return;
        clearTimeout(fallbackTimer);
      });

      container.appendChild(iframe);
    },

    showPlaceholder(container) {
      container.innerHTML = '<div class="placeholder"><i class="fas fa-gamepad"></i></div>';
    },

    playGame(game) {
      this.currentGame = game;
      this.gameTitleDisplay.textContent = game.title;
      this.homePage.classList.remove('active');
      this.gamePage.classList.add('active');
      this.gameLoader.style.display = 'flex';
      this.gameIframe.style.display = 'none';
      if (window.location.protocol === 'file:') {
        this.gameLoader.innerHTML = '<i class="fas fa-info-circle" style="font-size:3rem;color:var(--neon-yellow)"></i><p style="max-width:400px;text-align:center;line-height:1.6">Per giocare devi usare un server HTTP locale.<br>Apri un terminale in questa cartella e lancia:<br><code style="display:block;margin-top:8px;padding:8px 16px;background:rgba(0,0,0,.5);border-radius:6px;color:var(--neon-cyan);font-size:0.9rem">npx serve .</code></p>';
        return;
      }
      this.gameIframe.src = `giochi/${game.id}/${game.id}.html`;
    },

    goHome() {
      this.gamePage.classList.remove('active');
      this.homePage.classList.add('active');
      this.gameIframe.src = '';
      this.gameIframe.style.display = 'none';
      this.gameLoader.style.display = 'flex';
      this.gameLoader.innerHTML = '<div class="loader-ring"></div><p>Caricamento in corso...</p>';
      this.currentGame = null;
    },

    setupSearch() {
      let debounceTimer;
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.searchTerm = e.target.value;
          this.renderGrid();
        }, 200);
      });
    },

    setupNavigation() {
      this.backBtn.addEventListener('click', () => this.goHome());

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.currentGame) {
          e.preventDefault();
          this.goHome();
        }
      });

      this.gameIframe.addEventListener('load', () => {
        this.gameLoader.style.display = 'none';
        this.gameIframe.style.display = 'block';
      });

      this.gameIframe.addEventListener('error', () => {
        this.gameLoader.innerHTML = `
          <i class="fas fa-exclamation-triangle" style="font-size:3rem;color:var(--neon-pink)"></i>
          <p>Errore nel caricamento del gioco</p>
        `;
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => GameHub.init());
})();
