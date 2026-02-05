// Global Variables
let currentUtterance = null;
let recognition = null;
let isRecording = false;
let finalTranscript = '';
let interimTranscript = '';
let recognitionTimeout = null;
let microphonePermissionGranted = false;
let deferredPrompt = null;
let processedResults = new Set(); 
let lastFinalTranscriptLength = 0; 

// ========== PWA INSTALLATION ==========
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

window.addEventListener('appinstalled', () => {
    console.log('PWA installed');
    deferredPrompt = null;
});

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkBrowserSupport();
    registerServiceWorker();
    loadVoices(); // ✅ Load voices saat startup
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker error:', err));
    }
}

// ✅ FUNGSI BARU: Load dan log semua voice yang tersedia
function loadVoices() {
    if ('speechSynthesis' in window) {
        // Load voices immediately
        let voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            logAvailableVoices(voices);
        }
        
        // Also listen for voice changes (for some browsers)
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            logAvailableVoices(voices);
        };
    }
}

function logAvailableVoices(voices) {
    console.log('=== SEMUA VOICE TERSEDIA ===');
    voices.forEach((voice, index) => {
        console.log(`${index}. ${voice.name} (${voice.lang}) ${voice.default ? '⭐ DEFAULT' : ''}`);
    });
    
    const idVoices = voices.filter(v => v.lang.toLowerCase().includes('id'));
    console.log('\n=== VOICE INDONESIA ===');
    if (idVoices.length > 0) {
        idVoices.forEach(v => {
            console.log(`✅ ${v.name} (${v.lang})`);
        });
    } else {
        console.warn('❌ Tidak ada voice Indonesia yang ditemukan!');
    }
}

function initializeApp() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'id-ID';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            console.log('Speech recognition started');
            updateStatus('🎤 Sedang merekam... Bicara sekarang!');
        };

        recognition.onresult = (event) => {
            
            interimTranscript = '';
            let currentFinalText = '';
            
            // Ambil semua hasil dari awal
            for (let i = 0; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    // Kumpulkan semua final results
                    currentFinalText += transcript + ' ';
                } else {
                    // Interim results (sementara)
                    interimTranscript += transcript;
                }
            }
            
            
            if (currentFinalText.trim().length > 0) {
                const trimmedFinal = currentFinalText.trim();
                
                // Cek apakah ini hasil baru (tidak duplikat)
                if (trimmedFinal.length > lastFinalTranscriptLength) {
                    // Ambil hanya bagian baru
                    const newPart = trimmedFinal.substring(lastFinalTranscriptLength).trim();
                    if (newPart.length > 0) {
                        finalTranscript += newPart + ' ';
                        lastFinalTranscriptLength = trimmedFinal.length;
                    }
                }
            }

            // Update textarea dengan hasil terbaru
            const speechText = document.getElementById('speechText');
            speechText.value = finalTranscript + interimTranscript;
            
            // Auto scroll ke bawah
            speechText.scrollTop = speechText.scrollHeight;
            
            console.log('Final:', finalTranscript);
            console.log('Interim:', interimTranscript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
                handleRecognitionError(event.error);
            }
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            
            
            const speechText = document.getElementById('speechText');
            speechText.value = finalTranscript.trim();
            
            // Restart jika masih recording
            if (isRecording) {
                recognitionTimeout = setTimeout(() => {
                    if (isRecording) {
                        try {
                            
                            lastFinalTranscriptLength = 0;
                            recognition.start();
                            console.log('Recognition restarted');
                        } catch(e) {
                            console.log('Recognition restart failed:', e);
                            stopRecording();
                        }
                    }
                }, 100);
            }
        };
    }
}

