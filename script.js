import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, query, orderBy, where, Timestamp, increment } from "firebase/firestore";
import * as THREE from 'three';

const firebaseConfig = {
    apiKey: "AIzaSyBWEoHWbCH430tklHFxQQUM4OmpDEi0Du0",
    authDomain: "project-torrented.firebaseapp.com",
    projectId: "project-torrented",
    storageBucket: "project-torrented.firebasestorage.app",
    messagingSenderId: "810658353738",
    appId: "1:810658353738:web:eecca4c92473d6f87fccb3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentGameId = null;
let gamesData = [];
let currentFilter = 'all';

function isAdmin(username) {
    return username && username.toLowerCase() === 'admin';
}

function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 8;
    camera.position.y = 2;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x9933ff,
        emissive: 0x330066,
        wireframe: true
    });
    
    const torusKnot = new THREE.Mesh(geometry, material);
    scene.add(torusKnot);

    const sphereGeometry = new THREE.SphereGeometry(2, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x6600cc,
        wireframe: true,
        transparent: true,
        opacity: 0.2
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.scale.set(1.5, 1.5, 1.5);
    scene.add(sphere);

    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 2000;
    const posArray = new Float32Array(particlesCount * 3);
    
    for(let i = 0; i < particlesCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 20;
        posArray[i+1] = (Math.random() - 0.5) * 20;
        posArray[i+2] = (Math.random() - 0.5) * 20;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.05,
        color: 0x9933ff,
        transparent: true,
        opacity: 0.6
    });
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    const ambientLight = new THREE.AmbientLight(0x331144);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x9933ff, 1, 10);
    pointLight1.position.set(2, 3, 4);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x6600cc, 1, 10);
    pointLight2.position.set(-3, -1, 2);
    scene.add(pointLight2);

    function animate() {
        requestAnimationFrame(animate);
        
        torusKnot.rotation.x += 0.005;
        torusKnot.rotation.y += 0.01;
        
        sphere.rotation.x += 0.001;
        sphere.rotation.y += 0.002;
        
        particlesMesh.rotation.y += 0.0002;
        
        renderer.render(scene, camera);
    }
    
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function nameToEmail(username) {
    return username.toLowerCase() + '@project.torrented';
}

