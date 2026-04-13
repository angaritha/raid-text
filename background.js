chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('snippets', (data) => {
    if (!data.snippets) {
      chrome.storage.sync.set({
        snippets: {
          '/ty': { name: 'Gracias', body: 'Muchas gracias por su mensaje. Quedo atento a sus comentarios.' },
          '/sal': { name: 'Saludo formal', body: 'Buenos días,\n\nEspero que se encuentre bien.' },
          '/firma': { name: 'Firma', body: 'Saludos cordiales,\n[Tu nombre]\n[Tu cargo]' },
          '/fecha': { name: 'Fecha hoy', body: '{fecha}' }
        }
      });
    }
  });
});
