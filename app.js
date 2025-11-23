// ========================================
// BIBLIOTECA DOMESTICA - APP PRINCIPALE
// Versione con Google OAuth 2.0 e Sheets API
// Scanner con ZXing + Fix login Android
// ========================================

// Variabili globali
let currentUser = null;
let books = [];
let codeReader = null;
let selectedDeviceId = null;
let scannerActive = false;
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
    if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
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
                    console.log('🔒 Token Google scaduto');
                    showAlert('Sessione Google scaduta. Accedi nuovamente.', 'info');
                    signOut();
                    return;
                }
                if (typeof accessToken !== 'undefined') {
                    accessToken = localStorage.getItem('google_access_token');
                }
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
    console.log('🔐 simpleSignIn chiamata');
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
    if (currentUser && currentUser.authMethod === 'google' && typeof signOutGoogle === 'function') {
        signOutGoogle();
    }
    
    // Pulisci i dati globali
    currentUser = null;
    books = [];
    localStorage.removeItem('currentUser');
    
    hideApp();
    clearForm();
    clearLoginForm();
    if (typeof hideFallbackLogin === 'function') {
        hideFallbackLogin();
    }
    
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

    // Carica le librerie dell'utente
    loadUserLibraries();
}

function hideApp() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
}

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
        case 'libraries':
            displayLibraries();
            break;
    }
}

// ========================================
// SCANNER BARCODE CON QUAGGA
// Sostituisci la sezione scanner in app.js con questo codice
// ========================================

function setupBarcodeScannerButton() {
    setTimeout(() => {
        const scanBtn = document.querySelector('.scan-btn');
        if (scanBtn) {
            scanBtn.onclick = function(e) {
                e.preventDefault();
                startScanner();
            };
            console.log('✅ Pulsante scanner configurato');
        }
    }, 1000);
}