async function loadGames(searchTerm = '') {
    try {
        const gamesList = document.getElementById('games-list');
        if (!gamesList) return;
        
        gamesList.innerHTML = '<div class="loading">ЗАГРУЗКА...</div>';
        
        let q;
        if (currentFilter === 'popular') {
            q = query(collection(db, "games"), orderBy("downloads", "desc"));
        } else if (currentFilter === 'liked') {
            q = query(collection(db, "games"), orderBy("likes", "desc"));
        } else {
            q = query(collection(db, "games"), orderBy("createdAt", "desc"));
        }
        
        const querySnapshot = await getDocs(q);
        
        gamesData = [];
        gamesList.innerHTML = '';
        
        if (querySnapshot.empty) {
            gamesList.innerHTML = '<div class="loading">[ НЕТ ИГР ]</div>';
            return;
        }
        
        let filteredGames = [];
        querySnapshot.forEach((doc) => {
            const game = { id: doc.id, ...doc.data() };
            
            if (!game.likes) game.likes = 0;
            if (!game.downloads) game.downloads = 0;
            if (!game.verified) game.verified = false;
            
            filteredGames.push(game);
        });
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredGames = filteredGames.filter(game => 
                game.title.toLowerCase().includes(term)
            );
        }
        
        gamesData = filteredGames;
        
        if (filteredGames.length === 0) {
            gamesList.innerHTML = '<div class="loading">[ НИЧЕГО НЕ НАЙДЕНО ]</div>';
            return;
        }
        
        filteredGames.forEach(game => {
            gamesList.appendChild(createGameCard(game));
        });
        
    } catch (error) {
        console.error("Ошибка загрузки игр:", error);
        const gamesList = document.getElementById('games-list');
        if (gamesList) {
            gamesList.innerHTML = '<div class="loading">[ ОШИБКА ЗАГРУЗКИ ]</div>';
        }
    }
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameModal(game.id);
    
    let coverHtml = '<div style="color: #9933ff;">[НЕТ ОБЛОЖКИ]</div>';
    if (game.coverImage) {
        if (game.coverImage.startsWith('http')) {
            coverHtml = `<img src="${game.coverImage}" alt="${game.title}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            coverHtml = `<div style="color: #9933ff;">${game.coverImage}</div>`;
        }
    }
    
    const verifiedBadge = game.verified ? '<span class="verified-badge" title="Проверено на вирусы">✓</span>' : '';
    
    card.innerHTML = `
        <div class="cover">${coverHtml}</div>
        <h3>${game.title || 'БЕЗ НАЗВАНИЯ'} ${verifiedBadge}</h3>
        <div class="description">${game.description || '...'}</div>
        <div class="game-stats">
            <span class="stat">❤️ ${game.likes || 0}</span>
            <span class="stat">⬇️ ${game.downloads || 0}</span>
            <span class="stat ${game.verified ? 'verified' : 'unverified'}">
                ${game.verified ? '✓ БЕЗОПАСНО' : '⚠ НЕ ПРОВЕРЕНО'}
            </span>
        </div>
        <a href="${game.torrentLink || '#'}" class="download-btn" onclick="event.stopPropagation(); handleDownload('${game.id}'); return false;">[ СКАЧАТЬ ]</a>
    `;
    
    return card;
}

window.handleDownload = async function(gameId) {
    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            downloads: increment(1)
        });
        
        const game = gamesData.find(g => g.id === gameId);
        if (game) {
            game.downloads = (game.downloads || 0) + 1;
        }
        
        window.open(game.torrentLink, '_blank');
    } catch (error) {
        console.error("Ошибка обновления счетчика:", error);
        const game = gamesData.find(g => g.id === gameId);
        if (game && game.torrentLink) {
            window.open(game.torrentLink, '_blank');
        }
    }
};

window.likeGame = async function(gameId, event) {
    event.stopPropagation();
    
    if (!currentUser) {
        alert('Войди, чтобы ставить лайки!');
        return;
    }
    
    try {
        const gameRef = doc(db, "games", gameId);
        await updateDoc(gameRef, {
            likes: increment(1)
        });
        
        const game = gamesData.find(g => g.id === gameId);
        if (game) {
            game.likes = (game.likes || 0) + 1;
        }
        
        const likesSpan = event.currentTarget.querySelector('.likes-count');
        if (likesSpan) {
            const currentLikes = parseInt(likesSpan.textContent) || 0;
            likesSpan.textContent = currentLikes + 1;
        }
        
    } catch (error) {
        console.error("Ошибка лайка:", error);
    }
};

async function openGameModal(gameId) {
    currentGameId = gameId;
    const game = gamesData.find(g => g.id === gameId);
    
    const modal = document.getElementById('comment-modal');
    if (!modal) return;
    
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) {
        titleEl.textContent = game?.title || 'КОММЕНТАРИИ';
    }
    
    const verifiedStatus = document.getElementById('modal-verified-status');
    if (verifiedStatus && game) {
        verifiedStatus.className = game.verified ? 'verified' : 'unverified';
        verifiedStatus.innerHTML = game.verified ? 
            '✓ ПРОВЕРЕНО НА ВИРУСЫ' : 
            '⚠ НЕ ПРОВЕРЕНО (СКАЧИВАЙ НА СВОЙ РИСК)';
    }
    
    modal.style.display = 'flex';
    await loadComments(gameId);
}

async function loadComments(gameId) {
    try {
        const commentsList = document.getElementById('comments-list');
        if (!commentsList) return;
        
        commentsList.innerHTML = '<div class="loading">ЗАГРУЗКА...</div>';
        
        const q = query(
            collection(db, "comments"), 
            where("gameId", "==", gameId),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        
        commentsList.innerHTML = '';
        
        if (querySnapshot.empty) {
            commentsList.innerHTML = '<div class="loading">[ НЕТ КОММЕНТАРИЕВ ]</div>';
            return;
        }
        
        querySnapshot.forEach((doc) => {
            const comment = doc.data();
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment';
            
            let dateStr = '??';
            if (comment.createdAt) {
                const date = comment.createdAt.toDate();
                dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            }
            
            commentDiv.innerHTML = `
                <div class="comment-header">
                    <span>${comment.userName || 'ANON'}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="comment-text">${comment.text || ''}</div>
            `;
            commentsList.appendChild(commentDiv);
        });
        
    } catch (error) {
        console.error("Ошибка загрузки комментариев:", error);
    }
}

async function sendComment() {
    if (!currentUser) {
        alert('Сначала войди!');
        return;
    }
    
    const text = document.getElementById('comment-text');
    if (!text) return;
    
    const commentText = text.value.trim();
    if (!commentText) return;
    
    try {
        await addDoc(collection(db, "comments"), {
            gameId: currentGameId,
            userId: currentUser.uid,
            userName: currentUser.email.split('@')[0],
            text: commentText,
            createdAt: Timestamp.now()
        });
        
        text.value = '';
        await loadComments(currentGameId);
    } catch (error) {
        console.error("Ошибка отправки комментария:", error);
        alert('Ошибка отправки');
    }
}

async function addGame() {
    if (!currentUser || !isAdmin(currentUser.email.split('@')[0])) {
        alert('Только Admin может добавлять игры!');
        return;
    }
    
    const title = document.getElementById('game-title');
    const desc = document.getElementById('game-desc');
    const torrent = document.getElementById('game-torrent');
    const cover = document.getElementById('game-cover');
    const verified = document.getElementById('game-verified');
    
    if (!title || !torrent) return;
    
    const titleVal = title.value.trim();
    const torrentVal = torrent.value.trim();
    
    if (!titleVal || !torrentVal) {
        alert('Название и ссылка обязательны!');
        return;
    }
    
    try {
        await addDoc(collection(db, "games"), {
            title: titleVal,
            description: desc ? desc.value.trim() || '...' : '...',
            torrentLink: torrentVal,
            coverImage: cover ? cover.value.trim() : '',
            verified: verified ? verified.checked : false,
            likes: 0,
            downloads: 0,
            createdAt: Timestamp.now()
        });
        
        title.value = '';
        if (desc) desc.value = '';
        if (torrent) torrent.value = '';
        if (cover) cover.value = '';
        if (verified) verified.checked = false;
        
        await loadGames(document.getElementById('search-input').value.trim());
        alert('Игра добавлена!');
    } catch (error) {
        console.error("Ошибка добавления игры:", error);
        alert('Ошибка добавления');
    }
}

async function registerUser(username, password) {
    try {
        const email = nameToEmail(username);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        alert('Регистрация успешна!');
        return userCredential.user;
    } catch (error) {
        console.error("Ошибка регистрации:", error);
        if (error.code === 'auth/email-already-in-use') {
            alert('Это имя уже занято!');
        } else if (error.code === 'auth/weak-password') {
            alert('Пароль слишком простой! Минимум 6 символов');
        } else {
            alert('Ошибка регистрации: ' + error.message);
        }
        return null;
    }
}

async function loginUser(username, password) {
    try {
        const email = nameToEmail(username);
        await signInWithEmailAndPassword(auth, email, password);
        return true;
    } catch (error) {
        console.error("Ошибка входа:", error);
        if (error.code === 'auth/user-not-found') {
            alert('Пользователь не найден');
        } else if (error.code === 'auth/wrong-password') {
            alert('Неверный пароль');
        } else {
            alert('Ошибка входа: ' + error.message);
        }
        return false;
    }
}

function setupEventListeners() {
    const showLogin = document.getElementById('show-login');
    if (showLogin) {
        showLogin.addEventListener('click', () => {
            const modal = document.getElementById('login-modal');
            if (modal) modal.style.display = 'flex';
        });
    }
    
    const showRegister = document.getElementById('show-register');
    if (showRegister) {
        showRegister.addEventListener('click', () => {
            const modal = document.getElementById('register-modal');
            if (modal) modal.style.display = 'flex';
        });
    }
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const username = document.getElementById('login-username');
            const password = document.getElementById('login-password');
            
            if (!username || !password) return;
            
            const usernameVal = username.value.trim();
            const passwordVal = password.value;
            
            if (!usernameVal || !passwordVal) {
                alert('Введи имя и пароль!');
                return;
            }
            
            const success = await loginUser(usernameVal, passwordVal);
            if (success) {
                const modal = document.getElementById('login-modal');
                if (modal) modal.style.display = 'none';
                username.value = '';
                password.value = '';
            }
        });
    }
    
    const registerBtn = document.getElementById('register-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const username = document.getElementById('reg-username');
            const password = document.getElementById('reg-password');
            const confirm = document.getElementById('reg-confirm');
            
            if (!username || !password || !confirm) return;
            
            const usernameVal = username.value.trim();
            const passwordVal = password.value;
            const confirmVal = confirm.value;
            
            if (!usernameVal || !passwordVal) {
                alert('Заполни все поля!');
                return;
            }
            
            if (passwordVal !== confirmVal) {
                alert('Пароли не совпадают!');
                return;
            }
            
            if (passwordVal.length < 6) {
                alert('Пароль должен быть минимум 6 символов');
                return;
            }
            
            const user = await registerUser(usernameVal, passwordVal);
            if (user) {
                const modal = document.getElementById('register-modal');
                if (modal) modal.style.display = 'none';
                username.value = '';
                password.value = '';
                if (confirm) confirm.value = '';
            }
        });
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth);
        });
    }
    
    const addGameBtn = document.getElementById('add-game-btn');
    if (addGameBtn) {
        addGameBtn.addEventListener('click', addGame);
    }
    
    const sendCommentBtn = document.getElementById('send-comment');
    if (sendCommentBtn) {
        sendCommentBtn.addEventListener('click', sendComment);
    }
    
    const commentText = document.getElementById('comment-text');
    if (commentText) {
        commentText.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                sendComment();
            }
        });
    }
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const btn = document.getElementById('login-btn');
                if (btn) btn.click();
            }
        });
    }
    
    const regConfirm = document.getElementById('reg-confirm');
    if (regConfirm) {
        regConfirm.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const btn = document.getElementById('register-btn');
                if (btn) btn.click();
            }
        });
    }
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            loadGames(e.target.value.trim());
        });
    }
    
    const filterPopular = document.getElementById('filter-popular');
    if (filterPopular) {
        filterPopular.addEventListener('click', () => {
            currentFilter = 'popular';
            loadGames(document.getElementById('search-input').value.trim());
        });
    }
    
    const filterLiked = document.getElementById('filter-liked');
    if (filterLiked) {
        filterLiked.addEventListener('click', () => {
            currentFilter = 'liked';
            loadGames(document.getElementById('search-input').value.trim());
        });
    }
    
    const filterNew = document.getElementById('filter-new');
    if (filterNew) {
        filterNew.addEventListener('click', () => {
            currentFilter = 'new';
            loadGames(document.getElementById('search-input').value.trim());
        });
    }
}

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    
    const unauthButtons = document.getElementById('unauth-buttons');
    const userInfo = document.getElementById('user-info');
    const displayName = document.getElementById('display-name');
    const adminPanel = document.getElementById('admin-panel');
    
    if (user) {
        const username = user.email.split('@')[0];
        
        if (unauthButtons) unauthButtons.style.display = 'none';
        if (userInfo) userInfo.style.display = 'block';
        if (displayName) displayName.textContent = `[ ${username} ]`;
        
        if (adminPanel) {
            if (isAdmin(username)) {
                adminPanel.style.display = 'block';
            } else {
                adminPanel.style.display = 'none';
            }
        }
        
        console.log(`%c✅ ВОШЕЛ: ${username}`, 'color: #9933ff');
    } else {
        if (unauthButtons) unauthButtons.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'none';
        
        console.log('%c❌ ВЫШЕЛ', 'color: #9933ff');
    }
});

window.addEventListener('load', () => {
    init3D();
    loadGames();
    setupEventListeners();
});
