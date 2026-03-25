const audioPlayer = document.getElementById('audioPlayer');
const videoHelper = document.getElementById('videoHelper');
const bgAudioPlayer = document.getElementById('bgAudioPlayer');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const tracksList = document.getElementById('tracksList');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const currentTrackTitle = document.getElementById('currentTrackTitle');
const currentTrackArtist = document.getElementById('currentTrackArtist');
const albumArt = document.getElementById('albumArt');
const trackCount = document.getElementById('trackCount');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const volumeBtn = document.getElementById('volumeBtn');
const volumeBar = document.getElementById('volumeBar');
const volumeContainer = document.getElementById('volumeContainer');
const dropZone = document.getElementById('dropZone');
const visualizer = document.getElementById('visualizer');

let db;
let audioContext;
let analyser;
let canvasCtx;
let animationId;
let mediaSessionSupported = false;
let isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const playerState = {
    currentTrackIndex: -1,
    tracks: [],
    isPlaying: false,
    volume: 0.7,
    shuffle: false,
    repeat: 'off',
    shuffleHistory: [],
    previousVolume: 0.7,
    currentPlaylistId: 'default',
    playlists: []
};

const loadPlaylists = async () => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readonly');
        const store = transaction.objectStore('playlists');
        const request = store.getAll();
        request.onsuccess = () => {
            let playlists = request.result || [];
            if (playlists.length === 0) {
                playlists = [{ id: 'default', name: 'Все треки', trackIds: [] }];
                savePlaylistToDB(playlists[0]);
            }
            playerState.playlists = playlists;
            resolve(playlists);
        };
        request.onerror = () => reject(request.error);
    });
};

const savePlaylistToDB = async (playlist) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const request = store.put(playlist);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const deletePlaylistFromDB = async (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['playlists'], 'readwrite');
        const store = transaction.objectStore('playlists');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const createPlaylist = async (name) => {
    const playlist = {
        id: 'playlist_' + Date.now(),
        name: name,
        trackIds: [],
        created: new Date()
    };
    await savePlaylistToDB(playlist);
    playerState.playlists.push(playlist);
    return playlist;
};

const addTrackToPlaylist = async (playlistId, trackId) => {
    const playlist = playerState.playlists.find(p => p.id === playlistId);
    if (playlist && !playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        await savePlaylistToDB(playlist);
    }
};

const removeTrackFromPlaylist = async (playlistId, trackId) => {
    const playlist = playerState.playlists.find(p => p.id === playlistId);
    if (playlist) {
        playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
        await savePlaylistToDB(playlist);
    }
};

const switchPlaylist = (playlistId) => {
    playerState.currentPlaylistId = playlistId;
    playerState.currentTrackIndex = -1;
    audioPlayer.pause();
    playerState.isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    playBtn.classList.remove('playing');
    albumArt.classList.remove('playing');
    stopVisualizer();
    currentTrackTitle.textContent = 'Выберите трек';
    currentTrackArtist.textContent = '—';
    
    if (playlistId === 'default') {
        loadAllTracks();
    } else {
        const playlist = playerState.playlists.find(p => p.id === playlistId);
        if (playlist) {
            playerState.tracks = playerState.tracks.filter(t => playlist.trackIds.includes(t.id));
        }
    }
    renderTracksList();
};

const loadAllTracks = async () => {
    playerState.tracks = await loadTracksFromDB(db);
};



const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AudioPlayerDB', 3);
        
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('tracks')) {
                const store = db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
                store.createIndex('title', 'title', { unique: false });
            }
            if (!db.objectStoreNames.contains('playlists')) {
                db.createObjectStore('playlists', { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (event) => resolve(event.target.result);
    });
};

const loadTracksFromDB = async (db) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tracks'], 'readonly');
        const store = transaction.objectStore('tracks');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