async function startScanner() {
    console.log('🎬 startScanner chiamata');
    
    if (scannerActive) {
        console.log('ℹ️ Scanner già attivo, fermando...');
        stopScanner();
        return;
    }

    const scanner = document.getElementById('scanner');
    const scanBtn = document.querySelector('.scan-btn');
    
    // Mostra interfaccia richiesta permessi
    scanner.style.display = 'block';
    scanner.innerHTML = `
        <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #f8f9ff, #e3f2fd); border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="color: #667eea; margin-bottom: 20px;">📷 Accesso Fotocamera</h3>
            <p style="color: #666; margin-bottom: 25px; line-height: 1.6;">
                Per usare lo scanner, devi consentire l'accesso alla fotocamera.<br>
                Clicca sul pulsante e seleziona <strong>"Consenti"</strong>.
            </p>
            <button id="requestPermissionBtn" style="
                background: linear-gradient(45deg, #28a745, #20c997);
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 12px;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
                margin-bottom: 15px;
            ">
                🔓 Richiedi Permesso Fotocamera
            </button>
            <br>
            <button onclick="stopScanner()" class="stop-scanner-btn" style="margin-top: 10px;">Annulla</button>
            
            <div id="permission-status" style="margin-top: 20px; padding: 15px; background: white; border-radius: 10px; display: none;">
                <p style="color: #666; margin: 0;"></p>
            </div>
        </div>
    `;

    const requestBtn = document.getElementById('requestPermissionBtn');
    const statusDiv = document.getElementById('permission-status');
    
    requestBtn.onclick = async function() {
        console.log('🔓 Richiesta permessi...');
        
        requestBtn.disabled = true;
        requestBtn.innerHTML = '<div class="loading"></div> Attendere...';
        requestBtn.style.opacity = '0.7';
        
        try {
            // Test permessi
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            console.log('✅ Permesso ottenuto!');
            stream.getTracks().forEach(track => track.stop());
            
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#d4edda';
            statusDiv.querySelector('p').innerHTML = '✅ <strong>Permesso concesso!</strong> Avvio scanner...';
            statusDiv.querySelector('p').style.color = '#155724';
            
            setTimeout(() => {
                initializeQuaggaScanner();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Permesso negato:', error);
            
            requestBtn.disabled = false;
            requestBtn.innerHTML = '🔓 Riprova';
            requestBtn.style.opacity = '1';
            
            let errorMsg = '';
            let solution = '';
            
            if (error.name === 'NotAllowedError') {
                errorMsg = '🚫 Permesso negato';
                solution = `
                    <strong style="color: #dc3545;">Il browser ha bloccato l'accesso.</strong><br><br>
                    
                    <div style="text-align: left; margin-top: 10px;">
                        <strong>Su Android/Mobile:</strong><br>
                        1. Tocca l'icona <strong>🔒</strong> nella barra indirizzi<br>
                        2. Tocca "Autorizzazioni" o "Impostazioni sito"<br>
                        3. Cambia "Fotocamera" da Blocca a Consenti<br>
                        4. Ricarica la pagina<br><br>
                        
                        <strong>Su PC/Desktop:</strong><br>
                        1. Clicca l'icona <strong>🔒</strong> nella barra indirizzi<br>
                        2. Clicca su "Fotocamera"<br>
                        3. Seleziona "Consenti"<br>
                        4. Ricarica con Ctrl+Shift+R
                    </div>
                `;
            } else if (error.name === 'NotFoundError') {
                errorMsg = '📷 Fotocamera non trovata';
                solution = 'Il dispositivo non ha una fotocamera disponibile.';
            } else {
                errorMsg = '❌ Errore: ' + error.name;
                solution = error.message;
            }
            
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#f8d7da';
            statusDiv.querySelector('p').innerHTML = `
                <strong>${errorMsg}</strong><br><br>
                ${solution}
            `;
            statusDiv.querySelector('p').style.color = '#721c24';
            statusDiv.querySelector('p').style.fontSize = '0.9rem';
        }
    };
    
    if (scanBtn) {
        scanBtn.innerHTML = 'ⓘ Chiudi';
    }
}

async function initializeQuaggaScanner() {
    const scanner = document.getElementById('scanner');
    
    scanner.innerHTML = `
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #f8f9ff, #e3f2fd); border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <div class="scanner-status">
                <p style="color: #667eea; font-weight: 600; font-size: 1.1rem; margin-bottom: 10px;">
                    📷 Inizializzazione scanner...
                </p>
                <div class="loading"></div>
            </div>
            <div id="scanner-container" style="margin-top: 20px; display: none;">
                <div id="interactive" class="viewport" style="position: relative; width: 100%; max-width: 640px; margin: 0 auto; background: #000; border-radius: 12px; overflow: hidden;">
                    <video style="width: 100%; height: auto; display: block;"></video>
                    <canvas class="drawingBuffer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
                </div>
                <p style="margin-top: 15px; color: white; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 20px; display: inline-block;">
                    🎯 Inquadra il codice a barre nel riquadro
                </p>
            </div>
            <button onclick="stopScanner()" class="stop-scanner-btn" style="margin-top: 20px;">❌ Chiudi Scanner</button>
        </div>
    `;

    try {
        // Verifica che Quagga sia caricato
        if (typeof Quagga === 'undefined') {
            throw new Error('Libreria Quagga non caricata. Ricarica la pagina.');
        }

        console.log('🎥 Inizializzazione Quagga...');
        
        const config = {
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#interactive'),
                constraints: {
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                    facingMode: "environment",
                    aspectRatio: { min: 1, max: 2 }
                },
                area: { // Area di scansione ridotta per migliori performance
                    top: "25%",
                    right: "10%",
                    left: "10%",
                    bottom: "25%"
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: navigator.hardwareConcurrency || 4,
            frequency: 10,
            decoder: {
                readers: [
                    "ean_reader",
                    "ean_8_reader",
                    "code_128_reader",
                    "code_39_reader",
                    "upc_reader",
                    "upc_e_reader"
                ],
                multiple: false
            },
            locate: true
        };

        Quagga.init(config, function(err) {
            if (err) {
                console.error('❌ Errore inizializzazione Quagga:', err);
                showAlert('Errore: ' + err.message, 'error');
                stopScanner();
                return;
            }
            
            console.log('✅ Quagga inizializzato');
            
            // Mostra il container dello scanner
            document.getElementById('scanner-container').style.display = 'block';
            
            const statusElement = document.querySelector('.scanner-status');
            if (statusElement) {
                statusElement.innerHTML = `
                    <p style="color: #28a745; font-weight: 600; font-size: 1.1rem;">
                        ✅ Scanner attivo
                    </p>
                    <p style="color: #666; font-size: 0.9rem;">
                        Inquadra il codice a barre
                    </p>
                `;
            }
            
            // Avvia lo scanner
            Quagga.start();
            scannerActive = true;
            
            console.log('✅ Scanner Quagga avviato');
        });

        // Gestisce la rilevazione del codice
        Quagga.onDetected(function(result) {
            if (result && result.codeResult && result.codeResult.code) {
                const code = result.codeResult.code;
                
                // Verifica validità del codice
                if (code && code.length >= 8 && /^[0-9]+$/.test(code)) {
                    console.log('✅ CODICE RILEVATO:', code);
                    handleBarcodeDetected(code);
                } else {
                    console.log('⚠️ Codice non valido ignorato:', code);
                }
            }
        });

        // Debug: mostra i tentativi di lettura (opzionale)
        Quagga.onProcessed(function(result) {
            const drawingCtx = Quagga.canvas.ctx.overlay;
            const drawingCanvas = Quagga.canvas.dom.overlay;

            if (result) {
                // Disegna i box di rilevamento
                if (result.boxes) {
                    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                    
                    result.boxes.filter(box => box !== result.box).forEach(box => {
                        Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {
                            color: "yellow",
                            lineWidth: 2
                        });
                    });
                }

                // Disegna il box principale se trovato
                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {
                        color: "lime",
                        lineWidth: 3
                    });
                }

                // Disegna la linea del codice
                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {
                        color: 'red',
                        lineWidth: 3
                    });
                }
            }
        });

    } catch (error) {
        console.error('❌ Errore inizializzazione:', error);
        showAlert('Errore: ' + error.message, 'error');
        stopScanner();
    }
}

