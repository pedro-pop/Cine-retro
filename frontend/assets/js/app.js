// =====================================================================
// CINE RETRO — app.js
// Lógica do frontend: autenticação, catálogo, planos, sala/poltrona e
// painel administrativo. Consome a API REST do backend Express.
// =====================================================================

const API_BASE = window.location.origin + '/api';

// ---------------------------------------------------------------------
// Estado global simples
// ---------------------------------------------------------------------

const state = {
  token: localStorage.getItem('cr_token') || null,
  user: JSON.parse(localStorage.getItem('cr_user') || 'null'),
  mediaList: [],
  currentGenre: 'Todos',
  currentSearch: '',
  activeMedia: null,
  activeRoom: null,
  selectedSeat: null,
  editingMediaId: null
};

// ---------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------

function qs(sel, ctx = document) {
  return ctx.querySelector(sel);
}

function qsa(sel, ctx = document) {
  return Array.from(ctx.querySelectorAll(sel));
}

function showToast(message) {
  const toast = qs('#toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function openModal(id) {
  const modal = qs('#' + id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = qs('#' + id);
  if (modal) modal.classList.remove('open');
}

function authHeaders() {
  return state.token
    ? { 'Authorization': 'Bearer ' + state.token }
    : {};
}

function handleUnauthorized() {
  clearSession();

  qsa('.modal-overlay.open').forEach(m => {
    m.classList.remove('open');
  });

  openModal('authModal');
  showToast('Sua sessão expirou. Faça login novamente.');
}

async function apiRequest(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: {
      ...(options.isForm
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...(options.headers || {})
    },
    body: options.body
  };

  const res = await fetch(API_BASE + path, opts);

  let data = {};

  try {
    data = await res.json();
  } catch (e) {
    // Resposta sem corpo JSON
  }

  if (res.status === 401 && state.token) {
    handleUnauthorized();
  }

  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return data;
}

// Placeholder local
const FALLBACK_POSTER = 'assets/images/poster-fallback.svg';

function posterUrl(media) {
  if (!media.poster_path) return FALLBACK_POSTER;

  if (
    media.poster_path.startsWith('http') ||
    media.poster_path.startsWith('assets/')
  ) {
    return media.poster_path;
  }

  return media.poster_path;
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================

function persistSession(token, user) {
  state.token = token;
  state.user = user;

  localStorage.setItem('cr_token', token);
  localStorage.setItem('cr_user', JSON.stringify(user));

  updateAuthUI();
}

function clearSession() {
  state.token = null;
  state.user = null;

  localStorage.removeItem('cr_token');
  localStorage.removeItem('cr_user');

  updateAuthUI();
}

function updateAuthUI() {
  const btnOpenAuth = qs('#btnOpenAuth');
  const userChip = qs('#userChip');
  const userChipName = qs('#userChipName');
  const btnLogout = qs('#btnLogout');

  if (state.user) {
    btnOpenAuth.style.display = 'none';
    userChip.style.display = 'flex';
    btnLogout.style.display = 'inline-flex';

    const roleLabel = {
      comum: '',
      admin: ' (Admin)',
      superadmin: ' (Super Admin)'
    }[state.user.role] || '';

    userChipName.textContent =
      state.user.name.split(' ')[0] + roleLabel;
  } else {
    btnOpenAuth.style.display = 'inline-flex';
    userChip.style.display = 'none';
    btnLogout.style.display = 'none';
  }
}

qs('#btnOpenAuth').addEventListener('click', () => {
  openModal('authModal');
});

qs('#userChip').addEventListener('click', () => {
  if (!state.user) return;

  if (
    state.user.role === 'admin' ||
    state.user.role === 'superadmin'
  ) {
    openAdminPanel();
  }
});

qs('#btnLogout').addEventListener('click', () => {
  if (confirm('Deseja sair da sua conta?')) {
    clearSession();
    showToast('Você saiu da sua conta.');
  }
});

// ---------------------------------------------------------------------
// Tabs de login/cadastro
// ---------------------------------------------------------------------

qsa('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    qsa('.auth-tab').forEach(t => t.classList.remove('active'));
    qsa('.auth-panel').forEach(p => p.classList.remove('active'));

    tab.classList.add('active');

    qs(
      `.auth-panel[data-panel="${tab.dataset.tab}"]`
    ).classList.add('active');

    qs('#authMessage').classList.remove('show');
  });
});