const saveTrackToDB = async (db, track) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tracks'], 'readwrite');
        const store = transaction.objectStore('tracks');
        const request = store.add(track);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const deleteTrackFromDB = async (db, id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['tracks'], 'readwrite');
        const store = transaction.objectStore('tracks');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const formatTime = (seconds) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const initMediaSession = () => {
    if ('mediaSession' in navigator) {
        mediaSessionSupported = true;
        
        navigator.mediaSession.setActionHandler('play', () => {
            togglePlay();
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            togglePlay();
        });
        
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            prevTrack();
        });
        
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            nextTrack();
        });
        
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - (details.seekOffset || 10));
        });
        
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + (details.seekOffset || 10));
        });
    }
};

const updateMediaSession = () => {
    if (!mediaSessionSupported) return;
    
    const track = playerState.tracks[playerState.currentTrackIndex];
    if (!track) return;
    
    navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Неизвестный трек',
        artist: track.artist || 'Неизвестный исполнитель',
        album: 'AudioPlayer',
        artwork: [
            { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a1a"/><circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="3"/><line x1="50" y1="50" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'), sizes: '96x96', type: 'image/svg+xml' },
            { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a1a"/><circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="3"/><line x1="50" y1="50" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'), sizes: '128x128', type: 'image/svg+xml' },
            { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a1a"/><circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="3"/><line x1="50" y1="50" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'), sizes: '192x192', type: 'image/svg+xml' },
            { src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#1a1a1a"/><circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="3"/><line x1="50" y1="50" x2="50" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'), sizes: '256x256', type: 'image/svg+xml' }
        ]
    });
    
    if (playerState.isPlaying && isIOS) {
        navigator.mediaSession.playbackState = 'playing';
    }
};

let mediaStreamSource;
let isAudioContextConnected = false;
let audioContextStartTime = 0;

const initIOSAudioSession = async () => {
    if (!isIOS) return;
    
    try {
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const unlockAudio = () => {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            if (audioPlayer.paused && playerState.isPlaying) {
                audioPlayer.play().catch(() => {});
            }
        };
        
        document.addEventListener('touchstart', unlockAudio, { once: true });
        document.addEventListener('touchend', unlockAudio, { once: true });
        document.addEventListener('click', unlockAudio, { once: true });
        
    } catch (e) {
        console.error('iOS Audio Session error:', e);
    }
};

const setupIOSBackgroundPlayback = () => {
    if (!isIOS) return;
    
    let wakeLock = null;
    let keepAliveTimer = null;
    let backgroundPlayAttempt = 0;
    
    const startBackgroundPlayback = async () => {
        if (!playerState.isPlaying) return;
        
        try {
            if (videoHelper.paused && videoHelper.src) {
                await videoHelper.play();
            }
            
            if (bgAudioPlayer.paused && bgAudioPlayer.src) {
                await bgAudioPlayer.play();
            }
            
            if (audioPlayer.paused && audioPlayer.src) {
                await audioPlayer.play();
            }
            
            backgroundPlayAttempt = 0;
        } catch (e) {
            backgroundPlayAttempt++;
            console.log('Background play attempt:', backgroundPlayAttempt);
        }
    };
    
    const startKeepAlive = () => {
        if (keepAliveTimer) return;
        
        keepAliveTimer = setInterval(async () => {
            if (!playerState.isPlaying) {
                stopKeepAlive();
                return;
            }
            
            try {
                if (!videoHelper.src && audioPlayer.src) {
                    videoHelper.src = audioPlayer.src;
                }
                
                if (videoHelper.paused) {
                    await videoHelper.play();
                }
                
                if (bgAudioPlayer.paused && bgAudioPlayer.src) {
                    await bgAudioPlayer.play();
                }
                
                if (audioPlayer.paused && audioPlayer.src) {
                    await audioPlayer.play();
                }
                
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                
                if (navigator.mediaSession) {
                    navigator.mediaSession.playbackState = 'playing';
                }
            } catch (e) {
                console.log('Keep-alive error:', e);
            }
        }, 300);
    };
    
    const stopKeepAlive = () => {
        if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
        }
    };
    
    const tryAcquireWakeLock = async () => {
        if (!playerState.isPlaying) return;
        
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (e) {
            console.log('Wake Lock not available:', e);
        }
    };
    
    const releaseWakeLock = () => {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    };
    
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') {
            startKeepAlive();
            tryAcquireWakeLock();
            startBackgroundPlayback();
            
            if (audioPlayer.src) {
                videoHelper.src = audioPlayer.src;
                videoHelper.currentTime = audioPlayer.currentTime;
                videoHelper.play().catch(() => {});
            }
        } else {
            stopKeepAlive();
            releaseWakeLock();
            
            if (playerState.isPlaying && audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
            }
        }
    });
    
    document.addEventListener('pagehide', async () => {
        if (playerState.isPlaying) {
            startKeepAlive();
            tryAcquireWakeLock();
            startBackgroundPlayback();
            
            if (audioPlayer.src) {
                videoHelper.src = audioPlayer.src;
                videoHelper.currentTime = audioPlayer.currentTime;
                videoHelper.play().catch(() => {});
            }
        }
    });
    
    document.addEventListener('pageshow', () => {
        stopKeepAlive();
        releaseWakeLock();
    });
    
    let videoInitialized = false;
    const initVideoHelper = () => {
        if (videoInitialized) return;
        videoInitialized = true;
        
        if (!videoHelper.src && audioPlayer.src) {
            videoHelper.src = audioPlayer.src;
        }
        
        videoHelper.loop = true;
        videoHelper.muted = true;
        videoHelper.playsInline = true;
        videoHelper.play().catch(() => {});
        
        if (playerState.isPlaying) {
            startKeepAlive();
        }
    };
    
    document.addEventListener('touchstart', initVideoHelper, { once: true });
    document.addEventListener('click', initVideoHelper, { once: true });
    
    if (playerState.isPlaying) {
        initVideoHelper();
    }
};