function handleBarcodeDetected(code) {
    console.log('🎯 Gestione codice rilevato:', code);
    
    if (!code || code.length < 8) {
        console.log('❌ Codice non valido (troppo corto)');
        return;
    }
    
    // Evita letture multiple dello stesso codice
    if (document.getElementById('barcodeInput').value === code) {
        console.log('⚠️ Codice già inserito, ignoro');
        return;
    }
    
    // Ferma lo scanner
    stopScanner();
    
    // Feedback sonoro e visivo
    playBeep();
    document.getElementById('barcodeInput').value = code;
    showAlert(`✅ Codice rilevato: ${code}`, 'success');
    
    // Avvia la ricerca automatica
    setTimeout(() => {
        searchByBarcode();
    }, 800);
}

function stopScanner() {
    console.log('ℹ️ Fermando scanner...');
    
    if (typeof Quagga !== 'undefined' && scannerActive) {
        try {
            Quagga.stop();
            console.log('✅ Quagga fermato');
        } catch (error) {
            console.error('Errore stop Quagga:', error);
        }
    }

    scannerActive = false;

    const scanner = document.getElementById('scanner');
    if (scanner) {
        scanner.style.display = 'none';
        scanner.innerHTML = '';
    }
    
    const scanBtn = document.querySelector('.scan-btn');
    if (scanBtn) {
        scanBtn.innerHTML = '📷 Scansiona Codice';
    }

    console.log('✅ Scanner fermato');
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
	keywords: getSelectedKeywords(),
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
            if (currentUser.authMethod === 'google' && typeof updateBookInGoogleSheets === 'function') {
                await updateBookInGoogleSheets(bookData);
            }
            
            showAlert('Libro modificato con successo!', 'success');
        }
        resetEditMode();
    } else {
        bookData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        books.push(bookData);
        
        // Salva su Google Sheets se disponibile
        if (currentUser.authMethod === 'google' && typeof saveBookToGoogleSheets === 'function') {
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
    setSelectedKeywords(book.keywords || '');
    
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
        if (currentUser.authMethod === 'google' && typeof deleteBookFromGoogleSheets === 'function') {
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
                    <p><strong>Categoria:</strong> ${book.genre}</p>
                    ${book.keywords ? `<p><strong>Parole chiave:</strong> ${book.keywords}</p>` : ''}
                    ${book.year ? `<p><strong>Anno:</strong> ${book.year}</p>` : ''}
                    ${book.publisher ? `<p><strong>Editore:</strong> ${book.publisher}</p>` : ''}
                    <p><strong>Posizione:</strong> ${book.shelf}${book.position ? ' - ' + book.position : ''}</p>
                    ${book.condition ? `<p><strong>Condizioni:</strong> ${book.condition}</p>` : ''}
                    <p><strong>Aggiunto il:</strong> ${book.addedDate}</p>
                    ${book.notes ? `<p><strong>Note:</strong> ${book.notes}</p>` : ''}
                </div>
                <div class="book-actions">
                    <button class="edit-btn" data-book-id="${book.id}" data-action="edit">Modifica</button>
                    <button class="delete-btn" data-book-id="${book.id}" data-action="delete">Elimina</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Event delegation per i pulsanti nella biblioteca
    booksList.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const bookId = this.getAttribute('data-book-id');
            const action = this.getAttribute('data-action');
            
            if (action === 'edit') {
                editBook(bookId);
            } else if (action === 'delete') {
                deleteBook(bookId);
            }
        });
    });
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
    
    let filteredBooks = books;
    
    if (query) {
        filteredBooks = filteredBooks.filter(book => 
            book.title.toLowerCase().includes(query) ||
            (book.author && book.author.toLowerCase().includes(query)) ||
            book.genre.toLowerCase().includes(query) ||
            (book.keywords && book.keywords.toLowerCase().includes(query)) ||
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

function setupSearchListeners() {
    const searchInput = document.getElementById('searchInput');
    const filterGenre = document.getElementById('filterGenre');
    const filterShelf = document.getElementById('filterShelf');
    
    // Rimuovi eventuali listener precedenti
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    const newFilterGenre = filterGenre.cloneNode(true);
    filterGenre.parentNode.replaceChild(newFilterGenre, filterGenre);
    
    const newFilterShelf = filterShelf.cloneNode(true);
    filterShelf.parentNode.replaceChild(newFilterShelf, filterShelf);
    
    // Aggiungi nuovi listener
    document.getElementById('searchInput').addEventListener('input', function() {
        searchBooks();
    });
    
    document.getElementById('filterGenre').addEventListener('change', function() {
        searchBooks();
    });
    
    document.getElementById('filterShelf').addEventListener('change', function() {
        searchBooks();
    });
    
    // Esegui ricerca vuota iniziale per mostrare tutti i libri
    searchBooks();
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
                    <p><strong>Categoria:</strong> ${book.genre}</p>
                    ${book.keywords ? `<p><strong>Parole chiave:</strong> ${book.keywords}</p>` : ''}
                    <p><strong>Posizione:</strong> ${book.shelf}${book.position ? ' - ' + book.position : ''}</p>
                    ${book.notes ? `<p><strong>Note:</strong> ${book.notes}</p>` : ''}
                </div>
                <div class="book-actions">
                    <button class="edit-btn" data-book-id="${book.id}" data-action="edit">Modifica</button>
                    <button class="delete-btn" data-book-id="${book.id}" data-action="delete">Elimina</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Event delegation per i pulsanti
    container.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const bookId = this.getAttribute('data-book-id');
            const action = this.getAttribute('data-action');
            
            if (action === 'edit') {
                editBook(bookId);
            } else if (action === 'delete') {
                deleteBook(bookId);
            }
        });
    });
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
    if (currentUser.authMethod === 'google' && typeof isConfigurationValid === 'function' && isConfigurationValid()) {
        if (typeof loadBooksFromGoogleSheets === 'function') {
            loadBooksFromGoogleSheets();
        } else {
            loadBooksFromLocalStorage();
        }
    } else {
        loadBooksFromLocalStorage();
    }
    
    // Aggiorna anche il dropdown delle librerie
    updateLibraryDropdown();
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

