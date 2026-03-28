const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:3000/api/posts' : 'posts.json';

const GITHUB_REPO = 'FLEXIY0/sys-logs';
const GITHUB_PATH = 'posts.json';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
let githubToken = localStorage.getItem('myblog_github_token') || '';

const PASS_PHRASE = "все будет хорошо";
let isEditMode = false;
let posts = [];

const modeToggle = document.getElementById('mode-toggle');
const modeLabel = document.getElementById('mode-label');
const passwordModal = document.getElementById('password-modal');
const passwordInput = document.getElementById('password-input');
const passwordError = document.getElementById('password-error');
const logoutBtnWrapper = document.getElementById('logout-container');
const newPostText = document.getElementById('new-post-text');
const postsContainer = document.getElementById('posts-container');
const toggleContainer = document.querySelector('.toggle-container');

window.onload = () => {
    // В отличие от прошлого раза, теперь тумблер редактирования виден ВСЕГДА!
    loadPosts();
    modeToggle.checked = false;
};

// --- UI Переключения ---
modeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        e.target.checked = false;
        openPasswordModal();
    } else {
        setEditMode(false);
    }
});

function openPasswordModal() {
    passwordError.style.display = 'none';
    
    if (IS_LOCAL) {
        document.getElementById('modal-title').textContent = 'Локальный режим (Компьютер)';
        document.getElementById('modal-desc').textContent = 'Введите кодовую фразу для редактирования:';
        passwordInput.placeholder = 'Кодовая фраза';
        logoutBtnWrapper.style.display = 'none';
        passwordInput.value = '';
    } else {
        document.getElementById('modal-title').textContent = 'Режим Автора (GitHub API)';
        document.getElementById('modal-desc').textContent = 'Введите ваш GitHub Personal Access Token (classic, с галкой repo):';
        passwordInput.placeholder = 'ghp_...';
        
        if (githubToken) {
            passwordInput.value = githubToken;
            logoutBtnWrapper.style.display = 'block';
        } else {
            passwordInput.value = '';
            logoutBtnWrapper.style.display = 'none';
        }
    }

    passwordModal.style.display = 'flex';
    passwordInput.focus();
}

function closePasswordModal() {
    passwordModal.style.display = 'none';
}

// --- Кастомный Confirm ---
let confirmResolve = null;
function showCustomConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById('confirm-msg').textContent = msg;
        document.getElementById('confirm-modal').style.display = 'flex';
        confirmResolve = resolve;
    });
}

function closeConfirmModal(result) {
    document.getElementById('confirm-modal').style.display = 'none';
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

function logoutGithub() {
    githubToken = '';
    localStorage.removeItem('myblog_github_token');
    passwordInput.value = '';
    logoutBtnWrapper.style.display = 'none';
}

passwordInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') verifyPassword();
});

function showError(msg) {
    passwordError.textContent = msg;
    passwordError.style.display = 'block';
}

async function verifyPassword() {
    passwordError.style.display = 'none';

    if (IS_LOCAL) {
        if (passwordInput.value.toLowerCase().trim() === PASS_PHRASE) {
            closePasswordModal();
            setEditMode(true);
        } else {
            showError("Неверная фраза!");
        }
    } else {
        const token = passwordInput.value.trim();
        if (!token) return showError("Токен не введен");

        // Проверяем токен через GitHub
        try {
            const res = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                githubToken = token;
                localStorage.setItem('myblog_github_token', token);
                closePasswordModal();
                setEditMode(true);
            } else {
                showError("Неверный токен GitHub или нет прав.");
            }
        } catch(e) {
            showError("Ошибка сети. Проверьте интернет.");
        }
    }
}

function setEditMode(enable) {
    isEditMode = enable;
    modeToggle.checked = enable;
    if (enable) {
        document.body.classList.add('edit-mode');
        modeLabel.textContent = IS_LOCAL ? 'Редактирование' : 'GitHub Edit';
    } else {
        document.body.classList.remove('edit-mode');
        modeLabel.textContent = 'Просмотр';
        renderPosts();
    }
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('ru-RU', options);
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function parseMarkdownImages(text) {
    // Регулярка для ![alt](url)
    const regex = /!\[([^\]]*)\]\(([^\s)]+)\)/g;
    return text.replace(regex, `<img src="$2" alt="$1" style="max-width: 100%; height: auto; display: block; border-radius: 4px; margin: 1.5rem 0;" loading="lazy">`);
}