function showAuthMessage(msg, type) {
  const el = qs('#authMessage');

  el.textContent = msg;
  el.className = `form-message show ${type}`;
}

qs('#loginPanel').addEventListener('submit', async e => {
  e.preventDefault();

  try {
    const email = qs('#loginEmail').value.trim();
    const password = qs('#loginPassword').value;

    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    persistSession(data.token, data.user);

    showAuthMessage(data.message, 'success');

    setTimeout(() => {
      closeModal('authModal');
      showToast(
        `Bem-vindo(a) de volta, ${data.user.name.split(' ')[0]}!`
      );
    }, 600);

  } catch (err) {
    showAuthMessage(err.message, 'error');
  }
});

qs('#registerPanel').addEventListener('submit', async e => {
  e.preventDefault();

  try {
    const name = qs('#registerName').value.trim();
    const email = qs('#registerEmail').value.trim();
    const password = qs('#registerPassword').value;

    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    persistSession(data.token, data.user);

    showAuthMessage(data.message, 'success');

    setTimeout(() => {
      closeModal('authModal');

      showToast(
        `Conta criada! Bem-vindo(a), ${data.user.name.split(' ')[0]}.`
      );
    }, 600);

  } catch (err) {
    showAuthMessage(err.message, 'error');
  }
});

// =====================================================================
// CATÁLOGO E DESTAQUES
// =====================================================================

function renderMediaCard(media) {
  const badge = media.is_top10
    ? `<span class="badge">Top 10</span>`
    : (
        media.is_featured
          ? `<span class="badge">Destaque</span>`
          : ''
      );

  return `
    <div class="media-card" data-media-id="${media.id}">
      <div class="poster-wrap">
        <img
          src="${posterUrl(media)}"
          alt="Pôster de ${media.title}"
          loading="lazy"
          onerror="this.src='${FALLBACK_POSTER}'"
        >

        ${badge}

        <div class="overlay-actions">
          <button
            class="btn btn-primary btn-small btn-watch"
            data-media-id="${media.id}"
          >
            ▶ Assistir
          </button>
        </div>
      </div>

      <div class="info">
        <h3>${media.title}</h3>
        <div class="meta">
          ${media.genre} • ${media.release_year || ''}
        </div>
      </div>
    </div>
  `;
}

function applyFilters() {
  let list = state.mediaList;

  if (state.currentGenre !== 'Todos') {
    list = list.filter(
      m =>
        normalize(m.genre) ===
        normalize(state.currentGenre)
    );
  }

  if (state.currentSearch) {
    const term = normalize(state.currentSearch);

    list = list.filter(
      m =>
        normalize(m.title).includes(term) ||
        normalize(m.director || '').includes(term) ||
        normalize(m.cast_list || '').includes(term)
    );
  }

  return list;
}

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function renderCatalog() {
  const grid = qs('#catalogGrid');
  const list = applyFilters();

  grid.innerHTML = list.length
    ? list.map(renderMediaCard).join('')
    : `
      <p class="empty-state">
        Nenhum título encontrado com esses filtros.
        Tente outra busca ou gênero.
      </p>
    `;
}

function renderFeatured() {
  const grid = qs('#featuredGrid');

  const featured = state.mediaList
    .filter(m => m.is_featured || m.is_top10)
    .slice(0, 8);

  grid.innerHTML = featured.length
    ? featured.map(renderMediaCard).join('')
    : `
      <p class="empty-state">
        Nenhum destaque disponível no momento.
      </p>
    `;
}

async function loadCatalog() {
  try {
    const data = await apiRequest('/media');
    state.mediaList = data.media;
  } catch (err) {
    console.warn(
      'Falha ao carregar catálogo da API, usando dados locais de exemplo.',
      err.message
    );

    state.mediaList = LOCAL_FALLBACK_MEDIA;
  }

  renderCatalog();
  renderFeatured();
}

// ---------------------------------------------------------------------
// Filtros de gênero
// ---------------------------------------------------------------------