function setupEventListeners() {
    document.getElementById('btnTulisDengar').addEventListener('click', showTextModeSelection);
    document.getElementById('btnBicaraBaca').addEventListener('click', showSpeechMode);
    document.getElementById('btnKeluar').addEventListener('click', exitApp);
    
    document.getElementById('btnKalimatPendek').addEventListener('click', () => showTextEditor('kalimat'));
    document.getElementById('btnCeritaPanjang').addEventListener('click', () => showTextEditor('cerita'));
    document.getElementById('btnKembaliMode').addEventListener('click', showMenu);
    
    document.getElementById('btnDengarkan').addEventListener('click', textToSpeech);
    document.getElementById('btnUlangText').addEventListener('click', repeatAudio);
    document.getElementById('btnSimpanText').addEventListener('click', saveText);
    document.getElementById('btnHapusText').addEventListener('click', clearText);
    document.getElementById('btnKembaliEditor').addEventListener('click', showMenu);
    
    document.getElementById('recordBtn').addEventListener('click', startRecording);
    document.getElementById('stopBtn').addEventListener('click', stopRecording);
    document.getElementById('btnBacaTeks').addEventListener('click', readText);
    document.getElementById('btnUlangSpeech').addEventListener('click', repeatSpeech);
    document.getElementById('btnSimpanSpeech').addEventListener('click', saveSpeechText);
    document.getElementById('btnHapusSpeech').addEventListener('click', clearSpeech);
    document.getElementById('btnKembaliSpeech').addEventListener('click', showMenu);
}

function checkBrowserSupport() {
    if (!recognition) console.warn('Speech Recognition not supported');
    if (!('speechSynthesis' in window)) console.warn('Speech Synthesis not supported');
    if (!navigator.mediaDevices) console.warn('getUserMedia not supported');
}

// ========== NAVIGATION ==========
function showMenu() {
    hideAllScreens();
    document.querySelector('.menu-screen').classList.add('active');
    updateStatus('Selamat Datang! 👋');
    stopAllAudio();
}

function showTextModeSelection() {
    hideAllScreens();
    document.querySelector('.text-mode-screen').classList.add('active');
    updateStatus('Pilih jenis teks yang ingin kamu tulis');
}

function showTextEditor(mode) {
    hideAllScreens();
    document.querySelector('.text-editor-screen').classList.add('active');
    
    const instruction = document.getElementById('editorInstruction');
    const textEditor = document.getElementById('textEditor');
    
    if (mode === 'kalimat') {
        instruction.textContent = '✏️ Tulis Kalimat Pendek';
        textEditor.placeholder = 'Tulis kalimat pendek di sini...\n\nContoh: Hari ini aku bermain bola.';
        textEditor.style.minHeight = '150px';
    } else {
        instruction.textContent = '📝 Tulis Cerita Panjang';
        textEditor.placeholder = 'Tulis ceritamu di sini...\n\nCerita tentang hewan peliharanmu, liburan, atau petualangan seru!';
        textEditor.style.minHeight = '250px';
    }
    
    updateStatus('Tuliskan teks, lalu klik DENGARKAN 🔊');
}

function showSpeechMode() {
    hideAllScreens();
    document.querySelector('.speech-screen').classList.add('active');
    updateStatus('Siap untuk merekam suaramu! 🎤');
    
    if (!navigator.mediaDevices) {
        alert('⚠️ Browser ini tidak mendukung fitur mikrofon.\n\n✅ Gunakan:\n• Chrome (Android/PC)\n• Safari (iPhone/Mac)\n• Edge (Windows)');
    }
}

function hideAllScreens() {
    document.querySelectorAll('.menu-screen, .text-mode-screen, .text-editor-screen, .speech-screen').forEach(screen => {
        screen.classList.remove('active');
    });
}

function exitApp() {
    if (confirm('Yakin mau keluar dari aplikasi? 👋')) {
        stopAllAudio();
        window.close();
        setTimeout(() => {
            alert('Terima kasih sudah menggunakan aplikasi ini! 🎉\n\nSilakan tutup tab/aplikasi ini secara manual.');
        }, 100);
    }
}

// ========== TEXT-TO-SPEECH (IMPROVED) ==========
function getIndonesianVoice() {
    const voices = window.speechSynthesis.getVoices();
    
    // Priority 1: Google Indonesian female (paling natural)
    let voice = voices.find(v => 
        v.lang === 'id-ID' && 
        v.name.toLowerCase().includes('google') &&
        v.name.toLowerCase().includes('female')
    );
    
    // Priority 2: Google Indonesian apapun
    if (!voice) {
        voice = voices.find(v => 
            v.lang === 'id-ID' && 
            v.name.toLowerCase().includes('google')
        );
    }
    
    // Priority 3: Voice dengan "damayanti" atau nama Indonesia
    if (!voice) {
        voice = voices.find(v => 
            v.lang === 'id-ID' && 
            (v.name.toLowerCase().includes('damayanti') ||
             v.name.toLowerCase().includes('indonesia'))
        );
    }
    
    // Priority 4: Voice apapun dengan lang id-ID exact match
    if (!voice) {
        voice = voices.find(v => v.lang === 'id-ID');
    }
    
    // Priority 5: Voice yang dimulai dengan 'id-' atau 'id_'
    if (!voice) {
        voice = voices.find(v => 
            v.lang.toLowerCase().startsWith('id-') || 
            v.lang.toLowerCase().startsWith('id_')
        );
    }
    
    if (voice) {
        console.log('✅ Selected voice:', voice.name, '(' + voice.lang + ')');
    } else {
        console.warn('⚠️ No Indonesian voice found!');
    }
    
    return voice;
}

