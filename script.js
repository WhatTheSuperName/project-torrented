import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
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

function isAdmin(username) {
    return username && username.toLowerCase() === 'admin';
}

function init3D() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 8;
    camera.position.y = 2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xb300ff,
        emissive: 0x4d0099,
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });
    
    const torusKnot = new THREE.Mesh(geometry, material);
    scene.add(torusKnot);

    const sphereGeometry = new THREE.SphereGeometry(2, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x4d0099,
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
    const colorArray = new Float32Array(particlesCount * 3);
    
    for(let i = 0; i < particlesCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 20;
        posArray[i+1] = (Math.random() - 0.5) * 20;
        posArray[i+2] = (Math.random() - 0.5) * 20;
        
        colorArray[i] = 0.7;
        colorArray[i+1] = 0;
        colorArray[i+2] = 1;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xb300ff, 1, 10);
    pointLight1.position.set(2, 3, 4);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x4d0099, 1, 10);
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
    return `${username}@project.torrented`;
}

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

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameModal(game.id);
    
    let coverHtml = '';
    if (game.coverImage) {
        if (game.coverImage.startsWith('http')) {
            coverHtml = `<img src="${game.coverImage}" alt="${game.title}">`;
        } else {
            coverHtml = `<div style="color: #b300ff; font-size: 10px;">${game.coverImage.substring(0, 100)}</div>`;
        }
    } else {
        coverHtml = `<div style="color: #b300ff;">[НЕТ ОБЛОЖКИ]</div>`;
    }
    
    card.innerHTML = `
        <div class="cover">${coverHtml}</div>
        <h3>${game.title || 'БЕЗ НАЗВАНИЯ'}</h3>
        <div class="description">${game.description || '...'}</div>
        <a href="${game.torrentLink || '#'}" class="download-btn" onclick="event.stopPropagation()" target="_blank">[ СКАЧАТЬ ]</a>
    `;
    
    return card;
}

async function openGameModal(gameId) {
    currentGameId = gameId;
    const game = gamesData.find(g => g.id === gameId);
    
    const modal = document.getElementById('comment-modal');
    document.querySelector('.modal-title').textContent = game?.title || 'КОММЕНТАРИИ';
    modal.style.display = 'flex';
    
    await loadComments(gameId);
}

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
            
            const date = comment.createdAt?.toDate();
            const dateStr = date ? `${date.toLocaleDateString()} ${date.toLocaleTimeString()}` : '??';
            
            commentDiv.innerHTML = `
                <div class="comment-header">
                    <span>${comment.userName || 'ANON'}</span>
                    <span>${dateStr}</span>
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
            userName: currentUser.email.split('@')[0],
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
            coverImage: cover || '',
            createdAt: Timestamp.now()
        });
        
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
    } catch (error) {
        console.error("Ошибка входа:", error);
        alert('Неверное имя или пароль');
    }
}

function setupEventListeners() {
    document.getElementById('show-login').addEventListener('click', () => {
        document.getElementById('login-modal').style.display = 'flex';
    });
    
    document.getElementById('show-register').addEventListener('click', () => {
        document.getElementById('register-modal').style.display = 'flex';
    });
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    
    document.getElementById('login-btn').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            alert('Введи имя и пароль!');
            return;
        }
        
        await loginUser(username, password);
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    });
    
    document.getElementById('register-btn').addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        
        if (!username || !password) {
            alert('Заполни все поля!');
            return;
        }
        
        if (password !== confirm) {
            alert('Пароли не совпадают!');
            return;
        }
        
        if (password.length < 6) {
            alert('Пароль должен быть минимум 6 символов');
            return;
        }
        
        const user = await registerUser(username, password);
        if (user) {
            document.getElementById('register-modal').style.display = 'none';
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            document.getElementById('reg-confirm').value = '';
        }
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth);
    });
    
    document.getElementById('add-game-btn').addEventListener('click', addGame);
    
    document.getElementById('send-comment').addEventListener('click', sendComment);
    
    document.getElementById('comment-text').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            sendComment();
        }
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('login-btn').click();
        }
    });
    
    document.getElementById('reg-confirm').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('register-btn').click();
        }
    });
}

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    
    if (user) {
        const username = user.email.split('@')[0];
        
        document.getElementById('unauth-buttons').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('display-name').textContent = `[ ${username} ]`;
        
        if (isAdmin(username)) {
            document.getElementById('admin-panel').style.display = 'block';
        } else {
            document.getElementById('admin-panel').style.display = 'none';
        }
        
        console.log(`%c✅ ВОШЕЛ: ${username}`, 'color: #b300ff');
    } else {
        document.getElementById('unauth-buttons').style.display = 'flex';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'none';
        
        console.log('%c❌ ВЫШЕЛ', 'color: #b300ff');
    }
});

init3D();
loadGames();
setupEventListeners();
