// ========================================
// GESTIONE LIBRERIE UTENTE
// ========================================

let userLibraries = [];

// Carica le librerie dell'utente da Google Sheets
async function loadUserLibraries() {
    if (!currentUser) return;
    
    if (currentUser.authMethod === 'google' && accessToken) {
        await loadLibrariesFromGoogleSheets();
    } else {
        loadLibrariesFromLocalStorage();
    }
    
    updateLibraryDropdown();
    displayLibraries();
}

// Carica da Google Sheets
async function loadLibrariesFromGoogleSheets() {
    if (!accessToken) {
        console.log('❌ Token non disponibile, carico da localStorage');
        loadLibrariesFromLocalStorage();
        return;
    }

    try {
        console.log('📥 Caricamento librerie da Google Sheets...');
        console.log('URL:', GOOGLE_APIS.LIBRARIES_READ);
        
        const response = await fetch(`${GOOGLE_APIS.LIBRARIES_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Errore risposta:', errorData);
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return;
            }
            
            if (response.status === 404 || response.status === 400) {
                console.log('⚠️ Foglio "Librerie" non trovato, lo inizializzo...');
                await initializeLibrariesSheet();
                userLibraries = [];
                saveLibrariesToLocalStorage();
                return;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('📊 Dati ricevuti:', data);
        
        if (data.values && data.values.length > 1) {
            const headers = data.values[0];
            const rows = data.values.slice(1);
            
            console.log('📋 Headers:', headers);
            console.log('📚 Righe:', rows);
            
            // Filtra solo le librerie dell'utente corrente
            userLibraries = rows
                .filter(row => row[0] === currentUser.id)
                .map(row => ({
                    userId: row[0],
                    name: row[1],
                    dateCreated: row[2]
                }));
            
            console.log(`✅ Caricate ${userLibraries.length} librerie da Google Sheets`);
        } else {
            console.log('⚠️ Foglio vuoto o solo headers');
            userLibraries = [];
            
            // Inizializza il foglio con gli headers se necessario
            if (!data.values || data.values.length === 0) {
                await initializeLibrariesSheet();
            }
        }

        saveLibrariesToLocalStorage();

    } catch (error) {
        console.error('❌ Errore caricamento librerie da Google Sheets:', error);
        showAlert('Errore caricamento librerie: ' + error.message, 'error');
        loadLibrariesFromLocalStorage();
    }
}

// Inizializza il foglio Librerie
async function initializeLibrariesSheet() {
    if (!accessToken) return;

    try {
        console.log('🔧 Inizializzazione foglio Librerie...');
        
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.LIBRARIES_SHEET_NAME}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [SHEETS_CONFIG.LIBRARIES_HEADERS]
            })
        });

        if (response.ok) {
            console.log('✅ Foglio Librerie inizializzato');
        } else {
            const errorData = await response.json();
            console.error('❌ Errore inizializzazione:', errorData);
        }
    } catch (error) {
        console.error('❌ Errore inizializzazione foglio Librerie:', error);
    }
}

// Carica da localStorage
function loadLibrariesFromLocalStorage() {
    if (currentUser) {
        const saved = localStorage.getItem('userLibraries_' + currentUser.id);
        userLibraries = saved ? JSON.parse(saved) : [];
        console.log(`📱 Caricate ${userLibraries.length} librerie da localStorage`);
    }
}

// Salva su localStorage
function saveLibrariesToLocalStorage() {
    if (currentUser) {
        localStorage.setItem('userLibraries_' + currentUser.id, JSON.stringify(userLibraries));
        console.log('💾 Librerie salvate su localStorage');
    }
}

// Aggiungi nuova libreria
async function addLibrary() {
    const libraryName = document.getElementById('libraryName').value.trim();
    
    if (!libraryName) {
        showAlert('Inserisci il nome della libreria', 'error');
        return;
    }
    
    // Verifica se esiste già
    if (userLibraries.some(lib => lib.name.toLowerCase() === libraryName.toLowerCase())) {
        showAlert('Questa libreria esiste già', 'error');
        return;
    }
    
    const library = {
        userId: currentUser.id,
        name: libraryName,
        dateCreated: new Date().toLocaleDateString('it-IT')
    };
    
    // Aggiungi subito alla lista locale
    userLibraries.push(library);
    saveLibrariesToLocalStorage();
    updateLibraryDropdown();
    displayLibraries();
    
    document.getElementById('libraryName').value = '';
    showAlert('Libreria aggiunta localmente!', 'success');
    
    // Salva su Google Sheets se disponibile (in background)
    if (currentUser.authMethod === 'google' && accessToken) {
        console.log('🔄 Tentativo salvataggio su Google Sheets...');
        const saved = await saveLibraryToGoogleSheets(library);
        
        if (saved) {
            showAlert('Libreria sincronizzata con Google Sheets!', 'success');
        } else {
            showAlert('Libreria salvata solo localmente. Errore sincronizzazione Google Sheets.', 'info');
        }
    }
}

// Salva libreria su Google Sheets
async function saveLibraryToGoogleSheets(library) {
    if (!accessToken) {
        console.log('❌ Token non disponibile');
        return false;
    }

    try {
        const libraryRow = [
            library.userId,
            library.name,
            library.dateCreated
        ];
        
        console.log('📤 Invio libreria a Google Sheets:', libraryRow);
        
        const response = await fetch(`${GOOGLE_APIS.LIBRARIES_WRITE}?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [libraryRow]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Errore risposta API:', errorData);
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                showAlert('Sessione scaduta, riprova', 'error');
                return false;
            }
            
            if (response.status === 404) {
                showAlert('Foglio "Librerie" non trovato. Crealo manualmente su Google Sheets', 'error');
                return false;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        console.log('✅ Libreria salvata su Google Sheets:', library.name);
        return true;

    } catch (error) {
        console.error('❌ Errore salvataggio libreria:', error);
        showAlert('Errore nel salvataggio su Google Sheets: ' + error.message, 'error');
        return false;
    }
}

// Elimina libreria
async function deleteLibrary(libraryName) {
    // Controlla se ci sono libri in questa libreria
    const booksInLibrary = books.filter(book => book.shelf === libraryName);
    
    if (booksInLibrary.length > 0) {
        if (!confirm(`Ci sono ${booksInLibrary.length} libri in questa libreria. Eliminandola, dovrai riassegnare i libri. Continuare?`)) {
            return;
        }
    } else {
        if (!confirm(`Sei sicuro di voler eliminare la libreria "${libraryName}"?`)) {
            return;
        }
    }
    
    // Rimuovi dalla lista locale
    userLibraries = userLibraries.filter(lib => lib.name !== libraryName);
    
    // Elimina da Google Sheets se disponibile
    if (currentUser.authMethod === 'google' && accessToken) {
        await deleteLibraryFromGoogleSheets(libraryName);
    }
    
    saveLibrariesToLocalStorage();
    updateLibraryDropdown();
    displayLibraries();
    
    showAlert('Libreria eliminata', 'success');
}

// Elimina libreria da Google Sheets
async function deleteLibraryFromGoogleSheets(libraryName) {
    if (!accessToken) return false;

    try {
        console.log('🗑️ Ricerca libreria da eliminare:', libraryName);
        
        // Prima trova la riga della libreria
        const rowIndex = await findLibraryRowInSheet(libraryName);
        
        if (rowIndex === -1) {
            console.log('⚠️ Libreria non trovata su Google Sheets');
            return true; // Non è un errore se non esiste
        }

        console.log('📍 Libreria trovata alla riga:', rowIndex);

        // Elimina la riga usando batchUpdate
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
                            sheetId: await getLibrariesSheetId(),
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1, // 0-based
                            endIndex: rowIndex
                        }
                    }
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Errore eliminazione:', errorData);
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        console.log('✅ Libreria eliminata da Google Sheets');
        return true;

    } catch (error) {
        console.error('❌ Errore eliminazione libreria da Google Sheets:', error);
        showAlert('Libreria eliminata localmente ma errore su Google Sheets', 'info');
        return false;
    }
}