async function handleImageUpload(event, textareaId) {
    const file = event.target.files[0];
    if (!file) return;

    // Сбросить input чтобы можно было выбрать тот же файл снова
    event.target.value = '';

    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    if (!IS_LOCAL && !githubToken) {
        alert("ОШИБКА: Загружать фото может только автор блога. Пожалуйста, введите GitHub токен во вкладке Редактирование.");
        return;
    }

    // Вставляем заглушку в текстовое поле
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const placeholder = `\n![Загрузка фото...]\n`;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + placeholder + text.substring(end);

    const safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9.-]/g, '');
    const reader = new FileReader();
    
    reader.onload = async () => {
        const base64Full = reader.result;
        let imageUrl = '';

        try {
            if (IS_LOCAL) {
                const res = await fetch('http://localhost:3000/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: safeName, base64: base64Full })
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                imageUrl = data.url;
            } else {
                const base64Data = base64Full.replace(/^data:image\/\w+;base64,/, "");
                const githubApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/images/${safeName}`;
                
                const putRes = await fetch(githubApiUrl, {
                    method: 'PUT',
                    headers: { 
                        'Authorization': `Bearer ${githubToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: "Upload image via blog mobile UI",
                        content: base64Data
                    })
                });

                if (!putRes.ok) throw new Error("GitHub error");
                imageUrl = `images/${safeName}`; 
            }

            // Успех, меняем placeholder
            textarea.value = textarea.value.replace(placeholder, `\n![фото](${imageUrl})\n`);
        } catch (e) {
            alert("Ошибка сети или нет прав.");
            textarea.value = textarea.value.replace(placeholder, "\n[Ошибка загрузки. Возможно вы не ввели токен github]\n");
        }
    };
    reader.onerror = () => {
         textarea.value = textarea.value.replace(placeholder, "\n[Ошибка чтения файла телефоном]\n");
    };
    reader.readAsDataURL(file);
}

function encodeBase64Unicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

// --- Запросы ---

async function loadPosts() {
    try {
        const urlToFetch = IS_LOCAL ? API_URL : `${API_URL}?t=${Date.now()}`;
        const response = await fetch(urlToFetch);
        if (response.ok) {
            posts = await response.json();
            renderPosts();
        } else if (!IS_LOCAL && response.status === 404) {
             posts = [];
             renderPosts();
        }
    } catch (error) {
        console.error("Ошибка загрузки:", error);
    }
}

async function pushToGithub(newPostsData) {
    let sha = null;
    try {
        const getRes = await fetch(GITHUB_API_URL, {
            headers: { 'Authorization': `Bearer ${githubToken}` }
        });
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
        }
    } catch (e) {
        console.log("Возможно, файл еще не создан");
    }

    const content = encodeBase64Unicode(JSON.stringify(newPostsData, null, 2));
    const body = {
        message: "Автоматическое обновление поста с телефона",
        content: content
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(GITHUB_API_URL, {
        method: 'PUT',
        headers: { 
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!putRes.ok) throw new Error();
}

async function addPost() {
    const text = newPostText.value.trim();
    if (!text) return;

    if (IS_LOCAL) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (response.ok) {
            newPostText.value = '';
            await loadPosts();
        }
    } else {
        try {
            const newPost = {
                id: Date.now(),
                createdAt: new Date().toISOString(),
                updatedAt: null,
                versions: [{ text, timestamp: new Date().toISOString() }]
            };
            posts.unshift(newPost);
            
            newPostText.value = 'Обновляю github...';
            newPostText.disabled = true;
            
            await pushToGithub(posts);
            
            newPostText.value = '';
            newPostText.disabled = false;
            renderPosts();
            alert("Пост сохранён на GitHub! На сайте он появится через 1-2 минуты (особенность GitHub Pages).");
        } catch(e) {
            alert("Ошибка сохранения в GitHub. Проверьте токен.");
            newPostText.disabled = false;
        }
    }
}

async function saveEditing(id) {
    const newText = document.getElementById(`edit-text-${id}`).value.trim();
    if (!newText) return alert("Текст пуст.");

    if (IS_LOCAL) {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newText })
        });
        if (response.ok) await loadPosts();
    } else {
        try {
            const post = posts.find(p => p.id === id);
            if (post) {
                const latestVersion = post.versions[post.versions.length - 1].text;
                if (latestVersion !== newText) {
                    post.versions.push({
                        text: newText,
                        timestamp: new Date().toISOString()
                    });
                    post.updatedAt = new Date().toISOString();
                    
                    const btn = document.querySelector(`#edit-form-${id} .btn-success`);
                    const oldTextBtn = btn.textContent;
                    btn.textContent = 'Сохранение...';
                    
                    await pushToGithub(posts);
                    
                    btn.textContent = oldTextBtn;
                    alert("Редактирование сохранено! Страница обновится через пару минут.");
                }
            }
            renderPosts();
        } catch(e) {
            alert("Ошибка сохранения в GitHub.");
        }
    }
}

async function revertToOriginal(id) {
    if (!(await showCustomConfirm("Вы уверены, что хотите вернуть этот пост к первоначальной версии?"))) return;

    if (IS_LOCAL) {
        const response = await fetch(`${API_URL}/${id}/revert`, { method: 'POST' });
        if (response.ok) await loadPosts();
    } else {
        try {
            const post = posts.find(p => p.id === id);
            if (post && post.versions.length > 1) {
                const originalText = post.versions[0].text;
                const latestVersion = post.versions[post.versions.length - 1].text;
                if (latestVersion !== originalText) {
                    post.versions.push({
                        text: originalText,
                        timestamp: new Date().toISOString(),
                        isRevert: true
                    });
                    post.updatedAt = new Date().toISOString();
                    await pushToGithub(posts);
                    alert("Версия восстановлена!");
                }
            }
            renderPosts();
        } catch(e) {
            alert("Ошибка сохранения в GitHub.");
        }
    }
}

