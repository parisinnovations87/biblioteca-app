// ========================================
// BIBLIOTECA DOMESTICA - APP PRINCIPALE
// Versione con Google OAuth 2.0 e Sheets API
// ========================================

// Variabili globali
let currentUser = null;
let books = [];
let isScanning = false;
let scannerActive = false;
let cameraStream = null;
let isEditMode = false;
let editingBookId = null;

// Inizializzazione app
document.addEventListener('DOMContentLoaded', function() {
    console.log('📚 Biblioteca Domestica - Inizializzazione...');
    
    initializeApp();
    setupBarcodeScannerButton();
    
    // Controlla se l'utente è già loggato
    checkExistingLogin();
});

function initializeApp() {
    // Inizializza filtri di ricerca
    initializeSearchFilters();
    
    // Mostra configurazione in sviluppo
    if (DEV_MODE) {
        console.log('🔧 Modalità sviluppo attiva');
        showConfigurationStatus();
    }
}

function checkExistingLogin() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log(`👤 Utente trovato: ${currentUser.name} (${currentUser.authMethod || 'locale'})`);
            
            // Se l'utente era autenticato con Google, verifica il token
            if (currentUser.authMethod === 'google') {
                const tokenExpiry = localStorage.getItem('google_token_expiry');
                if (!tokenExpiry || Date.now() >= parseInt(tokenExpiry)) {
                    console.log('🔑 Token Google scaduto');
                    showAlert('Sessione Google scaduta. Accedi nuovamente.', 'info');
                    signOut();
                    return;
                }
                accessToken = localStorage.getItem('google_access_token');
            }
            
            showApp();
            loadBooks();
            
        } catch (error) {
            console.error('❌ Errore caricamento utente salvato:', error);
            localStorage.removeItem('currentUser');
        }
    }
}

// === AUTENTICAZIONE ===

// Login semplice (fallback)
function simpleSignIn() {
    console.log('🔍 simpleSignIn chiamata');
    console.log('Nome:', document.getElementById('userNameInput').value);
    console.log('Email:', document.getElementById('userEmailInput').value);
    const userName = document.getElementById('userNameInput').value.trim();
    const userEmail = document.getElementById('userEmailInput').value.trim();
    
    if (!userName) {
        showAlert('Inserisci il tuo nome per continuare', 'error');
        return;
    }
    
    if (!userEmail) {
        showAlert('Inserisci la tua email per continuare', 'error');
        return;
    }
    
    currentUser = {
        id: 'local_' + Date.now().toString(),
        name: userName,
        email: userEmail,
        avatar: generateAvatarUrl(userName),
        loginDate: new Date().toISOString(),
        authMethod: 'local'
    };
    
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    showApp();
    loadBooks();
    showAlert(`Benvenuto ${currentUser.name}!`, 'success');
}

