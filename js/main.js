(function () {
  'use strict';

  var GIOCHI = [
    { id: 'neonStrike',title: 'Neon Strike', desc: 'Retro Arcade SHMUP' },
    { id: 'neonVoid',  title: 'Neon Void',   desc: "Shoot 'em up spaziale" },
    { id: 'neonVoidV2',  title: 'Neon Void V2',   desc: "Shoot 'em up spaziale V2" }
  ];

  var grid = document.getElementById('game-grid');
  var searchInput = document.getElementById('search-input');

  function creaStelle() {
    var c = document.getElementById('stars');
    for (var i = 0; i < 180; i++) {
      var s = document.createElement('div');
      s.className = 'star';
      var sz = Math.random() * 3 + 1;
      s.style.cssText =
        'left:' + (Math.random() * 100) + '%;' +
        'top:' + (Math.random() * 100) + '%;' +
        'width:' + sz + 'px;height:' + sz + 'px;' +
        '--dur:' + ((Math.random() * 3 + 2).toFixed(1)) + 's;' +
        'animation-delay:' + ((Math.random() * 4).toFixed(1)) + 's';
      c.appendChild(s);
    }
  }

  function stampaGriglia(termine) {
    grid.innerHTML = '';
    var t = (termine || '').toLowerCase().trim();
    var filt = GIOCHI.filter(function (g) {
      return g.title.toLowerCase().indexOf(t) !== -1 ||
             g.id.toLowerCase().indexOf(t) !== -1;
    });
    if (filt.length === 0) {
      grid.innerHTML = '<div class="no-results">' +
        '<i class="fas fa-gamepad"></i>' +
        '<p>' + (t ? 'Nessun gioco trovato per "' + termine + '"' : 'Nessun gioco disponibile') + '</p>' +
        '</div>';
      return;
    }
    filt.forEach(function (g) {
      var card = document.createElement('a');
      card.className = 'game-card';
      card.href = 'giochi/' + g.id + '/' + g.id + '.html';

      var thumb = document.createElement('div');
      thumb.className = 'game-thumb';

      var logo = new Image();
      logo.alt = g.title;
      logo.onload = function () {
        thumb.innerHTML = '';
        thumb.appendChild(logo);
      };
      logo.onerror = function () {
        thumb.innerHTML = '<div class="placeholder"><i class="fas fa-gamepad"></i></div>';
      };
      logo.src = 'giochi/' + g.id + '/logo.jpg';

      var info = document.createElement('div');
      info.className = 'game-info';
      info.innerHTML = '<h3>' + g.title + '</h3>' +
        (g.desc ? '<p>' + g.desc + '</p>' : '');

      var overlay = document.createElement('div');
      overlay.className = 'play-overlay';
      overlay.innerHTML = '<i class="fas fa-play-circle"></i>';

      card.append(thumb, info, overlay);
      grid.appendChild(card);
    });
  }

  searchInput.addEventListener('input', function () {
    stampaGriglia(this.value);
  });

  creaStelle();
  stampaGriglia('');
})();