function textToSpeech() {
    const text = document.getElementById('textEditor').value.trim();
    
    if (!text) {
        alert('📝 Tidak ada teks untuk didengarkan!\nTulis sesuatu dulu ya.');
        return;
    }

    if (!('speechSynthesis' in window)) {
        alert('❌ Browser kamu tidak mendukung text-to-speech 😢');
        return;
    }

    window.speechSynthesis.cancel();
    
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'id-ID';
    currentUtterance.rate = 0.85; // ✅ Lebih lambat untuk pronounciation yang lebih jelas
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    // ✅ Gunakan fungsi pemilihan voice yang lebih baik
    const selectedVoice = getIndonesianVoice();
    if (selectedVoice) {
        currentUtterance.voice = selectedVoice;
    }

    currentUtterance.onstart = () => {
        updateStatus('🔊 Sedang memutar suara...');
        document.getElementById('btnDengarkan').disabled = true;
    };

    currentUtterance.onend = () => {
        updateStatus('✅ Selesai memutar!');
        document.getElementById('btnDengarkan').disabled = false;
    };

    currentUtterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        updateStatus('❌ Ada masalah saat memutar suara');
        document.getElementById('btnDengarkan').disabled = false;
    };

    window.speechSynthesis.speak(currentUtterance);
}

function repeatAudio() {
    const text = document.getElementById('textEditor').value.trim();
    if (!text) {
        alert('📝 Belum ada suara untuk diputar ulang!');
        return;
    }
    textToSpeech();
}

function saveText() {
    const text = document.getElementById('textEditor').value.trim();
    
    if (!text) {
        alert('📝 Tidak ada teks untuk disimpan!');
        return;
    }

    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0,10);
        a.href = url;
        a.download = `teks-saya-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('💾 Teks berhasil disimpan!');
    } catch (error) {
        console.error('Save error:', error);
        alert('❌ Gagal menyimpan file');
    }
}

function clearText() {
    if (confirm('🤔 Yakin mau hapus semua teks?')) {
        document.getElementById('textEditor').value = '';
        window.speechSynthesis.cancel();
        updateStatus('🗑️ Teks telah dihapus');
    }
}

// ========== SPEECH-TO-TEXT ==========
async function startRecording() {
    if (!recognition) {
        alert('❌ Browser kamu tidak mendukung speech recognition 😢\n\nCoba pakai:\n• Chrome (Android/PC)\n• Safari (iPhone/Mac)\n• Edge (Windows)');
        return;
    }

    try {
        updateStatus('🎤 Meminta izin mikrofon...');
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        stream.getTracks().forEach(track => track.stop());
        
        microphonePermissionGranted = true;
        const permissionAlert = document.getElementById('permissionAlert');
        if (permissionAlert) {
            permissionAlert.style.display = 'none';
        }
        
        isRecording = true;
        
        
        processedResults.clear();
        lastFinalTranscriptLength = 0;
        
        // Ambil teks yang sudah ada (jika user mau lanjutkan)
        const currentText = document.getElementById('speechText').value.trim();
        if (currentText) {
            finalTranscript = currentText + ' ';
        } else {
            finalTranscript = '';
        }
        interimTranscript = '';
        
        document.getElementById('recordBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        document.getElementById('recordingIndicator').classList.add('active');
        
        updateStatus('🎤 Memulai rekaman...');
        recognition.start();
        
        setTimeout(() => {
            if (isRecording) {
                updateStatus('🔴 Sedang merekam... Bicara sekarang!');
            }
        }, 500);
        
    } catch(error) {
        console.error('Microphone permission error:', error);
        handleMicrophoneError(error);
        stopRecording();
    }
}

function stopRecording() {
    isRecording = false;
    
    
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
    
    processedResults.clear();
    lastFinalTranscriptLength = 0;
    
    if (recognition) {
        try {
            recognition.stop();
        } catch(e) {
            console.log('Stop recognition error:', e);
        }
    }
    
    document.getElementById('recordBtn').style.display = 'block';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('recordingIndicator').classList.remove('active');
    
    
    setTimeout(() => {
        const speechText = document.getElementById('speechText');
        const savedText = finalTranscript.trim();
        if (savedText) {
            speechText.value = savedText;
        }
        updateStatus('✅ Rekaman selesai! Teks tersimpan');
    }, 300);
}

function readText() {
    const text = document.getElementById('speechText').value.trim();
    
    if (!text) {
        alert('📝 Belum ada teks untuk dibaca!\nRekam suaramu dulu ya.');
        return;
    }

    if (!('speechSynthesis' in window)) {
        alert('❌ Browser kamu tidak mendukung text-to-speech 😢');
        return;
    }

    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 0.85; // ✅ Lebih lambat untuk pronounciation yang lebih jelas
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // ✅ Gunakan fungsi pemilihan voice yang lebih baik
    const selectedVoice = getIndonesianVoice();
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
        updateStatus('🔊 Sedang membaca teks...');
        document.getElementById('btnBacaTeks').disabled = true;
    };

    utterance.onend = () => {
        updateStatus('✅ Selesai membaca!');
        document.getElementById('btnBacaTeks').disabled = false;
    };

    utterance.onerror = (event) => {
        console.error('Speech error:', event);
        updateStatus('❌ Ada masalah saat membaca teks');
        document.getElementById('btnBacaTeks').disabled = false;
    };

    window.speechSynthesis.speak(utterance);
}

function repeatSpeech() {
    readText();
}

function saveSpeechText() {
    const text = document.getElementById('speechText').value.trim();
    
    if (!text) {
        alert('📝 Tidak ada teks untuk disimpan!\nRekam suaramu dulu ya.');
        return;
    }

    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0,10);
        a.href = url;
        a.download = `rekaman-saya-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('💾 Teks berhasil disimpan!');
    } catch (error) {
        console.error('Save error:', error);
        alert('❌ Gagal menyimpan file');
    }
}

