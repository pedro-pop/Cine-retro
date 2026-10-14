(() => {
  const baseUrl = String(
    window.CINE_RETRO_API_BASE || `${window.location.origin}/api`
  ).replace(/\/+$/, '');

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const body = options.body;

    if (options.token) {
      headers.set('Authorization', `Bearer ${options.token}`);
    }

    if (body !== undefined && !(body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body
      });
    } catch (error) {
      throw new Error('Não foi possível conectar à API. Confira se o backend está em execução.');
    }

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new Error('A API retornou uma resposta inválida.');
      }
    }

    if (response.status === 401 && typeof options.onUnauthorized === 'function') {
      options.onUnauthorized();
    }

    if (!response.ok) {
      const message = data.error || data.detail;
      const error = new Error(
        typeof message === 'string'
          ? message
          : `A solicitação falhou (${response.status}).`
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function assetUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    const normalized = String(path || '').replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
      return `${new URL(baseUrl).origin}/${normalized}`;
    }
    return new URL(normalized, `${window.location.origin}/`).href;
  }

  window.CineRetroApi = { baseUrl, request, assetUrl };
})();
