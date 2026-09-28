async function request(path, { method = "GET", body } = {}) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function requestForm(path, formData) {
  const res = await fetch(path, { method: "POST", body: formData, credentials: "same-origin" });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function apiGet(path) {
  return request(path);
}
export function apiPostForm(path, formData) {
  return requestForm(path, formData);
}
export function apiPost(path, body) {
  return request(path, { method: "POST", body });
}
export function apiPut(path, body) {
  return request(path, { method: "PUT", body });
}
export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}
