import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import * as THREE from 'three';
import { getRandomAscii } from './asciiarts.js';

// Firebase конфиг
const firebaseConfig = {
    apiKey: "AIzaSyBWEoHWbCH430tklHFxQQUM4OmpDEi0Du0",
    authDomain: "project-torrented.firebaseapp.com",
    projectId: "project-torrented",
    storageBucket: "project-torrented.firebasestorage.app",
    messagingSenderId: "810658353738",
    appId: "1:810658353738:web:eecca4c92473d6f87fccb3"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Глобальные переменные
let currentUser = null;
let currentGameId = null;
let gamesData = [];

// Проверка на админа (по нику)
function isAdmin(username) {
    return username && username.toLowerCase() === 'admin';
}

// Инициализация 3D сцены
function init3D() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Создаем куб из ASCII-символов (матричный стиль)
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    
    // Создаем текстуру с ASCII-символами
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = '20px Courier New';
    ctx.fillStyle = '#00ff00';
    
    // Рисуем случайные ASCII символы
    for(let i = 0; i < 50; i++) {
        const x = Math.random() * 200 + 28;
        const y = Math.random() * 200 + 28;
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, wireframe: true, color: 0x00ff00 });
    
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Добавляем floating particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 1000;
    const posArray = new Float32Array(particlesCount * 3);
    
    for(let i = 0; i < particlesCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 10;
        posArray[i+1] = (Math.random() - 0.5) * 10;
        posArray[i+2] = (Math.random() - 0.5) * 10;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.02,
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5
    });
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    // Анимация
    function animate() {
        requestAnimationFrame(animate);
        
        cube.rotation.x += 0.001;
        cube.rotation.y += 0.002;
        
        particlesMesh.rotation.y += 0.0001;
        
        renderer.render(scene, camera);
    }
    
    animate();

    // Обработка ресайза окна
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Преобразование имени в email для Firebase
function nameToEmail(username) {
    return `${username}@project.local`;
}

// Загрузка игр из Firestore
async function loadGames() {
    try {
        const gamesList = document.getElementById('games-list');
        gamesList.innerHTML = '<div class="loading">ЗАГРУЗКА...</div>';
        
        const q = query(collection(db, "games"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        gamesData = [];
        gamesList.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const game = { id: doc.id, ...doc.data() };
            gamesData.push(game);
            gamesList.appendChild(createGameCard(game));
        });
        
        if (gamesData.length === 0) {
            gamesList.innerHTML = '<div class="loading">[ НЕТ ИГР ]</div>';
        }
    } catch (error) {
        console.error("Ошибка загрузки игр:", error);
        document.getElementById('games-list').innerHTML = '<div class="loading">[ ОШИБКА ЗАГРУЗКИ ]</div>';
    }
}

// Создание карточки игры
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameModal(game.id);
    
    const coverHtml = game.coverImage && game.coverImage.startsWith('http') 
        ? `<img src="${game.coverImage}" style="width:100%;height:100%;object-fit:cover;">`
        : `<pre>${game.coverImage || getRandomAscii()}</pre>`;
    
    card.innerHTML = `
        <div class="cover">${coverHtml}</div>
        <h3>${game.title || 'БЕЗ НАЗВАНИЯ'}</h3>
        <div class="description">${game.description || '...'}</div>
        <a href="${game.torrentLink || '#'}" class="download-btn" onclick="event.stopPropagation()" target="_blank">[ СКАЧАТЬ ]</a>
    `;
    
    return card;
}

// Открытие модального окна с комментариями
async function openGameModal(gameId) {
    currentGameId = gameId;
    const game = gamesData.find(g => g.id === gameId);
    
    const modal = document.getElementById('comment-modal');
    modal.querySelector('.modal-title').textContent = game?.title || 'КОММЕНТАРИИ';
    modal.style.display = 'flex';
    
    await loadComments(gameId);
}