// Trova l'indice della riga di una libreria nel foglio
async function findLibraryRowInSheet(libraryName) {
    try {
        const response = await fetch(`${GOOGLE_APIS.LIBRARIES_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
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

        // Cerca la libreria per nome e user ID
        for (let i = 1; i < data.values.length; i++) {
            if (data.values[i][0] === currentUser.id && data.values[i][1] === libraryName) {
                return i + 1; // 1-based index per Google Sheets
            }
        }

        return -1; // Non trovata

    } catch (error) {
        console.error('❌ Errore ricerca libreria nel foglio:', error);
        return -1;
    }
}

// Ottieni l'ID del foglio "Librerie"
async function getLibrariesSheetId() {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Trova il foglio "Librerie"
        const librariesSheet = data.sheets.find(sheet => 
            sheet.properties.title === SHEETS_CONFIG.LIBRARIES_SHEET_NAME
        );

        if (!librariesSheet) {
            console.error('❌ Foglio "Librerie" non trovato');
            return 0; // Default al primo foglio
        }

        console.log('📋 Sheet ID trovato:', librariesSheet.properties.sheetId);
        return librariesSheet.properties.sheetId;

    } catch (error) {
        console.error('❌ Errore recupero Sheet ID:', error);
        return 0; // Default al primo foglio
    }
}

// Visualizza librerie
function displayLibraries() {
    const librariesList = document.getElementById('librariesList');
    
    if (!librariesList) return;
    
    if (userLibraries.length === 0) {
        librariesList.innerHTML = `
            <div class="empty-state">
                <div class="icon">📚</div>
                <h3>Nessuna libreria configurata</h3>
                <p>Aggiungi le tue librerie per organizzare al meglio i tuoi libri!</p>
            </div>
        `;
        return;
    }
    
    librariesList.innerHTML = userLibraries.map(library => {
        const booksCount = books.filter(b => b.shelf === library.name).length;
        return `
            <div class="library-card">
                <div class="library-info">
                    <h3>📚 ${library.name}</h3>
                    <p>Aggiunta il: ${library.dateCreated}</p>
                    <p>Libri: ${booksCount}</p>
                </div>
                <button class="delete-btn" onclick="deleteLibrary('${library.name.replace(/'/g, "\\'")}')">Elimina</button>
            </div>
        `;
    }).join('');
}

// Aggiorna dropdown scaffale
function updateLibraryDropdown() {
    const shelfSelect = document.getElementById('shelf');
    
    if (!shelfSelect) return;
    
    // Salva il valore corrente
    const currentValue = shelfSelect.value;
    
    // Ricrea le opzioni
    shelfSelect.innerHTML = '<option value="">Seleziona libreria</option>';
    
    userLibraries.forEach(library => {
        const option = document.createElement('option');
        option.value = library.name;
        option.textContent = library.name;
        shelfSelect.appendChild(option);
    });
    
    // Opzione per aggiungere nuova libreria
    const addNewOption = document.createElement('option');
    addNewOption.value = '__ADD_NEW__';
    addNewOption.textContent = '➕ Aggiungi nuova libreria...';
    shelfSelect.appendChild(addNewOption);
    
    // Ripristina il valore se esisteva
    if (currentValue && userLibraries.some(lib => lib.name === currentValue)) {
        shelfSelect.value = currentValue;
    }
    
    console.log('📋 Dropdown librerie aggiornato con', userLibraries.length, 'librerie');
}

// Gestisce la selezione dello scaffale
function handleShelfSelection() {
    const shelfSelect = document.getElementById('shelf');
    
    if (shelfSelect.value === '__ADD_NEW__') {
        const libraryName = prompt('Inserisci il nome della nuova libreria:');
        
        if (libraryName && libraryName.trim()) {
            const trimmedName = libraryName.trim();
            
            // Verifica se esiste già
            if (userLibraries.some(lib => lib.name.toLowerCase() === trimmedName.toLowerCase())) {
                showAlert('Questa libreria esiste già', 'error');
                shelfSelect.value = trimmedName;
                return;
            }
            
            // Aggiungi la nuova libreria
            const library = {
                userId: currentUser.id,
                name: trimmedName,
                dateCreated: new Date().toLocaleDateString('it-IT')
            };
            
            userLibraries.push(library);
            
            // Salva
            saveLibrariesToLocalStorage();
            
            if (currentUser.authMethod === 'google' && accessToken) {
                saveLibraryToGoogleSheets(library).then(saved => {
                    if (saved) {
                        showAlert('Libreria aggiunta e sincronizzata!', 'success');
                    } else {
                        showAlert('Libreria aggiunta localmente', 'info');
                    }
                });
            }
            
            // Aggiorna dropdown
            updateLibraryDropdown();
            shelfSelect.value = trimmedName;
            
            showAlert('Libreria aggiunta!', 'success');
        } else {
            shelfSelect.value = '';
        }
    }
}