qs('#genreFilters').addEventListener('click', e => {
  const btn = e.target.closest('.genre-chip');

  if (!btn) return;

  qsa('.genre-chip').forEach(c =>
    c.classList.remove('active')
  );

  btn.classList.add('active');

  state.currentGenre = btn.dataset.genre;

  renderCatalog();
});

// ---------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------

qs('#searchInput').addEventListener('input', e => {
  state.currentSearch = e.target.value;
  renderCatalog();
});

// ---------------------------------------------------------------------
// Clique em Assistir
// ---------------------------------------------------------------------

document.addEventListener('click', e => {
  const watchBtn = e.target.closest('.btn-watch');

  if (watchBtn) {
    const media = state.mediaList.find(
      m => String(m.id) === watchBtn.dataset.mediaId
    );

    if (media) {
      openTheatre(media);
    }

    return;
  }
});

qs('#btnHeroWatch').addEventListener('click', () => {
  const casablanca =
    state.mediaList.find(m => m.title === 'Casablanca') ||
    state.mediaList[0];

  if (casablanca) {
    openTheatre(casablanca);
  } else {
    showToast(
      'Catálogo ainda carregando, tente novamente em instantes.'
    );
  }
});

// =====================================================================
// PLANOS
// =====================================================================

qsa('[data-plan-slug]').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!state.user) {
      openModal('authModal');

      showToast(
        'Faça login ou cadastre-se para assinar um plano.'
      );

      return;
    }

    try {
      const plans = await apiRequest('/plans');

      const plan = plans.plans.find(
        p => p.slug === btn.dataset.planSlug
      );

      if (!plan) {
        throw new Error('Plano não encontrado.');
      }

      await apiRequest(
        `/plans/${plan.id}/subscribe`,
        { method: 'POST' }
      );

      showToast(
        `Assinatura do plano ${plan.name} confirmada com sucesso!`
      );

    } catch (err) {
      showToast(err.message);
    }
  });
});

// =====================================================================
// SALA DE CINEMA / SELEÇÃO DE POLTRONA
// =====================================================================

async function openTheatre(media) {
  state.activeMedia = media;
  state.selectedSeat = null;

  qs('#theatreMediaTitle').textContent = media.title;

  qs('#cinemaScreen').classList.remove('playing');
  qs('#cinemaScreen').style.transform = '';

  const video = qs('#cinemaVideo');
  const youtube = qs('#cinemaYoutube');

  video.pause();
  video.removeAttribute('src');
  video.style.display = 'none';

  youtube.removeAttribute('src');
  youtube.style.display = 'none';

  qs('#btnConfirmSeat').disabled = true;

  qs('#selectedSeatTag').textContent =
    'Nenhuma poltrona selecionada';

  let room = state.activeRoom;
  let takenSeats = [];

  try {
    const roomsData = await apiRequest('/rooms');

    room = roomsData.rooms[0];

    const seatsData = await apiRequest(
      `/rooms/${room.id}/seats?media_id=${media.id}`
    );

    takenSeats = seatsData.takenSeats;
    room = seatsData.room;

  } catch (err) {
    room = room || {
      id: 1,
      name: 'Sala Retrô 1',
      theme: 'retro',
      total_rows: 6,
      seats_per_row: 8
    };
  }

  state.activeRoom = room;

  qs('#theatreMediaSub').textContent =
    `${room.name} — a perspectiva da tela se ajusta à sua poltrona`;

  renderSeatMap(room, takenSeats);

  openModal('theatreModal');
}

function renderSeatMap(room, takenSeats) {
  const rowsLetters =
    'ABCDEFGHIJ'.split('').slice(0, room.total_rows);

  const container = qs('#seatMap');

  container.innerHTML = rowsLetters.map(rowLetter => {
    let seatsHtml = '';

    for (
      let n = 1;
      n <= room.seats_per_row;
      n++
    ) {
      const seatId = `${rowLetter}${n}`;

      const isTaken =
        takenSeats.includes(seatId);

      seatsHtml += `
        <div
          class="seat ${isTaken ? 'taken' : ''}"
          data-row="${rowLetter}"
          data-number="${n}"
          data-seat-id="${seatId}"
        ></div>
      `;
    }

    return `
      <div class="seat-row">
        <span class="row-label">${rowLetter}</span>
        ${seatsHtml}
      </div>
    `;
  }).join('');
}

