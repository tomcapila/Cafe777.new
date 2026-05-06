export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  }).catch(err => {
    // Suppress console.error for expected polling network drops (e.g. server idle shutdown or restart)
    if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
      console.error(`fetchWithAuth strictly failed on network level for URL: ${url}`, err);
    }
    throw err;
  });

  if (response.status === 401) {
    if (token) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-change'));
      
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else {
        window.location.href = '/login';
      }
    }
  }

  if (response.status === 403) {
    try {
      const result = await response.clone().json();
      console.error(`Access denied: Forbidden [${url}]`, result.error || '');
    } catch (e) {
      const text = await response.clone().text();
      console.error(`Access denied: Forbidden [${url}] - Non-JSON error response:`, text.substring(0, 200));
    }
  }

  return response;
}
