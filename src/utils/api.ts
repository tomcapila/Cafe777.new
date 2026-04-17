export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
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