qs('#seatMap').addEventListener('click', e => {
  const seatEl = e.target.closest('.seat');

  if (
    !seatEl ||
    seatEl.classList.contains('taken')
  ) {
    return;
  }

  qsa('.seat.selected').forEach(s =>
    s.classList.remove('selected')
  );

  seatEl.classList.add('selected');

  const row = seatEl.dataset.row;
  const number = parseInt(
    seatEl.dataset.number,
    10
  );

  state.selectedSeat = {
    row,
    number
  };

  qs('#selectedSeatTag').textContent =
    `Poltrona selecionada: ${row}${number}`;

  qs('#btnConfirmSeat').disabled = false;

  applySeatPerspective(row, number);
});

// ---------------------------------------------------------------------
// Perspectiva da tela
// ---------------------------------------------------------------------

function applySeatPerspective(row, number) {
  const room = state.activeRoom;

  const rowsLetters =
    'ABCDEFGHIJ'.split('').slice(0, room.total_rows);

  const rowIndex = rowsLetters.indexOf(row);

  const totalRows = room.total_rows;
  const totalSeats = room.seats_per_row;

  const horizontalRatio =
    ((number - 1) / (totalSeats - 1)) * 2 - 1;

  const depthRatio =
    rowIndex / Math.max(totalRows - 1, 1);

  const rotateY = horizontalRatio * 22;
  const rotateX = 10 - depthRatio * 18;
  const translateZ = -depthRatio * 60;
  const scale = 1 - depthRatio * 0.12;

  const screen = qs('#cinemaScreen');

  screen.style.transform =
    `rotateX(${rotateX}deg) ` +
    `rotateY(${rotateY}deg) ` +
    `translateZ(${translateZ}px) ` +
    `scale(${scale})`;
}

qs('#btnConfirmSeat').addEventListener('click', async () => {
  const media = state.activeMedia;
  const room = state.activeRoom;
  const seat = state.selectedSeat;

  if (!media || !room || !seat) return;

  try {
    await apiRequest(
      `/rooms/${room.id}/select-seat`,
      {
        method: 'POST',
        body: JSON.stringify({
          media_id: media.id,
          seat_row: seat.row,
          seat_number: seat.number
        })
      }
    );

  } catch (err) {
    console.warn(
      'Não foi possível registrar a poltrona no servidor:',
      err.message
    );
  }

  qs(
    `.seat[data-seat-id="${seat.row}${seat.number}"]`
  )?.classList.add('taken');

  startPlayback(media);

  try {
    await apiRequest(
      `/media/${media.id}/view`,
      { method: 'POST' }
    );
  } catch (err) {
    // Silencioso
  }

  showToast(
    `Sessão iniciada na poltrona ${seat.row}${seat.number}!`
  );
});

function startPlayback(media) {
  const screen = qs('#cinemaScreen');
  const video = qs('#cinemaVideo');
  const youtube = qs('#cinemaYoutube');

  screen.classList.add('playing');

  video.style.display = 'none';
  youtube.style.display = 'none';

  video.pause();
  video.removeAttribute('src');

  youtube.removeAttribute('src');

  if (media.video_url) {
    const url = media.video_url.trim();

    const youtubeId = getYoutubeVideoId(url);

    if (youtubeId) {
      youtube.src =
        `https://www.youtube.com/embed/${youtubeId}` +
        `?autoplay=1&controls=1&modestbranding=1` +
        `&rel=0&iv_load_policy=3`;

      youtube.style.display = 'block';

    } else {
      video.src = url;
      video.style.display = 'block';

      video.play().catch(() => {});
    }

  } else if (media.video_path) {
    video.src = media.video_path;
    video.style.display = 'block';

    video.play().catch(() => {});
  }
}

function getYoutubeVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.substring(1);
    }

    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/embed/')[1];
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1];
    }

  } catch (error) {
    return null;
  }

  return null;
}

// =====================================================================
// PAINEL ADMINISTRATIVO
// =====================================================================

