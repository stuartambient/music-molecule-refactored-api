export const openChildWindow = async (name, type, config, data) => {
  /*   console.log('ocw: ', 'name: ', name, 'type: ', type); /*'config: ', config, 'data: ', data); */
  /*   console.log('openChildWindow [name]: ', name); */
  const apipreload = name === 'cover-search-alt-tags' ? window.metadataEditingApi : window.api;
  /* window.api.showChild({ */
  if (name !== 'cover-search-alt-tags') {
    /*     console.log('openChildWindow called from', new Error().stack);
    console.log('data: ', data); */
    console.log('openChildWindow');
    return await window.ipcApi.invoke('show-child', {
      name: name,
      type: type,
      winConfig: {
        width: config.width,
        height: config.height,
        show: config.show,
        parent: config.parent || null,
        resizable: config.resizable,
        preload: config.preload,
        sandbox: config.sandbox,
        webSecurity: config.webSecurity,
        contextIsolation: config.contextIsolation
      },
      data: { listType: type, results: data }
    });
  } else {
    window.tagEditApi.invoke('show-child', {
      name: name,
      type: type,
      winConfig: {
        width: config.width,
        height: config.height,
        show: config.show,
        parent: config.parent || null,
        resizable: config.resizable,
        preload: config.preload,
        sandbox: config.sandbox,
        webSecurity: config.webSecurity,
        contextIsolation: config.contextIsolation
      },
      data: { listType: type, results: data }
    });
  }
};