// === SINCRONIZZAZIONE MANUALE ===

async function manualSync() {
    if (typeof syncInProgress !== 'undefined' && syncInProgress) {
        showAlert('Sincronizzazione già in corso...', 'info');
        return;
    }

    if (!currentUser || currentUser.authMethod !== 'google') {
        showAlert('Sincronizzazione disponibile solo con account Google', 'info');
        return;
    }

    showAlert('Sincronizzazione in corso...', 'info');
    if (typeof loadBooksFromGoogleSheets === 'function') {
        await loadBooksFromGoogleSheets();
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

    // Reset checkboxes parole chiave
    document.querySelectorAll('input[name="keywords"]').forEach(cb => cb.checked = false);
    
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
    genreFilter.innerHTML = '<option value="">Tutte le categorie</option>';
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
    if (typeof isConfigurationValid !== 'undefined' && typeof SHEETS_CONFIG !== 'undefined') {
        console.log('🔧 Status Configurazione:');
        console.log(`- Google Client ID: ${isConfigurationValid() ? '✅ Configurato' : '❌ Mancante'}`);
        console.log(`- Google Sheet ID: ${SHEETS_CONFIG.SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE' ? '✅ Configurato' : '❌ Mancante'}`);
        console.log(`- Ambiente: ${typeof DEV_MODE !== 'undefined' && DEV_MODE ? 'Sviluppo' : 'Produzione'}`);
    }
}

function getSelectedKeywords() {
    const checkboxes = document.querySelectorAll('input[name="keywords"]:checked');
    return Array.from(checkboxes).map(cb => cb.value).join(', ');
}

function setSelectedKeywords(keywordsString) {
    document.querySelectorAll('input[name="keywords"]').forEach(cb => {
        cb.checked = keywordsString.includes(cb.value);
    });
}