const unlockIOSAudio = () => {
    if (!isIOS) return;
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const tryPlay = () => {
        if (playerState.isPlaying && audioPlayer.paused) {
            audioPlayer.play()
                .then(() => {
                    if (mediaSessionSupported) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                })
                .catch(() => {});
        }
    };
    
    if (playerState.isPlaying) {
        tryPlay();
    }
};

const initAudioContext = () => {
    if (audioContext) {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        return;
    }
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        if (!isAudioContextConnected && audioPlayer.src) {
            connectAudioSource();
        }
    } catch (e) {
        console.error('AudioContext error:', e);
    }
};

const connectAudioSource = () => {
    if (isAudioContextConnected || !audioContext || !audioPlayer.src) return;
    
    try {
        if (mediaStreamSource) {
            mediaStreamSource.disconnect();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        mediaStreamSource = audioContext.createMediaElementSource(audioPlayer);
        mediaStreamSource.connect(analyser);
        analyser.connect(audioContext.destination);
        isAudioContextConnected = true;
        audioContextStartTime = Date.now();
    } catch (e) {
        console.error('Error connecting audio source:', e);
    }
};

const initVisualizer = () => {
    if (!visualizer) return;
    
    canvasCtx = visualizer.getContext('2d');
    if (!canvasCtx) return;
    
    if (!audioContext) {
        initAudioContext();
    }
    
    if (audioPlayer.src && !isAudioContextConnected) {
        connectAudioSource();
    }
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    drawVisualizer();
};

const drawVisualizer = () => {
    if (!canvasCtx || !visualizer) return;
    
    const rect = visualizer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        animationId = requestAnimationFrame(drawVisualizer);
        return;
    }
    
    const width = visualizer.width = rect.width * window.devicePixelRatio;
    const height = visualizer.height = rect.height * window.devicePixelRatio;
    
    canvasCtx.clearRect(0, 0, width, height);
    
    if (!playerState.isPlaying || !analyser) {
        animationId = requestAnimationFrame(drawVisualizer);
        return;
    }
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    const bars = 32;
    const barWidth = width / bars;
    
    for (let i = 0; i < bars; i++) {
        const dataIndex = Math.floor(i * bufferLength / bars);
        const barHeight = (dataArray[dataIndex] / 255) * height * 0.9;
        
        const gradient = canvasCtx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#666666');
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(i * barWidth + 1, height - barHeight, barWidth - 2, barHeight);
    }
    
    animationId = requestAnimationFrame(drawVisualizer);
};