function openAdminPanel() {
  openModal('adminModal');

  if (state.user.role === 'superadmin') {
    qs('#tabUsersBtn').style.display = 'inline-flex';
    loadUsersTable();
  } else {
    qs('#tabUsersBtn').style.display = 'none';
  }

  loadCatalogAdmin();
  loadMetrics();
}

// ---------------------------------------------------------------------
// Abas administrativas
// ---------------------------------------------------------------------

qs('#adminTabs').addEventListener('click', e => {
  const btn = e.target.closest('.admin-tab-btn');

  if (!btn) return;

  qsa('.admin-tab-btn').forEach(b =>
    b.classList.remove('active')
  );

  btn.classList.add('active');

  qsa('.admin-panel-view').forEach(v =>
    v.classList.remove('active')
  );

  const map = {
    'add-media': 'adminPanelAddMedia',
    'catalog': 'adminPanelCatalog',
    'metrics': 'adminPanelMetrics',
    'users': 'adminPanelUsers'
  };

  const target = qs(
    '#' + map[btn.dataset.adminTab]
  );

  if (target) {
    target.classList.add('active');
  }
});

// ---------------------------------------------------------------------
// Tipo de vídeo
// ---------------------------------------------------------------------

qs('#mVideoSource').addEventListener('change', e => {
  const isUpload = e.target.value === 'upload';

  qs('#mVideoLinkField').style.display =
    isUpload ? 'none' : 'flex';

  qs('#mVideoUploadField').style.display =
    isUpload ? 'flex' : 'none';
});

// ---------------------------------------------------------------------
// Resetar formulário de mídia
// ---------------------------------------------------------------------

function resetMediaForm() {
  state.editingMediaId = null;

  const form = qs('#mediaForm');

  if (form) {
    form.reset();
  }

  const source = qs('#mVideoSource');

  if (source) {
    source.value = 'link';
  }

  const linkField = qs('#mVideoLinkField');
  const uploadField = qs('#mVideoUploadField');

  if (linkField) {
    linkField.style.display = 'flex';
  }

  if (uploadField) {
    uploadField.style.display = 'none';
  }

  const message = qs('#mediaFormMessage');

  if (message) {
    message.textContent = '';
    message.className = 'form-message';
  }

  const saveButton = qs('#btnSaveMedia');

  if (saveButton) {
    saveButton.textContent =
      'Salvar Mídia no Catálogo';
  }

  const cancelButton = qs('#btnCancelEdit');

  if (cancelButton) {
    cancelButton.style.display = 'none';
  }
}

// ---------------------------------------------------------------------
// Editar mídia
// ---------------------------------------------------------------------

