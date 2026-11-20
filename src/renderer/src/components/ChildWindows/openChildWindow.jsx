export const openChildWindow = (name, type, data) => {
  const api = name === 'cover-search-alt-tags' ? window.tagEditApi : window.ipcApi;
  return api.showChild({ name, data: { listType: type, results: data } });
};