const stopVisualizer = () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (canvasCtx) {
        const width = visualizer.width = visualizer.offsetWidth * window.devicePixelRatio;
        const height = visualizer.height = visualizer.offsetHeight * window.devicePixelRatio;
        canvasCtx.clearRect(0, 0, width, height);
    }
};

const updateTime = () => {
    const currentTime = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    
    if (duration && !isNaN(duration)) {
        const progressPercent = (currentTime / duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        
        const progressThumb = progressContainer.querySelector('.player__progress-thumb');
        if (progressThumb) {
            progressThumb.style.left = `${progressPercent}%`;
        }
        
        progressContainer.setAttribute('aria-valuenow', Math.round(progressPercent));
        
        currentTimeEl.textContent = formatTime(currentTime);
        totalTimeEl.textContent = formatTime(duration);
    }
};

const updatePlayerUI = () => {
    if (playerState.currentTrackIndex >= 0 && playerState.tracks.length > 0) {
        const track = playerState.tracks[playerState.currentTrackIndex];
        currentTrackTitle.textContent = track.title || 'Неизвестный трек';
        currentTrackArtist.textContent = track.artist || 'Неизвестный исполнитель';
        renderTracksList();
    }
};

const playTrack = (index) => {
    if (index < 0 || index >= playerState.tracks.length) return;
    
    if (playerState.shuffle && playerState.shuffleHistory.length === 0) {
        playerState.shuffleHistory = [...Array(playerState.tracks.length).keys()].filter(i => i !== index);
        for (let i = playerState.shuffleHistory.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerState.shuffleHistory[i], playerState.shuffleHistory[j]] = 
            [playerState.shuffleHistory[j], playerState.shuffleHistory[i]];
        }
    }
    
    playerState.currentTrackIndex = index;
    const track = playerState.tracks[index];
    
    const blob = new Blob([track.audioData], { type: track.type });
    const url = URL.createObjectURL(blob);
    
    isAudioContextConnected = false;
    
    audioPlayer.src = url;
    audioPlayer.load();
    audioPlayer.volume = playerState.volume;
    audioPlayer.muted = false;
    
    if (isIOS) {
        bgAudioPlayer.src = url;
        bgAudioPlayer.load();
        bgAudioPlayer.volume = playerState.volume;
        
        videoHelper.src = url;
        videoHelper.currentTime = 0;
        videoHelper.loop = true;
        videoHelper.muted = true;
        videoHelper.playsInline = true;
        
        initAudioContext();
    }
    
    const playOptions = isIOS ? { playsinline: true, ignoreSilentSupport: true } : {};
    
    audioPlayer.play(playOptions).then(() => {
        playerState.isPlaying = true;
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playBtn.classList.add('playing');
        albumArt.classList.add('playing');
        updatePlayerUI();
        updateMediaSession();
        initVisualizer();
        
        if (isIOS) {
            videoHelper.play().catch(() => {});
            bgAudioPlayer.play().catch(() => {});
        }
    }).catch(error => {
        console.error('Ошибка воспроизведения:', error);
    });
};