function generateAvatarUrl(name) {
    const initials = name.split(' ').map(word => word.charAt(0)).join('').toUpperCase();
    const colors = ['4285f4', '34a853', 'fbbc05', 'ea4335', '9c27b0', '00bcd4'];
    const colorIndex = name.length % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors[colorIndex]}&color=fff&size=128`;
}

function signOut() {
    if (!confirm('Sei sicuro di voler uscire?')) {
        return;
    }
    
    // Ferma lo scanner se attivo
    if (scannerActive) {
        stopScanner();
    }
    
    // Logout specifico per metodo di autenticazione
    if (currentUser && currentUser.authMethod === 'google') {
        signOutGoogle();
    }
    
    // Pulisci i dati globali
    currentUser = null;
    books = [];
    localStorage.removeItem('currentUser');
    
    hideApp();
    clearForm();
    clearLoginForm();
    hideFallbackLogin();
    
    showAlert('Logout effettuato con successo', 'info');
}

function clearLoginForm() {
    const inputs = ['userNameInput', 'userEmailInput'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}

function showApp() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    
    // Aggiorna informazioni utente
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').src = currentUser.avatar;
    
    const authMethod = document.getElementById('authMethod');
    if (authMethod) {
        authMethod.textContent = currentUser.authMethod === 'google' ? 
            '🔐 Account Google' : '📱 Account Locale';
    }
    
    // Imposta stato sincronizzazione iniziale
    if (currentUser.authMethod === 'google') {
        setSyncStatus('success', 'Google Sheets');
    } else {
        setSyncStatus('offline', 'Solo locale');
    }
}

function hideApp() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
}

// === GESTIONE TAB ===

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    switch(tabName) {
        case 'library':
            displayBooks();
            updateBookCount();
            break;
        case 'search':
            updateSearchFilters();
            break;
    }
}

// === SCANNER BARCODE ===

const quaggaConfig = {
    inputStream: {
        name: "Live",
        type: "LiveStream",
        constraints: {
            width: 640,
            height: 480,
            facingMode: "environment"
        }
    },
    locator: {
        patchSize: "medium",
        halfSample: true
    },
    numOfWorkers: 2,
    frequency: 10,
    decoder: {
        readers: [
            "code_128_reader",
            "ean_reader",
            "ean_8_reader",
            "code_39_reader",
            "upc_reader",
            "upc_e_reader"
        ]
    },
    locate: true
};

function setupBarcodeScannerButton() {
    setTimeout(() => {
        const scanBtn = document.querySelector('.scan-btn');
        if (scanBtn) {
            scanBtn.onclick = startScanner;
        }
    }, 1000);
}

function startScanner() {
    if (scannerActive) {
        stopScanner();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert('Il browser non supporta l\'accesso alla fotocamera', 'error');
        showTestScanner();
        return;
    }

    if (typeof Quagga === 'undefined') {
        console.warn('QuaggaJS non caricato correttamente');
        showTestScanner();
        return;
    }

    const scanner = document.getElementById('scanner');
    const scanBtn = document.querySelector('.scan-btn');
    
    scanner.style.display = 'block';
    scanner.innerHTML = `
        <div style="text-align: center; padding: 20px; background: #f8f9ff; border-radius: 15px;">
            <div class="scanner-status">
                <p>Inizializzazione fotocamera...</p>
                <div class="loading"></div>
            </div>
            <div id="scanner-viewport" style="margin-top: 15px; position: relative;"></div>
            <div style="margin-top: 15px;">
                <button onclick="stopScanner()" class="stop-scanner-btn">Ferma Scanner</button>
                <button onclick="showTestScanner()" style="background: #17a2b8; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; margin-left: 10px;">
                    Usa Codici Test
                </button>
            </div>
        </div>
    `;

    scanBtn.innerHTML = 'Stop Scanner';
    initializeQuaggaScanner();
}

async function initializeQuaggaScanner() {
    try {
        quaggaConfig.inputStream.target = document.querySelector('#scanner-viewport');
        
        Quagga.init(quaggaConfig, function(err) {
            if (err) {
                console.error('Errore Quagga:', err);
                showTestScanner();
                return;
            }

            scannerActive = true;
            Quagga.start();
            
            document.querySelector('.scanner-status').innerHTML = `
                <p style="color: #28a745; font-weight: 500;">Scanner attivo - Inquadra un codice a barre</p>
            `;

            Quagga.onDetected(onBarcodeDetected);
        });

    } catch (error) {
        console.error('Errore scanner:', error);
        showTestScanner();
    }
}

function onBarcodeDetected(result) {
    const code = result.codeResult.code;
    
    if (code && code.length >= 8) {
        playBeep();
        document.getElementById('barcodeInput').value = code;
        stopScanner();
        showAlert(`Codice rilevato: ${code}`, 'success');
        
        setTimeout(() => {
            searchByBarcode();
        }, 1000);
    }
}

function stopScanner() {
    if (scannerActive) {
        Quagga.stop();
        Quagga.offDetected(onBarcodeDetected);
        scannerActive = false;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    document.getElementById('scanner').style.display = 'none';
    
    const scanBtn = document.querySelector('.scan-btn');
    scanBtn.innerHTML = 'Scansiona';
    scanBtn.onclick = startScanner;

    isScanning = false;
}

function showTestScanner() {
    const scanner = document.getElementById('scanner');
    scanner.style.display = 'block';
    scanner.innerHTML = `
        <div style="text-align: center; padding: 30px; background: #e3f2fd; border-radius: 15px;">
            <h3 style="color: #1976d2; margin-bottom: 20px;">Test Scanner Barcode</h3>
            <p style="margin-bottom: 20px;">Clicca su un codice per testare la ricerca:</p>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 20px;">
                <button onclick="testBarcode('9788804639824')" class="test-barcode-btn">Libro Esempio 1</button>
                <button onclick="testBarcode('9780142437172')" class="test-barcode-btn">Libro Esempio 2</button>
                <button onclick="testBarcode('9788817050685')" class="test-barcode-btn">Libro Esempio 3</button>
            </div>
            <button onclick="stopScanner()" class="stop-scanner-btn">Chiudi Test</button>
        </div>
    `;
}

function testBarcode(code) {
    document.getElementById('barcodeInput').value = code;
    stopScanner();
    showAlert(`Codice di test: ${code}`, 'success');
    setTimeout(() => {
        searchByBarcode();
    }, 1000);
}

function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Audio non disponibile');
    }
}

// === RICERCA LIBRI ONLINE ===

async function searchByBarcode() {
    const barcode = document.getElementById('barcodeInput').value.trim();
    
    if (!barcode) {
        showAlert('Inserisci un codice a barre o ISBN', 'error');
        return;
    }
    
    const searchBtn = document.querySelector('.search-btn');
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<span class="loading"></span> Ricerca...';
    searchBtn.disabled = true;
    
    try {
        let bookFound = await searchOpenLibrary(barcode);
        
        if (!bookFound) {
            bookFound = await searchGoogleBooks(barcode);
        }
        
        if (!bookFound) {
            showAlert('Libro non trovato nei database online. Inserisci i dati manualmente.', 'error');
        }
        
    } catch (error) {
        console.error('Errore nella ricerca:', error);
        showAlert('Errore durante la ricerca. Verifica la connessione internet.', 'error');
    } finally {
        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;
    }
}

async function searchOpenLibrary(isbn) {
    try {
        const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        const data = await response.json();
        
        const bookKey = `ISBN:${isbn}`;
        if (data[bookKey]) {
            const book = data[bookKey];
            fillBookFormFromOpenLibrary(book, isbn);
            showAlert('Dati del libro trovati su Open Library!', 'success');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Errore Open Library:', error);
        return false;
    }
}

async function searchGoogleBooks(isbn) {
    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const book = data.items[0].volumeInfo;
            fillBookFormFromGoogle(book, isbn);
            showAlert('Dati del libro trovati su Google Books!', 'success');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Errore Google Books:', error);
        return false;
    }
}

function fillBookFormFromOpenLibrary(book, isbn) {
    document.getElementById('title').value = book.title || '';
    document.getElementById('author').value = book.authors ? book.authors.map(a => a.name).join(', ') : '';
    document.getElementById('isbn').value = isbn;
    document.getElementById('publisher').value = book.publishers ? book.publishers[0].name : '';
    document.getElementById('year').value = book.publish_date ? extractYear(book.publish_date) : '';
}

function fillBookFormFromGoogle(book, isbn) {
    document.getElementById('title').value = book.title || '';
    document.getElementById('author').value = book.authors ? book.authors.join(', ') : '';
    document.getElementById('isbn').value = isbn;
    document.getElementById('publisher').value = book.publisher || '';
    document.getElementById('year').value = book.publishedDate ? book.publishedDate.split('-')[0] : '';
}

function extractYear(dateString) {
    const match = dateString.match(/\d{4}/);
    return match ? match[0] : '';
}

// === GESTIONE LIBRI ===

async function addBook() {
    const title = document.getElementById('title').value.trim();
    const genre = document.getElementById('genre').value;
    const shelf = document.getElementById('shelf').value.trim();
    
    if (!title || !genre || !shelf) {
        showAlert('Compila i campi obbligatori: Titolo, Genere e Scaffale', 'error');
        return;
    }
    
    const bookData = {
        title: title,
        author: document.getElementById('author').value.trim(),
        isbn: document.getElementById('isbn').value.trim(),
        publisher: document.getElementById('publisher').value.trim(),
        year: document.getElementById('year').value,
        genre: genre,
        shelf: shelf,
        position: document.getElementById('position').value.trim(),
        condition: document.getElementById('condition').value,
        notes: document.getElementById('notes').value.trim(),
        addedDate: new Date().toLocaleDateString('it-IT'),
        userId: currentUser.id,
        userName: currentUser.name
    };
    
    if (isEditMode && editingBookId) {
        const bookIndex = books.findIndex(b => b.id === editingBookId);
        if (bookIndex !== -1) {
            bookData.id = editingBookId;
            bookData.addedDate = books[bookIndex].addedDate;
            books[bookIndex] = bookData;
            
            // Salva su Google Sheets se disponibile
            if (currentUser.authMethod === 'google') {
                await updateBookInGoogleSheets(bookData);
            }
            
            showAlert('Libro modificato con successo!', 'success');
        }
        resetEditMode();
    } else {
        bookData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        books.push(bookData);
        
        // Salva su Google Sheets se disponibile
        if (currentUser.authMethod === 'google') {
            await saveBookToGoogleSheets(bookData);
        }
        
        showAlert('Libro aggiunto alla biblioteca!', 'success');
    }
    
    saveBooks();
    clearForm();
    updateBookCount();
    displayBooks();
}

function editBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    
    showTab('add');
    document.querySelector('.tab[onclick="showTab(\'add\')"]').classList.add('active');
    
    document.getElementById('title').value = book.title || '';
    document.getElementById('author').value = book.author || '';
    document.getElementById('isbn').value = book.isbn || '';
    document.getElementById('publisher').value = book.publisher || '';
    document.getElementById('year').value = book.year || '';
    document.getElementById('genre').value = book.genre || '';
    document.getElementById('shelf').value = book.shelf || '';
    document.getElementById('position').value = book.position || '';
    document.getElementById('condition').value = book.condition || '';
    document.getElementById('notes').value = book.notes || '';
    
    isEditMode = true;
    editingBookId = bookId;
    document.getElementById('addBookBtn').innerHTML = 'Salva Modifiche';
    
    showAlert('Modalità modifica attivata', 'info');
}

function resetEditMode() {
    isEditMode = false;
    editingBookId = null;
    document.getElementById('addBookBtn').innerHTML = '📚 Aggiungi alla Biblioteca';
}

async function deleteBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    
    if (confirm(`Sei sicuro di voler eliminare "${book.title}" dalla tua biblioteca?`)) {
        books = books.filter(b => b.id !== bookId);
        
        // Elimina da Google Sheets se disponibile
        if (currentUser.authMethod === 'google') {
            await deleteBookFromGoogleSheets(bookId);
        }
        
        saveBooks();
        displayBooks();
        updateBookCount();
        showAlert('Libro eliminato dalla biblioteca', 'success');
    }
}

// === VISUALIZZAZIONE LIBRI ===

function displayBooks(booksToShow = books) {
    const booksList = document.getElementById('booksList');
    
    if (booksToShow.length === 0) {
        booksList.innerHTML = `
            <div class="empty-state">
                <div class="icon">📚</div>
                <h3>Nessun libro nella biblioteca</h3>
                <p>Inizia ad aggiungere i tuoi libri preferiti!</p>
            </div>
        `;
        return;
    }
    
    booksList.innerHTML = booksToShow.map(book => `
        <div class="book-card">
            <div class="book-info">
                <div class="book-cover">
                    ${getGenreIcon(book.genre)}
                </div>
                <div class="book-details">
                    <h3>${book.title}</h3>
                    <p><strong>Autore:</strong> ${book.author || 'Non specificato'}</p>
                    <p><strong>Genere:</strong> ${book.genre}</p>
                    ${book.year ? `<p><strong>Anno:</strong> ${book.year}</p>` : ''}
                    ${book.publisher ? `<p><strong>Editore:</strong> ${book.publisher}</p>` : ''}
                    <p><strong>Posizione:</strong> ${book.shelf}${book.position ? ' - ' + book.position : ''}</p>
                    ${book.condition ? `<p><strong>Condizioni:</strong> ${book.condition}</p>` : ''}
                    <p><strong>Aggiunto il:</strong> ${book.addedDate}</p>
                    ${book.notes ? `<p><strong>Note:</strong> ${book.notes}</p>` : ''}
                </div>
                <div class="book-actions">
                    <button class="edit-btn" onclick="editBook('${book.id}')">Modifica</button>
                    <button class="delete-btn" onclick="deleteBook('${book.id}')">Elimina</button>
                </div>
            </div>
        </div>
    `).join('');
}

function getGenreIcon(genre) {
    const icons = {
        'Narrativa': '📖',
        'Saggistica': '📄',
        'Giallo/Thriller': '🔍',
        'Fantascienza': '🚀',
        'Fantasy': '🧙‍♂️',
        'Romance': '💕',
        'Biografia': '👤',
        'Storia': '📜',
        'Cucina': '👨‍🍳',
        'Arte': '🎨',
        'Scienze': '🔬',
        'Tecnologia': '💻',
        'Viaggi': '✈️',
        'Religione': '📿',
        'Filosofia': '🤔',
        'Bambini': '🧸',
        'Fumetti': '💭'
    };
    return icons[genre] || '📚';
}

// === RICERCA E FILTRI ===

function searchBooks() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const genreFilter = document.getElementById('filterGenre').value;
    const shelfFilter = document.getElementById('filterShelf').value;
    const searchResults = document.getElementById('searchResults');
    
    let filteredBooks = books;
    
    if (query) {
        filteredBooks = filteredBooks.filter(book => 
            book.title.toLowerCase().includes(query) ||
            (book.author && book.author.toLowerCase().includes(query)) ||
            book.genre.toLowerCase().includes(query) ||
            book.shelf.toLowerCase().includes(query) ||
            (book.notes && book.notes.toLowerCase().includes(query))
        );
    }
    
    if (genreFilter) {
        filteredBooks = filteredBooks.filter(book => book.genre === genreFilter);
    }
    
    if (shelfFilter) {
        filteredBooks = filteredBooks.filter(book => book.shelf === shelfFilter);
    }
    
    displayBooksInContainer(filteredBooks, 'searchResults');
}

function displayBooksInContainer(booksToShow, containerId) {
    const container = document.getElementById(containerId);
    
    if (booksToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔍</div>
                <h3>Nessun risultato trovato</h3>
                <p>Prova con altri termini di ricerca</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = booksToShow.map(book => `
        <div class="book-card">
            <div class="book-info">
                <div class="book-cover">
                    ${getGenreIcon(book.genre)}
                </div>
                <div class="book-details">
                    <h3>${book.title}</h3>
                    <p><strong>Autore:</strong> ${book.author || 'Non specificato'}</p>
                    <p><strong>Genere:</strong> ${book.genre}</p>
                    <p><strong>Posizione:</strong> ${book.shelf}${book.position ? ' - ' + book.position : ''}</p>
                    ${book.notes ? `<p><strong>Note:</strong> ${book.notes}</p>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// === ORDINAMENTO ===

function sortBooks() {
    const sortBy = document.getElementById('sortSelect').value;
    
    books.sort((a, b) => {
        switch(sortBy) {
            case 'title':
                return a.title.localeCompare(b.title, 'it');
            case 'author':
                return (a.author || '').localeCompare(b.author || '', 'it');
            case 'genre':
                return a.genre.localeCompare(b.genre, 'it');
            case 'date':
                return new Date(b.addedDate.split('/').reverse().join('-')) - 
                       new Date(a.addedDate.split('/').reverse().join('-'));
            case 'shelf':
                return a.shelf.localeCompare(b.shelf, 'it');
            default:
                return 0;
        }
    });
    
    displayBooks();
    saveBooks();
}

// === GESTIONE DATI ===

function loadBooks() {
    if (currentUser.authMethod === 'google' && isConfigurationValid()) {
        loadBooksFromGoogleSheets();
    } else {
        loadBooksFromLocalStorage();
    }
}

function loadBooksFromLocalStorage() {
    if (currentUser) {
        const savedBooks = localStorage.getItem('libraryBooks_' + currentUser.id);
        books = savedBooks ? JSON.parse(savedBooks) : [];
        updateBookCount();
        displayBooks();
        
        if (currentUser.authMethod === 'local') {
            setSyncStatus('offline', 'Solo locale');
        }
    }
}

function saveBooks() {
    if (currentUser) {
        localStorage.setItem('libraryBooks_' + currentUser.id, JSON.stringify(books));
    }
}

// === UTILITY ===

function clearForm() {
    const inputs = ['barcodeInput', 'title', 'author', 'isbn', 'publisher', 'year', 'shelf', 'position', 'notes'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    
    const selects = ['genre', 'condition'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.selectedIndex = 0;
    });
    
    resetEditMode();
}

function updateBookCount() {
    const countElement = document.getElementById('bookCount');
    if (countElement) {
        const count = books.length;
        countElement.textContent = count === 1 ? '1 libro' : `${count} libri`;
    }
}

function initializeSearchFilters() {
    // Sarà popolato quando i libri vengono caricati
}

function updateSearchFilters() {
    const genreFilter = document.getElementById('filterGenre');
    const shelfFilter = document.getElementById('filterShelf');
    
    if (!genreFilter || !shelfFilter) return;
    
    const genres = [...new Set(books.map(book => book.genre))].sort();
    genreFilter.innerHTML = '<option value="">Tutti i generi</option>';
    genres.forEach(genre => {
        genreFilter.innerHTML += `<option value="${genre}">${genre}</option>`;
    });
    
    const shelves = [...new Set(books.map(book => book.shelf))].sort();
    shelfFilter.innerHTML = '<option value="">Tutti gli scaffali</option>';
    shelves.forEach(shelf => {
        shelfFilter.innerHTML += `<option value="${shelf}">${shelf}</option>`;
    });
}

function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    
    if (!alertContainer) {
        console.log(`${type.toUpperCase()}: ${message}`);
        return;
    }
    
    const existingAlerts = alertContainer.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
    
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// === CONFIGURAZIONE STATUS ===

function showConfigurationStatus() {
    console.log('🔧 Status Configurazione:');
    console.log(`- Google Client ID: ${isConfigurationValid() ? '✅ Configurato' : '❌ Mancante'}`);
    console.log(`- Google Sheet ID: ${SHEETS_CONFIG.SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE' ? '✅ Configurato' : '❌ Mancante'}`);
    console.log(`- Ambiente: ${DEV_MODE ? 'Sviluppo' : 'Produzione'}`);
}