async function deletePost(id) {
    if (!(await showCustomConfirm("Вы уверены, что хотите НАВСЕГДА удалить эту запись?"))) return;

    if (IS_LOCAL) {
        const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (response.ok) await loadPosts();
    } else {
        try {
            const index = posts.findIndex(p => p.id === id);
            if (index !== -1) {
                posts.splice(index, 1);
                await pushToGithub(posts);
                alert("Пост удален! Обновление на сайте займет пару минут.");
            }
            renderPosts();
        } catch(e) {
            alert("Ошибка удаления в GitHub. Проверьте токен.");
        }
    }
}

// --- Рендеринг ---

function renderPosts() {
    postsContainer.innerHTML = '';
    
    if (posts.length === 0) {
        postsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Записей пока нет.</p>';
        return;
    }

    posts.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'post';
        postEl.setAttribute('data-id', post.id);

        const originalText = post.versions[0].text;
        const currentVersionIndex = post.versions.length - 1;
        const currentText = post.versions[currentVersionIndex].text;
        
        const isEdited = post.versions.length > 1 && currentText !== originalText;

        let historyLinks = '';
        if (post.versions.length > 1) {
            post.versions.forEach((ver, idx) => {
                const isCurrent = (idx === currentVersionIndex);
                const color = isCurrent ? 'white' : 'var(--primary)';
                historyLinks += `<a href="#" onclick="showVersion(${post.id}, ${idx}); return false;" style="color: ${color}; text-decoration: none; margin-right: 15px; display: inline-block;">v${idx + 1} (${formatDate(ver.timestamp)})</a>`;
            });
        }

        let html = `
            <div class="post-header">
                <span>Написано: ${formatDate(post.createdAt)}</span>
                <span style="font-size: 0.75rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">версия: ${post.versions.length}</span>
            </div>
            
            <div class="post-content" id="content-${post.id}">${parseMarkdownImages(escapeHtml(currentText))}</div>
            
            <div class="hidden" id="edit-form-${post.id}" style="margin-top: 1rem;">
                <div style="margin-bottom: 8px;">
                    <input type="file" id="image-upload-${post.id}" accept="image/*" style="display:none" onchange="handleImageUpload(event, 'edit-text-${post.id}')">
                    <button type="button" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; border: 1px dashed var(--btn-border);" onclick="document.getElementById('image-upload-${post.id}').click()">📷 Загрузить фото</button>
                </div>
                <textarea id="edit-text-${post.id}">${escapeHtml(currentText)}</textarea>
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button class="btn-success" onclick="saveEditing(${post.id})">Сохранить</button>
                    <button class="btn-secondary" style="background: rgba(255,255,255,0.1);" onclick="cancelEditing(${post.id})">Отмена</button>
                </div>
            </div>
            
            ${historyLinks ? `<div style="margin-top: 1rem; font-size: 0.85rem; border-top: 1px solid var(--card-border); padding-top: 0.5rem; color: var(--text-muted);"><b style="color: white; margin-bottom: 5px; display: inline-block;">История версий (нажмите для просмотра):</b><br>${historyLinks}</div>` : ''}

            <div class="post-footer">
                <span>${post.updatedAt ? '✏️ Последнее изменение: ' + formatDate(post.updatedAt) : ''}</span>
            </div>

            <div class="edit-controls" id="controls-${post.id}">
                <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="startEditing(${post.id})">Редактировать</button>
                ${isEdited ? `<button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; color: var(--text-color);" onclick="revertToOriginal(${post.id})">Вернуться к 1 версии</button>` : ''}
                <button class="btn-danger" style="margin-left: auto; padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: var(--danger);" onclick="deletePost(${post.id})">Удалить</button>
            </div>
        `;

        postEl.innerHTML = html;
        postsContainer.appendChild(postEl);
    });
}

function showVersion(postId, versionIndex) {
    const post = posts.find(p => p.id === postId);
    if (!post || !post.versions[versionIndex]) return;
    
    document.getElementById(`content-${postId}`).innerHTML = parseMarkdownImages(escapeHtml(post.versions[versionIndex].text));
    
    const textarea = document.getElementById(`edit-text-${postId}`);
    if (textarea) {
        textarea.value = post.versions[versionIndex].text;
    }
}

function startEditing(id) {
    document.getElementById(`content-${id}`).classList.add('hidden');
    document.getElementById(`controls-${id}`).classList.add('hidden');
    document.getElementById(`edit-form-${id}`).classList.remove('hidden');
}

function cancelEditing(id) {
    document.getElementById(`edit-form-${id}`).classList.add('hidden');
    document.getElementById(`content-${id}`).classList.remove('hidden');
    if (isEditMode) {
        document.getElementById(`controls-${id}`).style.display = 'flex';
        document.getElementById(`controls-${id}`).classList.remove('hidden');
    }
}