const togglePlay = () => {
    if (playerState.isPlaying) {
        audioPlayer.pause();
        if (isIOS && bgAudioPlayer.src) {
            bgAudioPlayer.pause();
        }
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
        albumArt.classList.remove('playing');
        playerState.isPlaying = false;
        stopVisualizer();
        if (mediaSessionSupported) {
            navigator.mediaSession.playbackState = 'paused';
        }
    } else {
        const playPromise = playerState.currentTrackIndex === -1 && playerState.tracks.length > 0 
            ? playTrack(0) 
            : playerState.currentTrackIndex >= 0 ? audioPlayer.play() : Promise.reject('No track');
        
        if (isIOS && playerState.currentTrackIndex >= 0 && bgAudioPlayer.src) {
            bgAudioPlayer.play().catch(() => {});
        }
        
        if (playPromise) {
            playPromise.then(() => {
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                playBtn.classList.add('playing');
                albumArt.classList.add('playing');
                playerState.isPlaying = true;
                initVisualizer();
                if (mediaSessionSupported) {
                    navigator.mediaSession.playbackState = 'playing';
                }
            }).catch((error) => {
                if (isIOS && playerState.currentTrackIndex >= 0) {
                    const resumeAudio = () => {
                        audioPlayer.play()
                            .then(() => {
                                if (bgAudioPlayer.src) {
                                    bgAudioPlayer.play().catch(() => {});
                                }
                                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                                playBtn.classList.add('playing');
                                albumArt.classList.add('playing');
                                playerState.isPlaying = true;
                                initVisualizer();
                            })
                            .catch(console.error);
                        document.removeEventListener('touchstart', resumeAudio);
                        document.removeEventListener('click', resumeAudio);
                    };
                    document.addEventListener('touchstart', resumeAudio, { once: true });
                    document.addEventListener('click', resumeAudio, { once: true });
                }
                console.error('Ошибка воспроизведения:', error);
            });
        }
    }
};

const nextTrack = () => {
    if (playerState.tracks.length === 0) return;
    
    let nextIndex;
    if (playerState.shuffle && playerState.shuffleHistory.length > 0) {
        nextIndex = playerState.shuffleHistory.shift();
    } else {
        nextIndex = (playerState.currentTrackIndex + 1) % playerState.tracks.length;
    }
    
    playTrack(nextIndex);
};

const prevTrack = () => {
    if (playerState.tracks.length === 0) return;
    
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }
    
    let prevIndex;
    if (playerState.shuffle && playerState.shuffleHistory.length > 0) {
        playerState.shuffleHistory.unshift(playerState.currentTrackIndex);
        prevIndex = playerState.shuffleHistory.shift() || 0;
    } else {
        prevIndex = playerState.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = playerState.tracks.length - 1;
    }
    
    playTrack(prevIndex);
};

const toggleShuffle = () => {
    playerState.shuffle = !playerState.shuffle;
    shuffleBtn.classList.toggle('active', playerState.shuffle);
    if (playerState.shuffle) {
        playerState.shuffleHistory = [];
    }
};

const toggleRepeat = () => {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(playerState.repeat);
    playerState.repeat = modes[(currentIndex + 1) % modes.length];
    
    repeatBtn.classList.toggle('active', playerState.repeat !== 'off');
    repeatBtn.classList.toggle('repeat-one', playerState.repeat === 'one');
    
    const icon = repeatBtn.querySelector('i');
    if (playerState.repeat === 'one') {
        icon.className = 'fas fa-repeat-1';
    } else {
        icon.className = 'fas fa-repeat';
    }
};

const handleTrackEnd = () => {
    if (playerState.repeat === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
        if (isIOS && bgAudioPlayer.src) {
            bgAudioPlayer.currentTime = 0;
            bgAudioPlayer.play();
        }
    } else if (playerState.repeat === 'all' || playerState.currentTrackIndex < playerState.tracks.length - 1) {
        nextTrack();
    } else {
        playerState.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
        albumArt.classList.remove('playing');
        stopVisualizer();
        if (mediaSessionSupported) {
            navigator.mediaSession.playbackState = 'none';
        }
    }
};

const updateProgressPosition = (clientX) => {
    const rect = progressContainer.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const duration = audioPlayer.duration;
    
    if (duration && !isNaN(duration)) {
        const newTime = (clickX / rect.width) * duration;
        audioPlayer.currentTime = Math.max(0, Math.min(duration, newTime));
    }
};

const setProgress = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    updateProgressPosition(clientX);
};

