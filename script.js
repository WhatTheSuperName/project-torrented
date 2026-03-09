import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, orderBy, where, Timestamp, increment } from "firebase/firestore";
import * as THREE from 'three';

const firebaseConfig = {
    apiKey: "AIzaSyBWEoHWbCH430tklHFxQQUM4OmpDEi0Du0",
    authDomain: "project-torrented.firebaseapp.com",
    projectId: "project-torrented",
    storageBucket: "project-torrented.firebasestorage.app",
    messagingSenderId: "810658353738",
    appId: "1:810658353738:web:eecca4c92473d6f87fcc3b"
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
        
        const q = query(collection(db, "games"), orderBy("createdAt", "desc"));
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
            
            if (!game.downloads) game.downloads = 0;
            if (!game.verified) game.verified = false;
            if (!game.images) game.images = [];
            
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
    
    const shortDesc = game.description ? 
        (game.description.length > 100 ? game.description.substring(0, 100) + '...' : game.description) 
        : '...';
    
    card.innerHTML = `
        <div class="cover">${coverHtml}</div>
        <h3>${game.title || 'БЕЗ НАЗВАНИЯ'} ${verifiedBadge}</h3>
        <div class="description">${shortDesc}</div>
        <div class="game-stats">
            <span class="stat">⬇️ ${game.downloads || 0}</span>
            <span class="stat ${game.verified ? 'verified' : 'unverified'}">
                ${game.verified ? '✓ БЕЗОПАСНО' : '⚠ НЕ ПРОВЕРЕНО'}
            </span>
        </div>
    `;
    
    return card;
}

async function openGameModal(gameId) {
    currentGameId = gameId;
    const game = gamesData.find(g => g.id === gameId);
    if (!game) return;
    
    const modal = document.getElementById('game-modal');
    if (!modal) return;
    
    document.getElementById('game-modal-title').textContent = game.title || 'БЕЗ НАЗВАНИЯ';
    document.getElementById('game-full-desc').textContent = game.description || 'Нет описания';
    document.getElementById('game-downloads').innerHTML = `⬇️ ${game.downloads || 0}`;
    document.getElementById('game-download-link').href = game.torrentLink || '#';
    
    const verifiedStatus = document.getElementById('game-modal-verified');
    if (verifiedStatus) {
        verifiedStatus.className = game.verified ? 'verified' : 'unverified';
        verifiedStatus.innerHTML = game.verified ? 
            '✓ ПРОВЕРЕНО НА ВИРУСЫ' : 
            '⚠ НЕ ПРОВЕРЕНО';
    }
    
    const mainImage = document.getElementById('game-main-image');
    mainImage.innerHTML = game.coverImage ? 
        `<img src="${game.coverImage}" alt="${game.title}">` : 
        '<div style="color: #9933ff; display: flex; align-items: center; justify-content: center; height: 100%;">[НЕТ ИЗОБРАЖЕНИЯ]</div>';
    
    const thumbnails = document.getElementById('game-thumbnails');
    thumbnails.innerHTML = '';
    
    const allImages = [];
    if (game.coverImage) allImages.push(game.coverImage);
    if (game.image1) allImages.push(game.image1);
    if (game.image2) allImages.push(game.image2);
    if (game.image3) allImages.push(game.image3);
    
    allImages.forEach((imgUrl, index) => {
        const thumb = document.createElement('div');
        thumb.className = `thumbnail ${index === 0 ? 'active' : ''}`;
        thumb.innerHTML = `<img src="${imgUrl}" alt="Thumbnail ${index + 1}" onclick="window.changeMainImage('${imgUrl}', this)">`;
        thumbnails.appendChild(thumb);
    });
    
    modal.style.display = 'flex';
    await loadComments(gameId);
}

window.changeMainImage = function(imgUrl, element) {
    const mainImage = document.getElementById('game-main-image');
    mainImage.innerHTML = `<img src="${imgUrl}" alt="Main image">`;
    
    document.querySelectorAll('.thumbnail').forEach(thumb => {
        thumb.classList.remove('active');
    });
    element.parentElement.classList.add('active');
};

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
                <div class="comment
