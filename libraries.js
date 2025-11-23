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
        loadLibrariesFromLocalStorage();
        return;
    }

    try {
        const response = await fetch(`${GOOGLE_APIS.LIBRARIES_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.values && data.values.length > 1) {
            const headers = data.values[0];
            const rows = data.values.slice(1);
            
            // Filtra solo le librerie dell'utente corrente
            userLibraries = rows
                .filter(row => row[0] === currentUser.id)
                .map(row => ({
                    userId: row[0],
                    name: row[1],
                    dateCreated: row[2]
                }));
            
            console.log(`📚 Caricate ${userLibraries.length} librerie da Google Sheets`);
        } else {
            userLibraries = [];
            
            // Inizializza il foglio con gli headers se necessario
            if (!data.values || data.values.length === 0) {
                await initializeLibrariesSheet();
            }
        }

        saveLibrariesToLocalStorage();

    } catch (error) {
        console.error('❌ Errore caricamento librerie da Google Sheets:', error);
        loadLibrariesFromLocalStorage();
    }
}

// Inizializza il foglio Librerie
async function initializeLibrariesSheet() {
    if (!accessToken) return;

    try {
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
    }
}

// Salva su localStorage
function saveLibrariesToLocalStorage() {
    if (currentUser) {
        localStorage.setItem('userLibraries_' + currentUser.id, JSON.stringify(userLibraries));
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
    
    userLibraries.push(library);
    
    // Salva su Google Sheets se disponibile
    if (currentUser.authMethod === 'google' && accessToken) {
        await saveLibraryToGoogleSheets(library);
    }
    
    saveLibrariesToLocalStorage();
    updateLibraryDropdown();
    displayLibraries();
    
    document.getElementById('libraryName').value = '';
    showAlert('Libreria aggiunta con successo!', 'success');
}

// Salva libreria su Google Sheets
async function saveLibraryToGoogleSheets(library) {
    if (!accessToken) return false;

    try {
        const libraryRow = [
            library.userId,
            library.name,
            library.dateCreated
        ];
        
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
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Libreria salvata su Google Sheets:', library.name);
        return true;

    } catch (error) {
        console.error('❌ Errore salvataggio libreria:', error);
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
    
    userLibraries = userLibraries.filter(lib => lib.name !== libraryName);
    
    // TODO: Elimina da Google Sheets (implementazione futura se necessario)
    
    saveLibrariesToLocalStorage();
    updateLibraryDropdown();
    displayLibraries();
    
    showAlert('Libreria eliminata', 'success');
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
                <p>Aggiungi le tue librerie per organizzare meglio i libri!</p>
            </div>
        `;
        return;
    }
    
    librariesList.innerHTML = userLibraries.map(library => `
        <div class="library-card">
            <div class="library-info">
                <h3>📚 ${library.name}</h3>
                <p>Aggiunta il: ${library.dateCreated}</p>
                <p>Libri: ${books.filter(b => b.shelf === library.name).length}</p>
            </div>
            <button class="delete-btn" onclick="deleteLibrary('${library.name}')">Elimina</button>
        </div>
    `).join('');
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
            if (currentUser.authMethod === 'google' && accessToken) {
                saveLibraryToGoogleSheets(library);
            }
            saveLibrariesToLocalStorage();
            
            // Aggiorna dropdown
            updateLibraryDropdown();
            shelfSelect.value = trimmedName;
            
            showAlert('Libreria aggiunta!', 'success');
        } else {
            shelfSelect.value = '';
        }
    }
}