const initProgressDrag = () => {
    let isDragging = false;
    let hasMoved = false;
    
    const handleStart = (e) => {
        isDragging = true;
        hasMoved = false;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updateProgressPosition(clientX);
    };
    
    const handleMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        hasMoved = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updateProgressPosition(clientX);
    };
    
    const handleEnd = () => {
        isDragging = false;
    };
    
    const handleClick = (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            hasMoved = false;
        }
    };
    
    progressContainer.addEventListener('mousedown', handleStart);
    progressContainer.addEventListener('touchstart', handleStart, { passive: true });
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
    
    progressContainer.addEventListener('click', handleClick);
};

const updateVolumePosition = (clientX) => {
    const rect = volumeContainer.getBoundingClientRect();
    const clickX = clientX - rect.left;
    let volume = clickX / rect.width;
    volume = Math.max(0, Math.min(1, volume));
    
    playerState.volume = volume;
    audioPlayer.volume = volume;
    volumeBar.style.width = `${volume * 100}%`;
    volumeContainer.setAttribute('aria-valuenow', Math.round(volume * 100));
    
    updateVolumeIcon();
};

const setVolume = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    updateVolumePosition(clientX);
};

const initVolumeDrag = () => {
    let isDragging = false;
    
    const handleStart = (e) => {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updateVolumePosition(clientX);
    };
    
    const handleMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        updateVolumePosition(clientX);
    };
    
    const handleEnd = () => {
        isDragging = false;
    };
    
    volumeContainer.addEventListener('mousedown', handleStart);
    volumeContainer.addEventListener('touchstart', handleStart, { passive: true });
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
};

const updateVolumeIcon = () => {
    const icon = volumeBtn.querySelector('i');
    if (playerState.volume === 0) {
        icon.className = 'fas fa-volume-xmark';
    } else if (playerState.volume < 0.5) {
        icon.className = 'fas fa-volume-low';
    } else {
        icon.className = 'fas fa-volume-high';
    }
};

const toggleMute = () => {
    if (playerState.volume > 0) {
        playerState.previousVolume = playerState.volume;
        playerState.volume = 0;
    } else {
        playerState.volume = playerState.previousVolume || 0.7;
    }
    
    audioPlayer.volume = playerState.volume;
    volumeBar.style.width = `${playerState.volume * 100}%`;
    volumeContainer.setAttribute('aria-valuenow', Math.round(playerState.volume * 100));
    updateVolumeIcon();
};

const getAudioDuration = (arrayBuffer, type) => {
    return new Promise((resolve) => {
        const audio = new Audio();
        const blob = new Blob([arrayBuffer], { type });
        const url = URL.createObjectURL(blob);
        
        audio.addEventListener('loadedmetadata', () => {
            resolve(audio.duration);
            URL.revokeObjectURL(url);
        });
        
        audio.addEventListener('error', () => {
            resolve(0);
            URL.revokeObjectURL(url);
        });
        
        audio.src = url;
    });
};

const handleFileUpload = async (file) => {
    if (!file || !file.type.startsWith('audio/')) {
        alert('Пожалуйста, выберите аудиофайл');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target.result;
            const duration = await getAudioDuration(arrayBuffer, file.type);
            
            const track = {
                title: file.name.replace(/\.[^/.]+$/, ''),
                artist: 'Неизвестный исполнитель',
                type: file.type,
                audioData: arrayBuffer,
                duration: duration,
                added: new Date()
            };
            
            const id = await saveTrackToDB(db, track);
            track.id = id;
            
            playerState.tracks.push(track);
            renderTracksList();
            
            if (playerState.tracks.length === 1 && playerState.currentTrackIndex === -1) {
                playTrack(0);
            }
        } catch (error) {
            console.error('Ошибка обработки файла:', error);
            alert('Не удалось обработать файл');
        }
    };
    
    reader.onerror = () => alert('Ошибка чтения файла');
    reader.readAsArrayBuffer(file);
};

const handleFiles = (files) => {
    Array.from(files).forEach(handleFileUpload);
};