// Загрузка комментариев
async function loadComments(gameId) {
    try {
        const commentsList = document.getElementById('comments-list');
        commentsList.innerHTML = '<div class="loading">ЗАГРУЗКА...</div>';
        
        const q = query(
            collection(db, "comments"), 
            where("gameId", "==", gameId),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        
        commentsList.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const comment = doc.data();
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment';
            commentDiv.innerHTML = `
                <div class="comment-header">
                    <span>${comment.userName || 'ANON'}</span>
                    <span>${comment.createdAt?.toDate().toLocaleString() || '??'}</span>
                </div>
                <div class="comment-text">${comment.text || ''}</div>
            `;
            commentsList.appendChild(commentDiv);
        });
        
        if (commentsList.children.length === 0) {
            commentsList.innerHTML = '<div class="loading">[ НЕТ КОММЕНТАРИЕВ ]</div>';
        }
    } catch (error) {
        console.error("Ошибка загрузки комментариев:", error);
    }
}

// Отправка комментария
async function sendComment() {
    if (!currentUser) {
        alert('Сначала войди!');
        return;
    }
    
    const text = document.getElementById('comment-text').value.trim();
    if (!text) return;
    
    try {
        await addDoc(collection(db, "comments"), {
            gameId: currentGameId,
            userId: currentUser.uid,
            userName: currentUser.email.split('@')[0], // Имя из email
            text: text,
            createdAt: Timestamp.now()
        });
        
        document.getElementById('comment-text').value = '';
        await loadComments(currentGameId);
    } catch (error) {
        console.error("Ошибка отправки комментария:", error);
        alert('Ошибка отправки');
    }
}

// Добавление игры (только для Admin)
async function addGame() {
    if (!isAdmin(currentUser?.email.split('@')[0])) {
        alert('Только Admin может добавлять игры!');
        return;
    }
    
    const title = document.getElementById('game-title').value.trim();
    const desc = document.getElementById('game-desc').value.trim();
    const torrent = document.getElementById('game-torrent').value.trim();
    const cover = document.getElementById('game-cover').value.trim();
    
    if (!title || !torrent) {
        alert('Название и ссылка обязательны!');
        return;
    }
    
    try {
        await addDoc(collection(db, "games"), {
            title: title,
            description: desc || '...',
            torrentLink: torrent,
            coverImage: cover || getRandomAscii(),
            createdAt: Timestamp.now()
        });
        
        // Очистка формы
        document.getElementById('game-title').value = '';
        document.getElementById('game-desc').value = '';
        document.getElementById('game-torrent').value = '';
        document.getElementById('game-cover').value = '';
        
        await loadGames();
        alert('Игра добавлена!');
    } catch (error) {
        console.error("Ошибка добавления игры:", error);
        alert('Ошибка добавления');
    }
}

// Настройка слушателей событий
function setupEventListeners() {
    // Логин
    document.getElementById('login-btn').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            alert('Введи имя и пароль!');
            return;
        }
        
        try {
            const email = nameToEmail(username);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Ошибка входа:", error);
            alert('Неверное имя или пароль');
        }
    });
    
    // Логаут
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth);
    });
    
    // Добавление игры
    document.getElementById('add-game-btn').addEventListener('click', addGame);
    
    // Отправка комментария
    document.getElementById('send-comment').addEventListener('click', sendComment);
    
    // Закрытие модалки
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('comment-modal').style.display = 'none';
    });
    
    // Закрытие по клику вне модалки
    document.getElementById('comment-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('comment-modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Enter в поле пароля
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('login-btn').click();
        }
    });
    
    // Enter в поле комментария (Ctrl+Enter)
    document.getElementById('comment-text').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            sendComment();
        }
    });
}

// Отслеживание состояния авторизации
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    
    if (user) {
        const username = user.email.split('@')[0];
        
        // Обновляем UI
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('display-name').textContent = `[ ${username} ]`;
        
        // Показываем панель админа если нужно
        if (isAdmin(username)) {
            document.getElementById('admin-panel').style.display = 'block';
        } else {
            document.getElementById('admin-panel').style.display = 'none';
        }
        
        console.log(`%c✅ ВОШЕЛ: ${username}`, 'color: #0f0');
    } else {
        // Пользователь выше