async function editMedia(id) {
  const media = state.mediaList.find(
    m => String(m.id) === String(id)
  );

  if (!media) {
    showToast('Mídia não encontrada.');
    return;
  }

  state.editingMediaId = media.id;

  qs('#mTitle').value = media.title || '';
  qs('#mSynopsis').value = media.synopsis || '';
  qs('#mType').value = media.type || 'filme';
  qs('#mGenre').value = media.genre || '';
  qs('#mClassification').value =
    media.classification || '';
  qs('#mMinAge').value = media.min_age ?? '';
  qs('#mDirector').value = media.director || '';
  qs('#mCast').value = media.cast_list || '';
  qs('#mCountry').value = media.country || '';
  qs('#mProducer').value = media.producer || '';
  qs('#mYear').value =
    media.release_year ?? '';
  qs('#mDuration').value =
    media.duration_minutes ?? '';

  qs('#mVideoSource').value =
    media.video_source_type || 'link';

  qs('#mVideoUrl').value =
    media.video_url || '';

  qs('#mFeatured').checked =
    !!media.is_featured;

  qs('#mTop10').checked =
    !!media.is_top10;

  const isUpload =
    qs('#mVideoSource').value === 'upload';

  qs('#mVideoLinkField').style.display =
    isUpload ? 'none' : 'flex';

  qs('#mVideoUploadField').style.display =
    isUpload ? 'flex' : 'none';

  const saveButton = qs('#btnSaveMedia');

  if (saveButton) {
    saveButton.textContent =
      'Salvar Alterações';
  }

  const cancelButton = qs('#btnCancelEdit');

  if (cancelButton) {
    cancelButton.style.display =
      'inline-flex';
  }

  // Vai para a aba do formulário
  const addTab = qs(
    '[data-admin-tab="add-media"]'
  );

  if (addTab) {
    addTab.click();
  }

  // Leva o formulário para a área visível
  const form = qs('#mediaForm');

  if (form) {
    form.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  showToast(
    `Editando "${media.title}".`
  );
}

// ---------------------------------------------------------------------
// Botão cancelar edição
// ---------------------------------------------------------------------

const btnCancelEdit = qs('#btnCancelEdit');

if (btnCancelEdit) {
  btnCancelEdit.addEventListener(
    'click',
    () => {
      resetMediaForm();
      showToast('Edição cancelada.');
    }
  );
}

// ---------------------------------------------------------------------
// Adicionar / Editar mídia
// ---------------------------------------------------------------------

qs('#mediaForm').addEventListener(
  'submit',
  async e => {
    e.preventDefault();

    const msg = qs('#mediaFormMessage');

    try {
      const formData = new FormData();

      formData.append(
        'title',
        qs('#mTitle').value
      );

      formData.append(
        'synopsis',
        qs('#mSynopsis').value
      );

      formData.append(
        'type',
        qs('#mType').value
      );

      formData.append(
        'genre',
        qs('#mGenre').value
      );

      formData.append(
        'classification',
        qs('#mClassification').value
      );

      formData.append(
        'min_age',
        qs('#mMinAge').value
      );

      formData.append(
        'director',
        qs('#mDirector').value
      );

      formData.append(
        'cast_list',
        qs('#mCast').value
      );

      formData.append(
        'country',
        qs('#mCountry').value
      );

      formData.append(
        'producer',
        qs('#mProducer').value
      );

      formData.append(
        'release_year',
        qs('#mYear').value
      );

      formData.append(
        'duration_minutes',
        qs('#mDuration').value
      );

      formData.append(
        'video_source_type',
        qs('#mVideoSource').value
      );

      formData.append(
        'video_url',
        qs('#mVideoUrl').value
      );

      formData.append(
        'is_featured',
        qs('#mFeatured').checked ? '1' : '0'
      );

      formData.append(
        'is_top10',
        qs('#mTop10').checked ? '1' : '0'
      );

      if (qs('#mVideoFile').files[0]) {
        formData.append(
          'video',
          qs('#mVideoFile').files[0]
        );
      }

      if (qs('#mPosterFile').files[0]) {
        formData.append(
          'poster',
          qs('#mPosterFile').files[0]
        );
      }

      const isEditing =
        state.editingMediaId !== null;

      const endpoint = isEditing
        ? `/media/${state.editingMediaId}`
        : '/media';

      const method = isEditing
        ? 'PUT'
        : 'POST';

      const res = await fetch(
        API_BASE + endpoint,
        {
          method,
          headers: authHeaders(),
          body: formData
        }
      );

      let data = {};

      try {
        data = await res.json();
      } catch (error) {
        // Resposta sem JSON
      }

      if (res.status === 401) {
        handleUnauthorized();
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
          'Erro ao salvar mídia.'
        );
      }

      msg.textContent =
        data.message ||
        (
          isEditing
            ? 'Mídia atualizada com sucesso.'
            : 'Mídia adicionada com sucesso.'
        );

      msg.className =
        'form-message show success';

      resetMediaForm();

      await loadCatalog();
      await loadCatalogAdmin();

      showToast(
        isEditing
          ? 'Mídia atualizada com sucesso!'
          : 'Mídia adicionada ao catálogo!'
      );

    } catch (err) {
      msg.textContent = err.message;
      msg.className =
        'form-message show error';
    }
  }
);

// ---------------------------------------------------------------------
// Catálogo administrativo
// ---------------------------------------------------------------------