const handleFolderUpload = async (files) => {
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadCount = document.getElementById('uploadCount');
    const uploadFill = document.getElementById('uploadFill');
    
    const audioFiles = Array.from(files).filter(file => 
        file.type.startsWith('audio/') || 
        /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
    );
    
    if (audioFiles.length === 0) {
        alert('Аудиофайлы не найдены в папке');
        return;
    }
    
    if (!db) {
        alert('База данных не готова. Пожалуйста, подождите и попробуйте снова.');
        return;
    }
    
    uploadProgress.style.display = 'flex';
    uploadCount.textContent = `0 / ${audioFiles.length}`;
    uploadFill.style.width = '0%';
    
    const previousTrackCount = playerState.tracks.length;
    let loaded = 0;
    
    for (const file of audioFiles) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const duration = await getAudioDuration(arrayBuffer, file.type);
                    
                    const track = {
                        title: file.name.replace(/\.[^/.]+$/, ''),
                        artist: 'Неизвестный исполнитель',
                        type: file.type || 'audio/mpeg',
                        audioData: arrayBuffer,
                        duration: duration,
                        added: new Date()
                    };
                    
                    const id = await saveTrackToDB(db, track);
                    track.id = id;
                    playerState.tracks.push(track);
                } catch (error) {
                    console.error('Ошибка загрузки файла:', file.name, error);
                }
                
                loaded++;
                uploadCount.textContent = `${loaded} / ${audioFiles.length}`;
                uploadFill.style.width = `${(loaded / audioFiles.length) * 100}%`;
                resolve();
            };
            reader.onerror = () => {
                loaded++;
                resolve();
            };
            reader.readAsArrayBuffer(file);
        });
    }
    
    uploadProgress.style.display = 'none';
    renderTracksList();
    
    const newTrackCount = playerState.tracks.length - previousTrackCount;
    if (newTrackCount > 0 && playerState.currentTrackIndex === -1) {
        playTrack(previousTrackCount);
    }
};

