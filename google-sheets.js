// ========================================
// GOOGLE SHEETS API INTEGRATION
// ========================================

// Variabili per la sincronizzazione
let syncInProgress = false;
let lastSyncTime = null;

// Carica i libri da Google Sheets
async function loadBooksFromGoogleSheets() {
    if (!accessToken || !isConfigurationValid()) {
        console.log('📚 Caricamento locale (no Google Sheets)');
        loadBooksFromLocalStorage();
        return;
    }

    try {
        setSyncStatus('loading', 'Sincronizzazione...');
        
        const response = await fetch(`${GOOGLE_APIS.SHEETS_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token scaduto
                await refreshTokenIfNeeded();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.values && data.values.length > 1) {
            // Prima riga = headers, resto = dati
            const headers = data.values[0];
            const rows = data.values.slice(1);
            
            // Filtra solo i libri dell'utente corrente
            const userBooks = rows
                .map(row => convertRowToBook(headers, row))
                .filter(book => book && book.userId === currentUser.id);
            
            books = userBooks;
            lastSyncTime = new Date();
            
            console.log(`📚 Caricati ${books.length} libri da Google Sheets`);
            setSyncStatus('success', 'Sincronizzato');
            
        } else {
            // Foglio vuoto o solo headers
            books = [];
            
            // Inizializza il foglio con gli headers se necessario
            if (!data.values || data.values.length === 0) {
                await initializeGoogleSheet();
            }
        }

        displayBooks();
        updateBookCount();
        
        // Sincronizza con localStorage come backup
        saveBooks();

    } catch (error) {
        console.error('❌ Errore caricamento da Google Sheets:', error);
        setSyncStatus('error', 'Errore sincronizzazione');
        
        showAlert('Errore nel caricamento da Google Sheets. Usando dati locali.', 'error');
        
        // Fallback a localStorage
        loadBooksFromLocalStorage();
    }
}

// Inizializza il Google Sheet con gli headers
async function initializeGoogleSheet() {
    if (!accessToken) return;

    try {
        const response = await fetch(`${GOOGLE_APIS.SHEETS_UPDATE}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [SHEETS_CONFIG.HEADERS]
            })
        });

        if (response.ok) {
            console.log('✅ Google Sheet inizializzato con headers');
        }
    } catch (error) {
        console.error('❌ Errore inizializzazione Google Sheet:', error);
    }
}