function clearSpeech() {
    if (confirm('🤔 Yakin mau hapus rekaman dan teks?')) {
        stopRecording();
        document.getElementById('speechText').value = '';
        finalTranscript = '';
        interimTranscript = '';
        processedResults.clear();
        lastFinalTranscriptLength = 0;
        window.speechSynthesis.cancel();
        updateStatus('🗑️ Rekaman dihapus! Siap merekam lagi');
    }
}

// ========== ERROR HANDLING ==========
function handleMicrophoneError(error) {
    let errorMsg = '❌ Gagal mengakses mikrofon!\n\n';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg += '🔒 Izin mikrofon ditolak!\n\n📱 Cara mengaktifkan:\n\n🍎 iPhone (Safari):\nSettings → Safari → Microphone → Allow\n\n🤖 Android (Chrome):\nKlik 🔒 di address bar → Permissions → Microphone → Allow\n\n💻 PC/Laptop:\nKlik 🔒 di address bar → Microphone → Allow\n\nSetelah itu REFRESH halaman!';
    } else if (error.name === 'NotFoundError') {
        errorMsg += '🎤 Mikrofon tidak ditemukan!\nPastikan perangkat memiliki mikrofon.';
    } else {
        errorMsg += 'Error: ' + error.message;
    }
    
    alert(errorMsg);
    updateStatus('❌ Mikrofon tidak dapat diakses');
}

function handleRecognitionError(errorType) {
    if (errorType === 'not-allowed' || errorType === 'permission-denied') {
        alert('❌ Izin mikrofon ditolak!\n\nKlik 🔒 di address bar → Allow Microphone\nLalu REFRESH halaman!');
        updateStatus('❌ Mikrofon perlu diizinkan');
        stopRecording();
    } else if (errorType === 'no-speech') {
        console.log('No speech detected, continuing...');
    } else if (errorType !== 'aborted') {
        console.warn('Recognition error:', errorType);
        updateStatus('⚠️ Terjadi gangguan, tetap merekam...');
    }
}

// ========== UTILITY ==========
function updateStatus(message) {
    document.getElementById('statusBar').textContent = message;
}

function stopAllAudio() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (isRecording) stopRecording();
}

window.addEventListener('beforeunload', stopAllAudio);