const renderTracksList = () => {
    if (playerState.tracks.length === 0) {
        tracksList.innerHTML = `
            <div class="playlist__empty">
                <i class="fas fa-music"></i>
                <p>Добавьте треки для начала</p>
            </div>
        `;
        trackCount.textContent = '0 треков';
        return;
    }
    
    tracksList.innerHTML = '';
    playerState.tracks.forEach((track, index) => {
        const duration = track.duration ? formatTime(track.duration) : '0:00';
        const isActive = index === playerState.currentTrackIndex;
        
        const trackElement = document.createElement('div');
        trackElement.className = `track-item ${isActive ? 'active' : ''}`;
        trackElement.setAttribute('role', 'listitem');
        trackElement.innerHTML = `
            <div class="track-item__icon">
                ${isActive && playerState.isPlaying ? 
                    '<i class="fas fa-pause"></i>' : 
                    '<i class="fas fa-music"></i>'}
            </div>
            <div class="track-item__info">
                <div class="track-item__title">${track.title || 'Неизвестный трек'}</div>
                <div class="track-item__artist">${track.artist || 'Неизвестный исполнитель'}</div>
            </div>
            <div class="track-item__duration">${duration}</div>
            <button class="track-item__delete" aria-label="Удалить трек">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        trackElement.addEventListener('click', (e) => {
            if (!e.target.closest('.track-item__delete')) {
                playTrack(index);
            }
        });
        
        const deleteBtn = trackElement.querySelector('.track-item__delete');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Удалить этот трек?')) {
                if (playerState.currentTrackIndex === index) {
                    audioPlayer.pause();
                    playerState.isPlaying = false;
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    playBtn.classList.remove('playing');
                    albumArt.classList.remove('playing');
                    playerState.currentTrackIndex = -1;
                    currentTrackTitle.textContent = 'Выберите трек';
                    currentTrackArtist.textContent = '—';
                    stopVisualizer();
                }
                
                try {
                    await deleteTrackFromDB(db, track.id);
                    playerState.tracks = playerState.tracks.filter(t => t.id !== track.id);
                    renderTracksList();
                } catch (error) {
                    console.error('Ошибка удаления трека:', error);
                }
            }
        });
        
        tracksList.appendChild(trackElement);
    });
    
    trackCount.textContent = `${playerState.tracks.length} трек${getTracksSuffix(playerState.tracks.length)}`;
};

const getTracksSuffix = (count) => {
    if (count % 100 >= 11 && count % 100 <= 19) return 'ов';
    switch (count % 10) {
        case 1: return '';
        case 2: case 3: case 4: return 'а';
        default: return 'ов';
    }
};

const initDragDrop = () => {
    const handleDragOver = (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    };
    
    const handleDragLeave = (e) => {
        if (!e.relatedTarget || !dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('active');
        }
    };
    
    const handleDrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files);
        }
    };
    
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
};

const initKeyboardShortcuts = () => {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
                break;
            case 'ArrowRight':
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
                break;
            case 'ArrowUp':
                e.preventDefault();
                playerState.volume = Math.min(1, playerState.volume + 0.1);
                audioPlayer.volume = playerState.volume;
                volumeBar.style.width = `${playerState.volume * 100}%`;
                updateVolumeIcon();
                break;
            case 'ArrowDown':
                e.preventDefault();
                playerState.volume = Math.max(0, playerState.volume - 0.1);
                audioPlayer.volume = playerState.volume;
                volumeBar.style.width = `${playerState.volume * 100}%`;
                updateVolumeIcon();
                break;
            case 'KeyM':
                toggleMute();
                break;
            case 'KeyN':
                nextTrack();
                break;
            case 'KeyP':
                prevTrack();
                break;
            case 'KeyS':
                toggleShuffle();
                break;
            case 'KeyR':
                toggleRepeat();
                break;
        }
    });
};

const initApp = async () => {
    try {
        initMediaSession();
        
        if (isIOS) {
            audioPlayer.setAttribute('playsinline', '');
            audioPlayer.setAttribute('webkit-playsinline', '');
            audioPlayer.setAttribute('autoplay', '');
            
            setupIOSBackgroundPlayback();
            
            const initVideoHelper = () => {
                if (videoHelper.src) return;
                videoHelper.src = 'data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthADAowdbb9/AAAC7W1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIYdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAA=';
                videoHelper.loop = true;
                videoHelper.muted = true;
                videoHelper.play().catch(() => {});
            };
            
            document.addEventListener('touchstart', initVideoHelper, { once: true });
            document.addEventListener('click', initVideoHelper, { once: true });
            
            const tryConfigureAudioSession = async () => {
                try {
                    if ('audioSession' in navigator) {
                        await navigator.audioSession.configure('playback');
                    }
                } catch (e) {
                    console.log('Audio session config error:', e);
                }
            };
            
            tryConfigureAudioSession();
        }
        
        db = await initDB();
        playerState.tracks = await loadTracksFromDB(db);
        
        await loadPlaylists();
        renderTracksList();
        
        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', prevTrack);
        nextBtn.addEventListener('click', nextTrack);
        shuffleBtn.addEventListener('click', toggleShuffle);
        repeatBtn.addEventListener('click', toggleRepeat);
        volumeBtn.addEventListener('click', toggleMute);
        
        audioPlayer.addEventListener('timeupdate', updateTime);
        audioPlayer.addEventListener('ended', handleTrackEnd);
        
        progressContainer.addEventListener('click', setProgress);
        volumeContainer.addEventListener('click', setVolume);
        
        initProgressDrag();
        initVolumeDrag();
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files);
                fileInput.value = '';
            }
        });
        
        if (folderInput) {
            folderInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFolderUpload(e.target.files);
                    folderInput.value = '';
                }
            });
        }
        
        playerState.volume = 0.7;
        audioPlayer.volume = playerState.volume;
        volumeBar.style.width = '70%';
        
        initDragDrop();
        initKeyboardShortcuts();
        
        window.addEventListener('resize', () => {
            if (playerState.isPlaying && canvasCtx) {
                drawVisualizer();
            }
        });
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
};

document.addEventListener('DOMContentLoaded', initApp);