// Salva un libro su Google Sheets
async function saveBookToGoogleSheets(book) {
    if (!accessToken || syncInProgress) {
        return false;
    }

    try {
        syncInProgress = true;
        setSyncStatus('loading', 'Salvando...');

        const bookRow = convertBookToRow(book);
        
        const response = await fetch(`${GOOGLE_APIS.SHEETS_WRITE}?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [bookRow]
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Libro salvato su Google Sheets:', book.title);
        setSyncStatus('success', 'Salvato');
        lastSyncTime = new Date();
        
        return true;

    } catch (error) {
        console.error('❌ Errore salvataggio su Google Sheets:', error);
        setSyncStatus('error', 'Errore salvataggio');
        showAlert('Errore nel salvataggio su Google Sheets', 'error');
        return false;
        
    } finally {
        syncInProgress = false;
    }
}

// Aggiorna un libro su Google Sheets
async function updateBookInGoogleSheets(book) {
    if (!accessToken || syncInProgress) {
        return false;
    }

    try {
        syncInProgress = true;
        setSyncStatus('loading', 'Aggiornando...');

        // Prima trova la riga del libro
        const rowIndex = await findBookRowInSheet(book.id);
        
        if (rowIndex === -1) {
            // Libro non trovato, aggiungilo come nuovo
            console.log('📚 Libro non trovato su Google Sheets, lo aggiungo come nuovo');
            return await saveBookToGoogleSheets(book);
        }

        const bookRow = convertBookToRow(book);
        const range = `${SHEETS_CONFIG.SHEET_NAME}!A${rowIndex}:O${rowIndex}`;

        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${range}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [bookRow]
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            const errorData = await response.json();
            console.error('Errore risposta API:', errorData);
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        console.log('✅ Libro aggiornato su Google Sheets:', book.title);
        setSyncStatus('success', 'Aggiornato');
        lastSyncTime = new Date();
        
        return true;

    } catch (error) {
        console.error('❌ Errore aggiornamento su Google Sheets:', error);
        setSyncStatus('error', 'Errore aggiornamento');
        showAlert('Errore nell\'aggiornamento su Google Sheets: ' + error.message, 'error');
        return false;
        
    } finally {
        syncInProgress = false;
    }
}

// Elimina un libro da Google Sheets
async function deleteBookFromGoogleSheets(bookId) {
    if (!accessToken || syncInProgress) {
        return false;
    }

    try {
        syncInProgress = true;
        setSyncStatus('loading', 'Eliminando...');

        const rowIndex = await findBookRowInSheet(bookId);
        
        if (rowIndex === -1) {
            console.log('📚 Libro non trovato su Google Sheets');
            return true; // Non è un errore se non esiste
        }

        // Elimina la riga
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: 0, // ID del primo sheet
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1, // 0-based
                            endIndex: rowIndex
                        }
                    }
                }]
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Libro eliminato da Google Sheets');
        setSyncStatus('success', 'Eliminato');
        lastSyncTime = new Date();
        
        return true;

    } catch (error) {
        console.error('❌ Errore eliminazione da Google Sheets:', error);
        setSyncStatus('error', 'Errore eliminazione');
        return false;
        
    } finally {
        syncInProgress = false;
    }
}

// Trova l'indice della riga di un libro nel foglio
async function findBookRowInSheet(bookId) {
    try {
        const response = await fetch(`${GOOGLE_APIS.SHEETS_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.values || data.values.length <= 1) {
            return -1;
        }

        // Cerca il libro per ID (prima colonna)
        for (let i = 1; i < data.values.length; i++) {
            if (data.values[i][0] === bookId) {
                return i + 1; // 1-based index per Google Sheets
            }
        }

        return -1; // Non trovato

    } catch (error) {
        console.error('❌ Errore ricerca libro nel foglio:', error);
        return -1;
    }
}

// Converte una riga del foglio in oggetto libro
function convertRowToBook(headers, row) {
    if (!row || row.length === 0) return null;
    
    const book = {};
    
    headers.forEach((header, index) => {
        const value = row[index] || '';
        switch(header) {
            case 'ID': book.id = value; break;
            case 'Titolo': book.title = value; break;
            case 'Autore': book.author = value; break;
            case 'ISBN': book.isbn = value; break;
            case 'Casa_Editrice': book.publisher = value; break;
            case 'Anno': book.year = value; break;
            case 'Categoria': book.genre = value; break;
            case 'Parole_Chiave': book.keywords = value; break;
            case 'Scaffale': book.shelf = value; break;
            case 'Posizione': book.position = value; break;
            case 'Condizioni': book.condition = value; break;
            case 'Note': book.notes = value; break;
            case 'Data_Aggiunta': book.addedDate = value; break;
            case 'User_ID': book.userId = value; break;
            case 'User_Name': book.userName = value; break;
        }
    });
    
    return book.title ? book : null;
}

// Converte un oggetto libro in riga per il foglio
function convertBookToRow(book) {
    return [
        book.id || '',
        book.title || '',
        book.author || '',
        book.isbn || '',
        book.publisher || '',
        book.year || '',
        book.genre || '',
        book.keywords || '',
        book.shelf || '',
        book.position || '',
        book.condition || '',
        book.notes || '',
        book.addedDate || '',
        book.userId || '',
        book.userName || ''
    ];
}

// Sincronizzazione manuale
async function manualSync() {
    if (syncInProgress) {
        showAlert('Sincronizzazione già in corso...', 'info');
        return;
    }

    if (!currentUser || currentUser.authMethod !== 'google') {
        showAlert('Sincronizzazione disponibile solo con account Google', 'info');
        return;
    }

    showAlert('Sincronizzazione in corso...', 'info');
    await loadBooksFromGoogleSheets();
}

// Gestione stato sincronizzazione
function setSyncStatus(status, message) {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;

    const icons = {
        'loading': '🔄',
        'success': '✅',
        'error': '❌',
        'offline': '📱'
    };

    const colors = {
        'loading': '#ffc107',
        'success': '#28a745',
        'error': '#dc3545',
        'offline': '#6c757d'
    };

    syncStatus.innerHTML = `${icons[status]} ${message}`;
    syncStatus.style.color = colors[status];

    if (status === 'loading') {
        syncStatus.classList.add('pulse');
    } else {
        syncStatus.classList.remove('pulse');
    }
}