async function loadCatalogAdmin() {
  const tbody = qs('#catalogAdminBody');

  if (!tbody) return;

  try {
    const data =
      await apiRequest('/media');

    tbody.innerHTML =
      data.media.map(media => `
        <tr>
          <td>${media.title}</td>

          <td>
            ${media.type || 'filme'}
          </td>

          <td>
            ${media.release_year || '-'}
          </td>

          <td>
            ${media.is_featured ? '⭐' : '-'}
            ${media.is_top10 ? ' 🏆' : ''}
          </td>

          <td class="table-actions">
            <button
              class="link-btn"
              data-edit-media="${media.id}"
            >
              Editar
            </button>

            <button
              class="link-btn"
              data-delete-media="${media.id}"
            >
              Excluir
            </button>
          </td>
        </tr>
      `).join('');

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          Erro ao carregar catálogo:
          ${err.message}
        </td>
      </tr>
    `;
  }
}

const catalogAdminBody =
  qs('#catalogAdminBody');

if (catalogAdminBody) {
  catalogAdminBody.addEventListener(
    'click',
    async e => {
      const editButton =
        e.target.closest(
          '[data-edit-media]'
        );

      const deleteButton =
        e.target.closest(
          '[data-delete-media]'
        );

      if (editButton) {
        await editMedia(
          editButton.dataset.editMedia
        );
        return;
      }

      if (deleteButton) {
        await deleteMedia(
          deleteButton.dataset.deleteMedia
        );
      }
    }
  );
}

// ---------------------------------------------------------------------
// Excluir mídia
// ---------------------------------------------------------------------

async function deleteMedia(id) {
  const media = state.mediaList.find(
    m => String(m.id) === String(id)
  );

  if (!media) {
    showToast('Mídia não encontrada.');
    return;
  }

  const confirmed = confirm(
    `Tem certeza que deseja excluir "${media.title}" do catálogo?`
  );

  if (!confirmed) return;

  try {
    await apiRequest(
      `/media/${id}`,
      {
        method: 'DELETE'
      }
    );

    showToast(
      'Mídia removida do catálogo.'
    );

    await loadCatalog();
    await loadCatalogAdmin();

  } catch (err) {
    showToast(
      `Erro ao remover mídia: ${err.message}`
    );
  }
}

// =====================================================================
// MÉTRICAS
// =====================================================================

async function loadMetrics() {
  try {
    const data =
      await apiRequest('/users/metrics');

    qs('#metricsGrid').innerHTML = `
      <div class="metric-card">
        <div class="value">
          ${data.totalUsers}
        </div>

        <div class="label">
          Usuários Comuns
        </div>
      </div>

      <div class="metric-card">
        <div class="value">
          ${data.totalAdmins}
        </div>

        <div class="label">
          Admins
        </div>
      </div>

      <div class="metric-card">
        <div class="value">
          ${data.subscribersByPlan.reduce(
            (a, p) => a + p.total,
            0
          )}
        </div>

        <div class="label">
          Assinantes Ativos
        </div>
      </div>
    `;

    qs('#mostWatchedBody').innerHTML =
      data.mostWatched
        .map(
          m => `
            <tr>
              <td>${m.title}</td>
              <td>${m.view_count}</td>
            </tr>
          `
        )
        .join('');

  } catch (err) {
    qs('#metricsGrid').innerHTML = `
      <p class="empty-state">
        Não foi possível carregar as métricas:
        ${err.message}
      </p>
    `;
  }
}

// =====================================================================
// USUÁRIOS — SOMENTE SUPER ADMIN
// =====================================================================

async function loadUsersTable() {
  try {
    const data =
      await apiRequest('/users');

    qs('#usersTableBody').innerHTML =
      data.users
        .map(
          u => `
            <tr>
              <td>${u.name}</td>

              <td>${u.email}</td>

              <td>
                <span class="role-tag">
                  ${u.role}
                </span>
              </td>

              <td class="table-actions">
                <button
                  class="link-btn"
                  data-reset-user="${u.id}"
                >
                  Redefinir senha
                </button>

                <button
                  class="link-btn"
                  data-remove-user="${u.id}"
                >
                  Remover
                </button>
              </td>
            </tr>
          `
        )
        .join('');

  } catch (err) {
    qs('#usersTableBody').innerHTML = `
      <tr>
        <td colspan="4">
          Erro ao carregar usuários:
          ${err.message}
        </td>
      </tr>
    `;
  }
}

qs('#createUserForm').addEventListener(
  'submit',
  async e => {
    e.preventDefault();

    try {
      await apiRequest(
        '/users',
        {
          method: 'POST',
          body: JSON.stringify({
            name: qs('#nuName').value,
            email: qs('#nuEmail').value,
            password: qs('#nuPassword').value,
            role: qs('#nuRole').value
          })
        }
      );

      showToast(
        'Usuário criado com sucesso!'
      );

      qs('#createUserForm').reset();

      loadUsersTable();

    } catch (err) {
      showToast(err.message);
    }
  }
);

qs('#usersTableBody').addEventListener(
  'click',
  async e => {
    const resetButton =
      e.target.closest(
        '[data-reset-user]'
      );

    const removeButton =
      e.target.closest(
        '[data-remove-user]'
      );

    try {
      if (resetButton) {
        const newPassword = prompt(
          'Digite a nova senha para este usuário (mínimo 6 caracteres):'
        );

        if (!newPassword) return;

        await apiRequest(
          `/users/${resetButton.dataset.resetUser}/reset-password`,
          {
            method: 'PUT',
            body: JSON.stringify({
              newPassword
            })
          }
        );

        showToast(
          'Senha redefinida com sucesso.'
        );

        return;
      }

      if (removeButton) {
        if (
          !confirm(
            'Tem certeza que deseja remover este usuário?'
          )
        ) {
          return;
        }

        await apiRequest(
          `/users/${removeButton.dataset.removeUser}`,
          {
            method: 'DELETE'
          }
        );

        showToast(
          'Usuário removido.'
        );

        loadUsersTable();
      }

    } catch (err) {
      showToast(err.message);
    }
  }
);

// =====================================================================
// MODAIS GENÉRICOS
// =====================================================================

qsa('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    btn
      .closest('.modal-overlay')
      .classList.remove('open');
  });
});

qsa('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    qsa('.modal-overlay.open').forEach(
      m => m.classList.remove('open')
    );
  }
});

// =====================================================================
// MENU MOBILE
// =====================================================================

qs('#navToggle').addEventListener('click', () => {
  qs('#mainNav').classList.toggle('open');
});

qsa('.main-nav a').forEach(a => {
  a.addEventListener('click', () => {
    qs('#mainNav').classList.remove('open');
  });
});

// =====================================================================
// DADOS LOCAIS DE FALLBACK
// =====================================================================

const LOCAL_FALLBACK_MEDIA = [
  {
    id: 1,
    title: 'Casablanca',
    genre: 'Drama',
    release_year: 1942,
    is_featured: 1,
    is_top10: 1,
    poster_path: 'assets/images/poster-casablanca.svg',
    video_url: ''
  },
  {
    id: 2,
    title: 'A Regra do Jogo',
    genre: 'Comedia',
    release_year: 1939,
    is_featured: 1,
    is_top10: 1,
    poster_path: 'assets/images/poster-generic-1.svg',
    video_url: ''
  },
  {
    id: 3,
    title: 'Psicose',
    genre: 'Suspense',
    release_year: 1960,
    is_featured: 1,
    is_top10: 1,
    poster_path: 'assets/images/poster-generic-2.svg',
    video_url: ''
  },
  {
    id: 4,
    title: 'Cantando na Chuva',
    genre: 'Musical',
    release_year: 1952,
    is_featured: 0,
    is_top10: 0,
    poster_path: 'assets/images/poster-generic-3.svg',
    video_url: ''
  },
  {
    id: 5,
    title: 'A Bela e a Fera',
    genre: 'Romance',
    release_year: 1946,
    is_featured: 0,
    is_top10: 0,
    poster_path: 'assets/images/poster-generic-4.svg',
    video_url: ''
  },
  {
    id: 6,
    title: 'Metropolis',
    genre: 'Ficcao Cientifica',
    release_year: 1927,
    is_featured: 0,
    is_top10: 0,
    poster_path: 'assets/images/poster-generic-5.svg',
    video_url: ''
  },
  {
    id: 7,
    title: 'Nosferatu',
    genre: 'Terror',
    release_year: 1922,
    is_featured: 0,
    is_top10: 0,
    poster_path: 'assets/images/poster-generic-6.svg',
    video_url: ''
  }
];

// =====================================================================
// INICIALIZAÇÃO
// =====================================================================

updateAuthUI();
loadCatalog();